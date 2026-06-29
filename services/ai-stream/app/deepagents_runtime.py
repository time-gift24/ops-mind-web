import os
import inspect
from collections.abc import AsyncIterator, Mapping
from typing import Any, Literal

from deepagents import create_deep_agent
from deepagents.middleware.subagents import SubAgent
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.tools import tool
from langchain_deepseek import ChatDeepSeek

from app.events import (
    BaseCoreEvent,
    PlanData,
    PlanEvent,
    PlanStepData,
    ReasoningDeltaEvent,
    SubAgentData,
    SubAgentEvent,
    TaskData,
    TaskEvent,
    TextDeltaEvent,
    ToolCallData,
    ToolCallEvent,
)

RuntimeName = Literal["deepagents", "deepseek", "mock"]

SOP_SYSTEM_PROMPT = """
你是一个严谨的 SRE SOP 质检 coordinator。

执行 SOP 质检时必须按顺序完成：
1. 使用 write_todos 写出质检计划。
2. 调用 sop_context_loader，参数必须包含用户请求里的 env 和 sop_id。
3. 使用 task 委派给 sre-sop-reviewer 子代理检查回滚、监控、风险等级。
4. 最终用中文输出结构化质检结果，必须包含：检查对象、关键检查项、风险点、
   风险等级、结论、后续建议。

如果缺少真实监控数据，要明确说明假设，并给出需要补充的数据。
""".strip()

SRE_SUBAGENT_PROMPT = """
你是 sre-sop-reviewer，专门审查 SOP 执行风险。
重点检查执行完整性、监控指标、告警影响、回滚策略、审计记录和后续建议。
输出要短而结构化，给 coordinator 可直接引用的风险结论。
""".strip()

CHAT_SYSTEM_PROMPT = """
你是 ops-mind 的 AI 运维助手。请结合用户已有上下文，用中文给出简洁、
可执行的回答。需要时可以列出风险、检查步骤和后续建议。
""".strip()


def resolve_runtime() -> RuntimeName:
    configured = os.getenv("AI_STREAM_RUNTIME", "auto").strip().lower()
    if configured in {"deepagents", "deepseek", "mock"}:
        return configured  # type: ignore[return-value]
    if configured != "auto":
        return "mock"
    return "deepagents" if os.getenv("DEEPSEEK_API_KEY") else "mock"


@tool
def sop_context_loader(env: str, sop_id: str) -> dict[str, Any]:
    """Load local test context for a SOP quality check."""
    return {
        "context_loaded": True,
        "env": env,
        "sop_id": sop_id,
        "required_sections": [
            "检查对象",
            "关键检查项",
            "风险点",
            "风险等级",
            "结论",
            "后续建议",
        ],
        "available_evidence": [
            "SOP 编号",
            "目标环境",
            "测试上下文",
        ],
        "missing_evidence": [
            "真实执行日志",
            "变更审计记录",
            "执行前后监控指标",
            "回滚演练结果",
        ],
    }


def build_deepseek_model() -> ChatDeepSeek:
    return ChatDeepSeek(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        api_key=os.environ["DEEPSEEK_API_KEY"],
        streaming=True,
    )


def build_sop_agent_input(env: str, sop_id: str) -> dict[str, list[BaseMessage]]:
    return {
        "messages": [
            HumanMessage(
                content=(
                    f"请对 {env} 环境的 SOP {sop_id} 做一次执行质检。"
                    "请先调用 write_todos 生成计划，再调用 sop_context_loader "
                    f"并传入 env={env}、sop_id={sop_id}，然后通过 task 委派 "
                    "sre-sop-reviewer 子代理复核风险，最后输出完整质检结论。"
                )
            )
        ]
    }


def build_chat_agent_input(messages: list[BaseMessage]) -> dict[str, list[BaseMessage]]:
    if messages:
        return {"messages": messages}
    return {"messages": [HumanMessage(content="请用中文简单打个招呼。")]}


def create_sop_deep_agent():
    model = build_deepseek_model()
    subagents: list[SubAgent] = [
        {
            "name": "sre-sop-reviewer",
            "description": "复核 SOP 执行风险、监控、回滚和审计要求。",
            "system_prompt": SRE_SUBAGENT_PROMPT,
            "tools": [sop_context_loader],
            "model": model,
        }
    ]
    return create_deep_agent(
        model=model,
        tools=[sop_context_loader],
        subagents=subagents,
        system_prompt=SOP_SYSTEM_PROMPT,
        name="sop-quality-agent",
    )


def create_chat_deep_agent():
    return create_deep_agent(
        model=build_deepseek_model(),
        tools=[],
        system_prompt=CHAT_SYSTEM_PROMPT,
        name="ops-chat-agent",
    )


