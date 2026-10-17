from app.ai_client import generate_text


def run_researcher(task) -> dict:
    prompt = f"""
You are the Researcher agent in TaskPilot.

Analyze the user's task. Identify:
- The main objective
- Important considerations and constraints
- Assumptions that need verification
- Potential challenges and risks

Do not claim to have searched the live internet.
Distinguish assumptions from established information.

Task title: {task.title}
Task description: {task.description}
"""

    fallback = (
        f"Objective: {task.title}\n"
        f"Task context: {task.description}\n"
        "Consider the requirements, available resources, constraints, "
        "assumptions, and potential risks before planning. "
        "Verify uncertain facts before acting."
    )

    return generate_text(prompt, fallback)


def run_planner(task, research: dict) -> dict:
    prompt = f"""
You are the Planner agent in TaskPilot.

Create a practical, ordered plan for the task.
Include:
- Clear action steps
- Expected outcome of each step
- Dependencies and required resources
- Risks and ways to reduce them
- A way to measure success

Base your plan on the research below. Do not invent facts.

Task: {task.title}
Description: {task.description}

Research:
{research["text"]}
"""

    fallback = (
        "1. Define the objective and success criteria.\n"
        "2. Validate the assumptions and requirements identified in research.\n"
        "3. List the required resources, dependencies, and constraints.\n"
        "4. Execute the work in priority order, validating each major step.\n"
        "5. Review risks and adjust the plan when new information appears.\n"
        "6. Measure the outcome against the original success criteria.\n\n"
        f"Task-specific context: {task.description}"
    )

    return generate_text(prompt, fallback)


def run_reviewer(task, research: dict, plan: dict) -> dict:
    prompt = f"""
You are the Reviewer agent in TaskPilot.

Review the proposed plan for:
- Missing steps
- Unaddressed risks
- Unsupported assumptions
- Dependencies and feasibility
- Measurable success criteria

Give an overall assessment and specific improvements.
Do not claim the plan was executed.

Task: {task.title}
Description: {task.description}

Research:
{research["text"]}

Plan:
{plan["text"]}
"""

    fallback = (
        "Review status: preliminary review completed.\n"
        "Check that every requirement is covered by an explicit step, "
        "dependencies are understood, assumptions are verified, and "
        "risks have mitigation plans. Define measurable success criteria "
        "before execution.\n\n"
        "Limitation: this is a rule-based development fallback, not an "
        "independent AI review."
    )

    return generate_text(prompt, fallback)