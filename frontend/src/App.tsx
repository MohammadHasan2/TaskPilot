
import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const AGENT_NAMES = ["researcher", "planner", "reviewer"] as const;

type AgentName = (typeof AGENT_NAMES)[number];

type AgentOutput = {
  text?: string;
  provider?: string;
  model?: string | null;
};

type AgentExecution = {
  id?: string;
  agent_name: string;
  status: string;
  output_text?: string | null;
  duration_ms?: number | null;
  provider?: string | null;
  model?: string | null;
  execution_order?: number;
};

type Report = {
  id?: string;
  report_content?: Record<string, AgentOutput>;
  summary?: string;
  created_at?: string;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  created_at: string;
  executions?: AgentExecution[];
  report?: Report | null;
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Keep the fallback message if the response is not JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function formatDuration(milliseconds?: number | null) {
  if (milliseconds == null) return "—";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClass(status?: string) {
  return (status || "pending").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function App() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [runningTask, setRunningTask] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Enter a task title.");
      return;
    }

    setCreatingTask(true);
    setError("");
    setNotice("");

    try {
      const task = await apiRequest<Task>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
        }),
      });

      setSelectedTask(task);
      setTitle("");
      setDescription("");
      setNotice("Task created. Run the workflow when you're ready.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the task.",
      );
    } finally {
      setCreatingTask(false);
    }
  }

  async function runWorkflow() {
    if (!selectedTask) return;

    setRunningTask(true);
    setError("");
    setNotice("");

    try {
      const updatedTask = await apiRequest<Task>(
        `/api/tasks/${encodeURIComponent(selectedTask.id)}/run`,
        { method: "POST" },
      );

      setSelectedTask(updatedTask);
      setNotice("All workflow results have been loaded.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Workflow execution failed.";

      setError(message);

      // Reload the current task to display any saved failure details.
      try {
        const updatedTask = await apiRequest<Task>(
          `/api/tasks/${encodeURIComponent(selectedTask.id)}`,
        );
        setSelectedTask(updatedTask);
      } catch {
        // Preserve the current task if its details cannot be reloaded.
      }
    } finally {
      setRunningTask(false);
    }
  }

  async function refreshCurrentTask() {
    if (!selectedTask) return;

    setRefreshing(true);
    setError("");

    try {
      const updatedTask = await apiRequest<Task>(
        `/api/tasks/${encodeURIComponent(selectedTask.id)}`,
      );
      setSelectedTask(updatedTask);
      setNotice("Task details refreshed.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not refresh this task.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  const executions = [...(selectedTask?.executions ?? [])].sort(
    (a, b) => (a.execution_order ?? 0) - (b.execution_order ?? 0),
  );

  const reportContent = selectedTask?.report?.report_content ?? {};

  const completedAgents = executions.filter(
    (execution) => execution.status.toLowerCase() === "completed",
  ).length;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <h1>TaskPilot</h1>
            <p>Workflow workspace</p>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <div className="workspace-nav-item active">
            <span className="nav-icon">◈</span>
            <span>Task workspace</span>
          </div>

          <div className="sidebar-divider" />

          <p className="sidebar-label">WORKFLOW</p>

          {AGENT_NAMES.map((name, index) => {
            const execution = executions.find(
              (item) => item.agent_name.toLowerCase() === name,
            );

            return (
              <div className="sidebar-agent" key={name}>
                <span className={`sidebar-agent-number agent-${name}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="sidebar-agent-copy">
                  <span>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                  <small>{execution?.status ?? "Waiting"}</small>
                </div>

                <span
                  className={`status-dot ${statusClass(execution?.status)}`}
                />
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <span className="connection-dot" />
          <span>TaskPilot API</span>
          <p>Multi-agent task orchestration</p>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">MULTI-AGENT WORKFLOW</p>
            <h2>Task workspace</h2>
            <p className="topbar-description">
              Turn a goal into a structured, reviewed action plan.
            </p>
          </div>

          {selectedTask && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void refreshCurrentTask()}
              disabled={refreshing || runningTask}
            >
              {refreshing ? "Refreshing..." : "Refresh task"}
            </button>
          )}
        </header>

        {error && (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="alert alert-success" role="status">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        <div className="workspace-grid">
          <section className="panel create-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">START HERE</p>
                <h3>Create a task</h3>
              </div>
              <span className="heading-icon">+</span>
            </div>

            <p className="panel-description">
              Describe your goal and let three specialized agents analyze,
              plan, and review the work.
            </p>

            <form onSubmit={createTask}>
              <label htmlFor="task-title">Task title</label>
              <input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Plan a product launch"
                maxLength={200}
                required
              />

              <label htmlFor="task-description">
                Description and context
              </label>
              <textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the goal, audience, constraints, and expected result..."
                rows={5}
              />

              <button
                className="button button-primary full-width"
                type="submit"
                disabled={creatingTask || runningTask}
              >
                {creatingTask ? "Creating task..." : "Create task"}
              </button>
            </form>
          </section>

          <section className="panel workflow-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">THE PROCESS</p>
                <h3>Three specialized agents</h3>
              </div>
            </div>

            <div className="workflow-steps">
              <div className="workflow-step">
                <div className="workflow-number">01</div>
                <div>
                  <h4>Researcher</h4>
                  <p>
                    Breaks down the task, identifies considerations, and
                    distinguishes known information from assumptions.
                  </p>
                </div>
              </div>

              <div className="step-connector" />

              <div className="workflow-step">
                <div className="workflow-number planner-number">02</div>
                <div>
                  <h4>Planner</h4>
                  <p>
                    Turns the analysis into prioritized, actionable steps.
                  </p>
                </div>
              </div>

              <div className="step-connector" />

              <div className="workflow-step">
                <div className="workflow-number reviewer-number">03</div>
                <div>
                  <h4>Reviewer</h4>
                  <p>
                    Checks completeness, risks, missing steps, and
                    opportunities to improve the plan.
                  </p>
                </div>
              </div>
            </div>

            <div className="workflow-note">
              Each agent builds on the previous agent's output. Execution
              results and the final report are persisted by the backend.
            </div>
          </section>
        </div>

        <section className="panel details-panel">
          {!selectedTask ? (
            <div className="empty-state">
              <div className="empty-icon">↗</div>
              <h3>Your workspace is ready</h3>
              <p>
                Create a task above to start a workflow. Its details and
                results will appear here; no shared task list is displayed.
              </p>
            </div>
          ) : (
            <>
              <div className="task-detail-header">
                <div className="task-heading-copy">
                  <p className="eyebrow">CURRENT TASK</p>
                  <h3>{selectedTask.title}</h3>
                  <p className="muted">
                    Created {formatDate(selectedTask.created_at)}
                  </p>
                </div>

                <div className="task-actions">
                  <span
                    className={`status-pill ${statusClass(selectedTask.status)}`}
                  >
                    {selectedTask.status}
                  </span>

                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => void runWorkflow()}
                    disabled={
                      runningTask ||
                      !["queued", "failed"].includes(
                        selectedTask.status.toLowerCase(),
                      )
                    }
                  >
                    {runningTask
                      ? "Running agents..."
                      : selectedTask.status.toLowerCase() === "completed"
                        ? "Workflow completed"
                        : selectedTask.status.toLowerCase() === "running"
                          ? "Workflow running"
                          : "Run workflow"}
                  </button>
                </div>
              </div>

              {selectedTask.description && (
                <div className="task-description">
                  <h4>Description</h4>
                  <p>{selectedTask.description}</p>
                </div>
              )}

              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Task status</span>
                  <strong className="stat-value">
                    {selectedTask.status}
                  </strong>
                  <span className="stat-caption">Current workflow state</span>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Agent executions</span>
                  <strong className="stat-value">{executions.length} / 3</strong>
                  <span className="stat-caption">Saved execution records</span>
                </div>

                <div className="stat-card">
                  <span className="stat-label">Completed agents</span>
                  <strong className="stat-value">{completedAgents}</strong>
                  <span className="stat-caption">Successful executions</span>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <p className="eyebrow">EXECUTION PIPELINE</p>
                  <h3>Agent activity</h3>
                </div>
              </div>

              <div className="agent-grid">
                {AGENT_NAMES.map((name, index) => {
                  const execution = executions.find(
                    (item) => item.agent_name.toLowerCase() === name,
                  );

                  const output = reportContent[name as AgentName];
                  const text =
                    typeof output?.text === "string"
                      ? output.text
                      : execution?.output_text ?? "";

                  return (
                    <article className="agent-card" key={name}>
                      <div className="agent-card-header">
                        <div className={`agent-avatar agent-avatar-${name}`}>
                          {String(index + 1).padStart(2, "0")}
                        </div>

                        <div className="agent-title">
                          <h4>
                            {name.charAt(0).toUpperCase() + name.slice(1)}
                          </h4>
                          <p>
                            {index === 0
                              ? "Task analysis"
                              : index === 1
                                ? "Action plan"
                                : "Quality review"}
                          </p>
                        </div>

                        <span
                          className={`status-pill ${statusClass(
                            execution?.status,
                          )}`}
                        >
                          {execution?.status ?? "pending"}
                        </span>
                      </div>

                      <div className="agent-metrics">
                        <span>
                          Duration: {formatDuration(execution?.duration_ms)}
                        </span>
                        {execution?.provider && (
                          <span>Provider: {execution.provider}</span>
                        )}
                        {execution?.model && (
                          <span>Model: {execution.model}</span>
                        )}
                      </div>

                      <div className="agent-output">
                        {text.trim() ? (
                          <MarkdownContent content={text} />
                        ) : (
                          <p className="muted">
                            The agent's output will appear here when it runs.
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="section-heading report-heading">
                <div>
                  <p className="eyebrow">FINAL OUTPUT</p>
                  <h3>Reviewed report</h3>
                </div>

                {selectedTask.report && (
                  <span className="report-indicator">
                    <span className="connection-dot" />
                    Saved report
                  </span>
                )}
              </div>

              {selectedTask.report ? (
                <div className="report-content">
                  {selectedTask.report.summary && (
                    <div className="report-summary">
                      <h4>Summary</h4>
                      <MarkdownContent
                        content={selectedTask.report.summary}
                      />
                    </div>
                  )}

                  <div className="report-agent-outputs">
                    {AGENT_NAMES.map((name) => {
                      const output = reportContent[name];
                      const text =
                        typeof output?.text === "string" ? output.text : "";

                      if (!text.trim()) return null;

                      return (
                        <section
                          className="report-agent-section"
                          key={name}
                        >
                          <h4>
                            {name.charAt(0).toUpperCase() + name.slice(1)}
                          </h4>
                          <MarkdownContent content={text} />
                        </section>
                      );
                    })}
                  </div>

                  {!AGENT_NAMES.some((name) =>
                    reportContent[name]?.text?.trim(),
                  ) && (
                    <p className="muted">
                      The report exists, but no readable agent output was
                      found in its content.
                    </p>
                  )}
                </div>
              ) : (
                <div className="report-empty">
                  The reviewed report will appear here after the workflow
                  completes.
                </div>
              )}
            </>
          )}
        </section>

        <footer className="page-footer">
          <span>TaskPilot</span>
          <span>Multi-agent orchestration · Persistent execution history</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
