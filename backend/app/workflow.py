
from datetime import datetime, timezone
from time import perf_counter

from sqlalchemy import select

from app.agents import run_planner, run_researcher, run_reviewer
from app.models import AgentExecution, Report, Task


def utc_now():
    return datetime.now(timezone.utc)


class WorkflowExecutionError(Exception):
    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        super().__init__(f"The {agent_name} agent failed.")


def execute_task_workflow(task: Task, db) -> Task:
    if task.status not in ("queued", "failed"):
        raise ValueError("Only queued or failed tasks can be executed.")

    task.status = "running"
    task.updated_at = utc_now()
    db.commit()

    outputs = {}

    steps = [
        (
            "researcher",
            1,
            lambda: run_researcher(task),
            lambda: {
                "title": task.title,
                "description": task.description,
            },
        ),
        (
            "planner",
            2,
            lambda: run_planner(task, outputs["researcher"]),
            lambda: {"research": outputs["researcher"]["text"]},
        ),
        (
            "reviewer",
            3,
            lambda: run_reviewer(
                task, outputs["researcher"], outputs["planner"]
            ),
            lambda: {
                "research": outputs["researcher"]["text"],
                "plan": outputs["planner"]["text"],
            },
        ),
    ]

    for agent_name, order, run_agent, build_input in steps:
        execution = db.scalar(
            select(AgentExecution).where(
                AgentExecution.task_id == task.id,
                AgentExecution.execution_order == order,
            )
        )

        if execution is None:
            execution = AgentExecution(
                task_id=task.id,
                agent_name=agent_name,
                execution_order=order,
                status="running",
                input_data=build_input(),
                started_at=utc_now(),
            )
            db.add(execution)
        else:
            execution.agent_name = agent_name
            execution.status = "running"
            execution.input_data = build_input()
            execution.output_data = None
            execution.error_message = None
            execution.started_at = utc_now()
            execution.finished_at = None
            execution.duration_ms = None

        db.commit()
        db.refresh(execution)

        started = perf_counter()

        try:
            result = run_agent()

            if not result.get("text"):
                raise RuntimeError("Agent returned empty output.")

            execution.output_data = result
            execution.status = "completed"

        except Exception as exc:
            db.rollback()

            execution = db.scalar(
                select(AgentExecution).where(
                    AgentExecution.task_id == task.id,
                    AgentExecution.execution_order == order,
                )
            )

            if execution is not None:
                execution.status = "failed"
                execution.error_message = (
                    f"{type(exc).__name__}: {str(exc)[:500]}"
                )
                execution.finished_at = utc_now()
                execution.duration_ms = max(
                    0, int((perf_counter() - started) * 1000)
                )

            task.status = "failed"
            task.updated_at = utc_now()
            db.commit()

            raise WorkflowExecutionError(agent_name) from exc

        execution.finished_at = utc_now()
        execution.duration_ms = max(
            0, int((perf_counter() - started) * 1000)
        )

        outputs[agent_name] = result
        db.commit()

    report = db.scalar(
        select(Report).where(Report.task_id == task.id)
    )

    if report is None:
        report = Report(
            task_id=task.id,
            summary=outputs["reviewer"]["text"],
            report_content=outputs,
        )
        db.add(report)
    else:
        report.summary = outputs["reviewer"]["text"]
        report.report_content = outputs

    task.status = "completed"
    task.updated_at = utc_now()

    db.commit()
    db.refresh(task)

    return task
