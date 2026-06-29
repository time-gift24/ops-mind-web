import asyncio

from langchain_core.messages import AIMessageChunk

from app.deepagents_runtime import (
    build_sop_agent_input,
    event_stream_to_core_events,
    iter_deepagent_events,
    resolve_runtime,
)


async def fake_deepagent_events():
    yield {
        "event": "on_tool_start",
        "name": "write_todos",
        "run_id": "run-plan",
        "data": {
            "input": {
                "todos": [
                    {"content": "收集 SOP 上下文", "status": "in_progress"},
                    {"content": "识别风险点", "status": "pending"},
                ]
            }
        },
    }
    yield {
        "event": "on_tool_start",
        "name": "task",
        "run_id": "run-task",
        "data": {
            "input": {
                "description": "检查回滚、监控和风险等级",
                "subagent_type": "sre-sop-reviewer",
            }
        },
    }
    yield {
        "event": "on_tool_start",
        "name": "sop_context_loader",
        "run_id": "run-tool",
        "data": {"input": {"env": "production", "sop_id": "SOP-1"}},
    }
    yield {
        "event": "on_chat_model_stream",
        "data": {"chunk": AIMessageChunk(content="质检中")},
    }
    yield {
        "event": "on_tool_end",
        "name": "sop_context_loader",
        "run_id": "run-tool",
        "data": {"output": {"context_loaded": True}},
    }
    yield {
        "event": "on_tool_end",
        "name": "task",
        "run_id": "run-task",
        "data": {"output": "子代理完成"},
    }


async def fake_v3_deepagent_events():
    yield {
        "type": "event",
        "method": "messages",
        "params": {
            "data": (
                {"event": "content-block-start", "content": {"type": "text", "text": "开始"}},
                {},
            )
        },
    }
    yield {
        "type": "event",
        "method": "messages",
        "params": {
            "data": (
                {
                    "event": "content-block-delta",
                    "delta": {"type": "text-delta", "text": "质检"},
                },
                {},
            )
        },
    }
    yield {
        "type": "event",
        "method": "tools",
        "params": {
            "data": {
                "event": "tool-started",
                "tool_call_id": "v3-plan",
                "tool_name": "write_todos",
                "input": {
                    "todos": [
                        {"content": "加载 SOP 上下文", "status": "in_progress"}
                    ]
                },
            }
        },
    }
    yield {
        "type": "event",
        "method": "tools",
        "params": {
            "data": {
                "event": "tool-finished",
                "tool_call_id": "v3-plan",
                "output": "updated",
            }
        },
    }
    yield {
        "type": "event",
        "method": "tools",
        "params": {
            "data": {
                "event": "tool-started",
                "tool_call_id": "v3-task",
                "tool_name": "task",
                "input": {
                    "description": "复核风险",
                    "subagent_type": "sre-sop-reviewer",
                },
            }
        },
    }


def test_event_stream_to_core_events_maps_deepagent_events() -> None:
    async def collect_events():
        return [
            event
            async for event in event_stream_to_core_events(
                thread_id="deep-thread",
                events=fake_deepagent_events(),
            )
        ]

    events = asyncio.run(collect_events())

    event_types = [event.type for event in events]
    assert event_types == [
        "plan",
        "tool_call",
        "tool_call",
        "sub_agent",
        "task",
        "tool_call",
        "text_delta",
        "tool_call",
        "tool_call",
        "sub_agent",
        "task",
    ]

    plan = events[0]
    assert plan.data.title == "SOP 质检计划"
    assert [step.title for step in plan.data.steps] == [
        "收集 SOP 上下文",
        "识别风险点",
    ]

    sub_agent = events[3]
    assert sub_agent.data.agent_name == "sre-sop-reviewer"
    assert sub_agent.data.current_node == "start"

    task = events[4]
    assert task.data.title == "检查回滚、监控和风险等级"
    assert task.data.status == "running"

    text = events[6]
    assert text.delta == "质检中"

    tool_finish = events[7]
    assert tool_finish.data.status == "finish"
    assert tool_finish.data.result == {"context_loaded": True}


def test_event_stream_to_core_events_maps_v3_deepagent_events() -> None:
    async def collect_events():
        return [
            event
            async for event in event_stream_to_core_events(
                thread_id="v3-thread",
                events=fake_v3_deepagent_events(),
            )
        ]

    events = asyncio.run(collect_events())

    event_types = [event.type for event in events]
    assert event_types == [
        "text_delta",
        "text_delta",
        "plan",
        "tool_call",
        "tool_call",
        "tool_call",
        "sub_agent",
        "task",
    ]
    assert events[0].delta == "开始"
    assert events[1].delta == "质检"
    assert events[2].data.steps[0].title == "加载 SOP 上下文"
    assert events[4].data.tool_name == "write_todos"
    assert events[4].data.status == "finish"
    assert events[6].data.agent_name == "sre-sop-reviewer"


def test_resolve_runtime_prefers_deepagents_when_key_exists(monkeypatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "secret")
    monkeypatch.delenv("AI_STREAM_RUNTIME", raising=False)

    assert resolve_runtime() == "deepagents"


def test_resolve_runtime_uses_mock_without_key(monkeypatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("AI_STREAM_RUNTIME", raising=False)

    assert resolve_runtime() == "mock"


def test_build_sop_agent_input_contains_real_env_and_sop_id() -> None:
    agent_input = build_sop_agent_input(env="staging", sop_id="SOP-20260629-001")

    message_text = agent_input["messages"][0].content
    assert "staging" in message_text
    assert "SOP-20260629-001" in message_text
    assert "sop_context_loader" in message_text
    assert "sre-sop-reviewer" in message_text


def test_iter_deepagent_events_accepts_awaitable_event_stream() -> None:
    class FakeAgent:
        async def astream_events(self, *args, **kwargs):
            return fake_deepagent_events()

    async def collect_events():
        return [
            event
            async for event in iter_deepagent_events(
                thread_id="awaitable-thread",
                agent=FakeAgent(),
                agent_input={"messages": []},
            )
        ]

    events = asyncio.run(collect_events())

    assert [event.type for event in events][:2] == ["plan", "tool_call"]
