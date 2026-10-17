
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router as tasks_router

app = FastAPI(
    title="TaskPilot API",
    description="A multi-agent workflow orchestration platform.",
    version="0.1.0",
)

# Allow the local React frontend to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://taskpilot.taskpilot.workers.dev/",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "taskpilot-api",
        "version": "0.1.0",
    }


app.include_router(tasks_router)