async def iter_deepagent_events(
    thread_id: str,
    agent: Any,
    agent_input: dict[str, Any],
) -> AsyncIterator[BaseCoreEvent]:
    raw_events = agent.astream_events(
        agent_input,
        config={"configurable": {"thread_id": thread_id}},
        version="v3",
    )
    if inspect.isawaitable(raw_events):
        raw_events = await raw_events
    async for event in event_stream_to_core_events(thread_id, raw_events):
        yield event


async def event_stream_to_core_events(
    thread_id: str,
    events: AsyncIterator[Mapping[str, Any]],
) -> AsyncIterator[BaseCoreEvent]:
    v3_tool_names: dict[str, str] = {}
    async for raw_event in events:
        if raw_event.get("type") == "event":
            async for event in _v3_event_to_core_events(
                thread_id,
                raw_event,
                v3_tool_names,
            ):
                yield event
            continue

        event_name = _as_str(raw_event.get("event"))
        name = _as_str(raw_event.get("name"))
        data = _as_mapping(raw_event.get("data"))
        run_id = _as_str(raw_event.get("run_id"), fallback=name or "call")

        if event_name == "on_chat_model_stream":
            chunk = data.get("chunk")
            reasoning = _extract_reasoning(chunk)
            if reasoning:
                yield ReasoningDeltaEvent(thread_id=thread_id, delta=reasoning)
            text = _extract_text(chunk)
            if text:
                yield TextDeltaEvent(thread_id=thread_id, delta=text)
            continue

        if event_name == "on_tool_start" and name:
            tool_input = _json_safe(data.get("input"))
            if name == "write_todos":
                plan = _plan_from_todos(thread_id, tool_input)
                if plan is not None:
                    yield plan
            yield ToolCallEvent(
                thread_id=thread_id,
                content=f"{name} started",
                data=ToolCallData(
                    status="start",
                    tool_name=name,
                    arguments=tool_input if isinstance(tool_input, dict) else None,
                    call_id=run_id,
                ),
            )
            if name == "task":
                for semantic_event in _task_start_events(thread_id, run_id, tool_input):
                    yield semantic_event
            continue

        if event_name == "on_tool_end" and name:
            output = _json_safe(data.get("output"))
            yield ToolCallEvent(
                thread_id=thread_id,
                content=f"{name} finished",
                data=ToolCallData(
                    status="finish",
                    tool_name=name,
                    call_id=run_id,
                    result=output,
                ),
            )
            if name == "task":
                for semantic_event in _task_finish_events(thread_id, run_id, output):
                    yield semantic_event
            continue

        if event_name == "on_tool_error" and name:
            error_text = _as_str(data.get("error"), fallback="tool error")
            yield ToolCallEvent(
                thread_id=thread_id,
                content=error_text,
                data=ToolCallData(
                    status="error",
                    tool_name=name,
                    call_id=run_id,
                    error_text=error_text,
                ),
            )


async def _v3_event_to_core_events(
    thread_id: str,
    raw_event: Mapping[str, Any],
    tool_names: dict[str, str],
) -> AsyncIterator[BaseCoreEvent]:
    method = _as_str(raw_event.get("method"))
    params = _as_mapping(raw_event.get("params"))
    data = params.get("data")

    if method == "messages":
        protocol_event = _v3_protocol_message(data)
        if protocol_event is None:
            return
        event_name = _as_str(protocol_event.get("event"))
        if event_name == "content-block-start":
            content = _as_mapping(protocol_event.get("content"))
            if content.get("type") == "text":
                text = _as_str(content.get("text"))
                if text:
                    yield TextDeltaEvent(thread_id=thread_id, delta=text)
            return
        if event_name == "content-block-delta":
            delta = _as_mapping(protocol_event.get("delta"))
            fields = _as_mapping(delta.get("fields"))
            text = _as_str(delta.get("text")) or _as_str(fields.get("text"))
            if text:
                yield TextDeltaEvent(thread_id=thread_id, delta=text)
            return

    if method != "tools":
        return

    tool_event = _as_mapping(data)
    event_name = _as_str(tool_event.get("event"))
    call_id = _as_str(tool_event.get("tool_call_id"), fallback="tool-call")

    if event_name == "tool-started":
        name = _as_str(tool_event.get("tool_name"), fallback="tool")
        tool_names[call_id] = name
        tool_input = _json_safe(tool_event.get("input"))
        if name == "write_todos":
            plan = _plan_from_todos(thread_id, tool_input)
            if plan is not None:
                yield plan
        yield ToolCallEvent(
            thread_id=thread_id,
            content=f"{name} started",
            data=ToolCallData(
                status="start",
                tool_name=name,
                arguments=tool_input if isinstance(tool_input, dict) else None,
                call_id=call_id,
            ),
        )
        if name == "task":
            for semantic_event in _task_start_events(thread_id, call_id, tool_input):
                yield semantic_event
        return

    if event_name == "tool-finished":
        output = tool_event.get("output")
        name = _as_str(
            tool_event.get("tool_name") or getattr(output, "name", None),
            fallback=tool_names.get(call_id, "tool"),
        )
        result = _json_safe(output)
        yield ToolCallEvent(
            thread_id=thread_id,
            content=f"{name} finished",
            data=ToolCallData(
                status="finish",
                tool_name=name,
                call_id=call_id,
                result=result,
            ),
        )
        if name == "task":
            for semantic_event in _task_finish_events(thread_id, call_id, result):
                yield semantic_event
        return

    if event_name == "tool-error":
        name = _as_str(tool_event.get("tool_name"), fallback="tool")
        error_text = _as_str(tool_event.get("error"), fallback="tool error")
        yield ToolCallEvent(
            thread_id=thread_id,
            content=error_text,
            data=ToolCallData(
                status="error",
                tool_name=name,
                call_id=call_id,
                error_text=error_text,
            ),
        )


