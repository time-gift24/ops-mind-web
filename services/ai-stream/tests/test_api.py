import json

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessageChunk

from app.events import StreamEnvelope
from app.main import app


def test_health_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_dispatch_returns_thread_id() -> None:
    client = TestClient(app)

    response = client.post(
        "/v1/apis/sop",
        json={"env": "dev", "sop_id": "sop-test"},
    )

    assert response.status_code == 201
    assert response.json()["thread_id"]


def test_sse_mock_stream_outputs_valid_envelopes(monkeypatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    client = TestClient(app)

    with client.stream("GET", "/v1/apis/sse/test-thread") as response:
        assert response.status_code == 200
        body = response.read().decode()
        frames = [
            block
            for block in body.split("\n\n")
            if block.startswith("event: ")
        ]

    assert [frame.splitlines()[0].removeprefix("event: ") for frame in frames] == [
        "message_start",
        "text_delta",
        "text_delta",
        "text_delta",
        "finish",
    ]

    for expected_seq, frame in enumerate(frames):
        data_line = next(line for line in frame.splitlines() if line.startswith("data: "))
        envelope = StreamEnvelope.model_validate_json(data_line.removeprefix("data: "))
        assert envelope.thread_id == "test-thread"
        assert envelope.seq == expected_seq
        assert envelope.event_type == envelope.payload["type"]


def test_chat_stream_accepts_messages_and_outputs_valid_envelopes(monkeypatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    client = TestClient(app)

    with client.stream(
        "POST",
        "/v1/apis/chat/stream",
        json={
            "thread_id": "chat-thread",
            "messages": [
                {"role": "system", "content": "你是一个测试助手。"},
                {"role": "user", "content": "打个招呼"},
            ],
        },
    ) as response:
        assert response.status_code == 200
        body = response.read().decode()
        frames = [
            block
            for block in body.split("\n\n")
            if block.startswith("event: ")
        ]

    assert [frame.splitlines()[0].removeprefix("event: ") for frame in frames] == [
        "message_start",
        "text_delta",
        "text_delta",
        "finish",
    ]

    for expected_seq, frame in enumerate(frames):
        data_line = next(line for line in frame.splitlines() if line.startswith("data: "))
        envelope = StreamEnvelope.model_validate_json(data_line.removeprefix("data: "))
        assert envelope.thread_id == "chat-thread"
        assert envelope.seq == expected_seq
        assert envelope.event_type == envelope.payload["type"]


def test_chat_stream_accepts_prompt_without_thread_id(monkeypatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    client = TestClient(app)

    with client.stream(
        "POST",
        "/v1/apis/chat/stream",
        json={"prompt": "说一句测试文本"},
    ) as response:
        assert response.status_code == 200
        body = response.read().decode()

    first_data_line = next(
        line for line in body.splitlines() if line.startswith("data: ")
    )
    envelope = StreamEnvelope.model_validate_json(first_data_line.removeprefix("data: "))
    assert envelope.thread_id
    assert envelope.payload["type"] == "message_start"


def test_sop_stream_accepts_env_and_sop_id(monkeypatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    client = TestClient(app)

    with client.stream(
        "POST",
        "/v1/apis/sop/stream",
        json={
            "thread_id": "sop-thread",
            "env": "staging",
            "sop_id": "SOP-20260628-001",
        },
    ) as response:
        assert response.status_code == 200
        body = response.read().decode()
        frames = [
            block
            for block in body.split("\n\n")
            if block.startswith("event: ")
        ]

    event_types = [frame.splitlines()[0].removeprefix("event: ") for frame in frames]
    assert event_types[0] == "message_start"
    assert event_types[-1] == "finish"
    assert "text_delta" in event_types

    deltas: list[str] = []
    for expected_seq, frame in enumerate(frames):
        data_line = next(line for line in frame.splitlines() if line.startswith("data: "))
        envelope = StreamEnvelope.model_validate_json(data_line.removeprefix("data: "))
        assert envelope.thread_id == "sop-thread"
        assert envelope.seq == expected_seq
        assert envelope.event_type == envelope.payload["type"]
        if envelope.event_type == "text_delta":
            deltas.append(envelope.payload["delta"])

    rendered_text = "".join(deltas)
    assert "staging" in rendered_text
    assert "SOP-20260628-001" in rendered_text


def test_sop_stream_emits_structured_plan_subagent_task_and_tool_events(
    monkeypatch,
) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    client = TestClient(app)

    with client.stream(
        "POST",
        "/v1/apis/sop/stream",
        json={
            "thread_id": "structured-thread",
            "env": "production",
            "sop_id": "SOP-STRUCTURED-001",
        },
    ) as response:
        assert response.status_code == 200
        body = response.read().decode()

    envelopes = [
        StreamEnvelope.model_validate_json(
            next(line for line in frame.splitlines() if line.startswith("data: ")).removeprefix("data: ")
        )
        for frame in body.split("\n\n")
        if frame.startswith("event: ")
    ]
    event_types = [envelope.event_type for envelope in envelopes]

    assert "plan" in event_types
    assert "sub_agent" in event_types
    assert "task" in event_types
    assert "tool_call" in event_types
    assert event_types.index("plan") < event_types.index("text_delta")

    plan_payload = next(
        envelope.payload for envelope in envelopes if envelope.event_type == "plan"
    )
    assert plan_payload["data"]["title"] == "SOP 质检计划"
    assert [step["status"] for step in plan_payload["data"]["steps"]] == [
        "running",
        "pending",
        "pending",
    ]

    sub_agent_payload = next(
        envelope.payload for envelope in envelopes if envelope.event_type == "sub_agent"
    )
    assert sub_agent_payload["data"]["agent_name"] == "sre-sop-reviewer"
    assert sub_agent_payload["data"]["current_node"] == "collect_context"

    task_payload = next(
        envelope.payload for envelope in envelopes if envelope.event_type == "task"
    )
    assert task_payload["data"]["title"] == "收集 SOP 上下文"
    assert "production" in task_payload["data"]["items"]
    assert "SOP-STRUCTURED-001" in task_payload["data"]["items"]

    tool_payload = next(
        envelope.payload for envelope in envelopes if envelope.event_type == "tool_call"
    )
    assert tool_payload["data"]["status"] == "finish"
    assert tool_payload["data"]["tool_name"] == "sop_context_loader"


def test_sop_stream_uses_deepagents_runtime_events(monkeypatch) -> None:
    monkeypatch.setenv("AI_STREAM_RUNTIME", "deepagents")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "secret")

    class FakeAgent:
        async def astream_events(self, agent_input, **kwargs):
            prompt = agent_input["messages"][0].content
            assert "production" in prompt
            assert "SOP-DEEPAGENT-001" in prompt
            yield {
                "event": "on_tool_start",
                "name": "write_todos",
                "run_id": "plan-run",
                "data": {
                    "input": {
                        "todos": [
                            {
                                "content": "调用真实 Deep Agent 计划工具",
                                "status": "in_progress",
                            }
                        ]
                    }
                },
            }
            yield {
                "event": "on_tool_start",
                "name": "sop_context_loader",
                "run_id": "tool-run",
                "data": {
                    "input": {
                        "env": "production",
                        "sop_id": "SOP-DEEPAGENT-001",
                    }
                },
            }
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": AIMessageChunk(content="真实 agent 文本")},
            }
            yield {
                "event": "on_tool_end",
                "name": "sop_context_loader",
                "run_id": "tool-run",
                "data": {"output": {"context_loaded": True}},
            }

    monkeypatch.setattr("app.main.create_sop_deep_agent", lambda: FakeAgent())
    client = TestClient(app)

    with client.stream(
        "POST",
        "/v1/apis/sop/stream",
        json={
            "thread_id": "deepagent-thread",
            "env": "production",
            "sop_id": "SOP-DEEPAGENT-001",
        },
    ) as response:
        assert response.status_code == 200
        body = response.read().decode()

    envelopes = [
        StreamEnvelope.model_validate_json(
            next(
                line for line in frame.splitlines() if line.startswith("data: ")
            ).removeprefix("data: ")
        )
        for frame in body.split("\n\n")
        if frame.startswith("event: ")
    ]

    event_types = [envelope.event_type for envelope in envelopes]
    assert event_types[0] == "message_start"
    assert "plan" in event_types
    assert "tool_call" in event_types
    assert "text_delta" in event_types
    assert event_types[-1] == "finish"

    assert envelopes[0].payload["state"]["runtime"] == "deepagents"
    assert next(
        envelope.payload["delta"]
        for envelope in envelopes
        if envelope.event_type == "text_delta"
    ) == "真实 agent 文本"
    tool_payloads = [
        envelope.payload for envelope in envelopes if envelope.event_type == "tool_call"
    ]
    assert any(
        payload["data"]["tool_name"] == "sop_context_loader"
        and payload["data"]["status"] == "finish"
        for payload in tool_payloads
    )
