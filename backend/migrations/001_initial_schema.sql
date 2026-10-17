CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tasks_title_not_empty
        CHECK (length(trim(title)) > 0),

    CONSTRAINT tasks_status_valid
        CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

CREATE INDEX idx_tasks_created_at
    ON tasks (created_at DESC);

CREATE INDEX idx_tasks_status
    ON tasks (status);


CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_name VARCHAR(50) NOT NULL,
    execution_order SMALLINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT agent_name_not_empty
        CHECK (length(trim(agent_name)) > 0),

    CONSTRAINT execution_order_positive
        CHECK (execution_order > 0),

    CONSTRAINT execution_status_valid
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),

    CONSTRAINT execution_duration_nonnegative
        CHECK (duration_ms IS NULL OR duration_ms >= 0),

    CONSTRAINT unique_task_execution_order
        UNIQUE (task_id, execution_order)
);

CREATE INDEX idx_agent_executions_task_id
    ON agent_executions (task_id);


CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    report_content JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);