def _v3_protocol_message(value: Any) -> Mapping[str, Any] | None:
    if not isinstance(value, tuple) or not value:
        return None
    message = value[0]
    return message if isinstance(message, Mapping) else None


def _plan_from_todos(thread_id: str, value: Any) -> PlanEvent | None:
    if not isinstance(value, dict):
        return None
    todos = value.get("todos")
    if not isinstance(todos, list) or not todos:
        return None

    steps: list[PlanStepData] = []
    for index, item in enumerate(todos, start=1):
        if not isinstance(item, dict):
            continue
        title = _as_str(
            item.get("content") or item.get("title") or item.get("task"),
            fallback=f"步骤 {index}",
        )
        status = _normalize_status(
            _as_str(item.get("status"), fallback="pending")
        )
        steps.append(
            PlanStepData(
                step_id=_as_str(item.get("id"), fallback=f"step-{index}"),
                title=title,
                status=status,
                description=_as_str(item.get("description")),
            )
        )

    if not steps:
        return None
    return PlanEvent(
        thread_id=thread_id,
        content="Deep Agent 已生成 SOP 质检计划",
        metadata={"runtime": "deepagents", "source": "write_todos"},
        data=PlanData(
            plan_id=f"plan-{thread_id}",
            title="SOP 质检计划",
            description="由 Deep Agent write_todos 工具生成",
            status="running",
            steps=steps,
        ),
    )


def _task_start_events(
    thread_id: str,
    run_id: str,
    tool_input: Any,
) -> list[BaseCoreEvent]:
    if not isinstance(tool_input, dict):
        tool_input = {}
    agent_name = _as_str(tool_input.get("subagent_type"), fallback="subagent")
    description = _as_str(tool_input.get("description"), fallback="子代理任务")
    return [
        SubAgentEvent(
            thread_id=thread_id,
            content=f"Deep Agent 调用子代理 {agent_name}",
            metadata={"runtime": "deepagents", "source": "task"},
            data=SubAgentData(
                agent_name=agent_name,
                current_node="start",
                input_payload=tool_input,
            ),
        ),
        TaskEvent(
            thread_id=thread_id,
            content=description,
            metadata={"runtime": "deepagents", "source": "task"},
            data=TaskData(
                task_id=run_id,
                title=description,
                status="running",
                input_payload=tool_input,
            ),
        ),
    ]


def _task_finish_events(
    thread_id: str,
    run_id: str,
    output: Any,
) -> list[BaseCoreEvent]:
    return [
        SubAgentEvent(
            thread_id=thread_id,
            content="Deep Agent 子代理已完成",
            metadata={"runtime": "deepagents", "source": "task"},
            data=SubAgentData(
                agent_name="sre-sop-reviewer",
                current_node="finish",
                output_payload=output,
            ),
        ),
        TaskEvent(
            thread_id=thread_id,
            content="子代理任务完成",
            metadata={"runtime": "deepagents", "source": "task"},
            data=TaskData(
                task_id=run_id,
                title="子代理任务完成",
                status="finish",
                output_payload=output,
            ),
        ),
    ]


def _extract_text(chunk: Any) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)
    return ""


def _extract_reasoning(chunk: Any) -> str:
    additional_kwargs = getattr(chunk, "additional_kwargs", {})
    if isinstance(additional_kwargs, dict):
        reasoning = additional_kwargs.get("reasoning_content")
        if isinstance(reasoning, str):
            return reasoning
    response_metadata = getattr(chunk, "response_metadata", {})
    if isinstance(response_metadata, dict):
        reasoning = response_metadata.get("reasoning_content")
        if isinstance(reasoning, str):
            return reasoning
    return ""


def _json_safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump())
    content = getattr(value, "content", None)
    if content is not None:
        return _json_safe(content)
    return str(value)


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _as_str(value: Any, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def _normalize_status(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_")
    if normalized in {"in_progress", "running", "active"}:
        return "running"
    if normalized in {"done", "completed", "complete", "finish", "finished"}:
        return "finish"
    if normalized in {"error", "failed", "failure"}:
        return "error"
    return "pending"
