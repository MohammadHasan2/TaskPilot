from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_list_tasks_returns_200():
    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_missing_task_returns_404():
    from unittest.mock import MagicMock
    from app.database import get_db

    def override_get_db():
        fake_db = MagicMock()
        fake_db.scalar.return_value = None
        yield fake_db

    app.dependency_overrides[get_db] = override_get_db

    try:
        response = client.get(
            "/api/tasks/00000000-0000-0000-0000-000000000000"
        )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 404
    assert response.json()["detail"] == "Task not found."

def test_create_task_rejects_blank_title():
    response = client.post(
        "/api/tasks",
        json={
            "title": "   ",
            "description": "Research the market and create a plan.",
        },
    )

    assert response.status_code == 422

def test_health_check():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "taskpilot-api",
        "version": "0.1.0",
    }
