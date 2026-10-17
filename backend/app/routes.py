import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Task
from app.schemas import TaskCreate, TaskDetail, TaskRead
from app.workflow import WorkflowExecutionError, execute_task_workflow

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.post(
    "",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
):
    task = Task(
        title=payload.title,
        description=payload.description,
        status="queued",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("", response_model=list[TaskRead])
def list_tasks(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    statement = (
        select(Task)
        .order_by(Task.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return db.scalars(statement).all()


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    statement = (
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.executions),
            selectinload(Task.report),
        )
    )
    task = db.scalar(statement)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    return task


@router.post("/{task_id}/run", response_model=TaskDetail)
def run_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    if task.status not in ("queued", "failed"):
        raise HTTPException(
            status_code=409,
            detail="Only queued or failed tasks can be executed.",
        )

    try:
        execute_task_workflow(task, db)
    except WorkflowExecutionError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"The {exc.agent_name} agent failed. "
                "Check the saved execution history."
            ),
        ) from exc

    # Reload relationships so the response includes the latest
    # executions and report written by the workflow.
    db.expire_all()

    statement = (
        select(Task)
        .where(Task.id == task_id)
        .options(
            selectinload(Task.executions),
            selectinload(Task.report),
        )
    )
    return db.scalar(statement)
