import asyncio
import json
import os
import traceback
from collections.abc import AsyncIterator
from typing import Literal, TypedDict
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_deepseek import ChatDeepSeek
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from app.events import (
    BaseCoreEvent,
    ErrorData,
    ErrorEvent,
    FinishEvent,
    MessageStartEvent,
    PlanData,
    PlanEvent,
    PlanStepData,
    SubAgentData,
    SubAgentEvent,
    StreamEnvelope,
    TaskData,
    TaskEvent,
    TextDeltaEvent,
    ToolCallData,
    ToolCallEvent,
)
from app.deepagents_runtime import (
    build_chat_agent_input,
    build_sop_agent_input,
    create_chat_deep_agent,
    create_sop_deep_agent,
    iter_deepagent_events,
    resolve_runtime,
)


class SopDispatchRequest(BaseModel):
    env: str = "production"
    sop_id: str | None = None
    sopId: str | None = None


class SopStreamRequest(BaseModel):
    thread_id: str | None = None
    env: str = "production"
    sop_id: str | None = None
    sopId: str | None = None
    messages: list["ChatMessage"] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatStreamRequest(BaseModel):
    thread_id: str | None = None
    prompt: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)


class GraphState(TypedDict):
    thread_id: str
    env: str
    sop_id: str
    prompt: str


load_dotenv()

app = FastAPI(title="AI Stream Test Service")


def prepare_prompt(state: GraphState) -> GraphState:
    sop_id = state["sop_id"] or "test-sop"
    env = state["env"] or "production"
    return {
        **state,
        "prompt": (
            f"请对 {env} 环境执行 SOP {sop_id} 的轻量质检，"
            "用中文输出简短过程、发现和结论。"
        ),
    }


def build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("prepare_prompt", prepare_prompt)
    graph.set_entry_point("prepare_prompt")
    graph.add_edge("prepare_prompt", END)
    return graph.compile()


GRAPH = build_graph()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/apis/sop", status_code=201)
def dispatch_sop(payload: SopDispatchRequest) -> dict[str, str]:
    return {
        "thread_id": str(uuid4()),
        "env": payload.env,
        "sop_id": payload.sop_id or payload.sopId or "",
    }


def build_envelope(thread_id: str, seq: int, event: BaseCoreEvent) -> StreamEnvelope:
    payload = event.model_dump()
    return StreamEnvelope(
        thread_id=thread_id,
        seq=seq,
        event_type=payload["type"],
        payload=payload,
    )


def format_sse(envelope: StreamEnvelope) -> str:
    data = json.dumps(envelope.model_dump(), ensure_ascii=False)
    return f"event: {envelope.event_type}\ndata: {data}\n\n"


async def iter_sop_structured_events(
    thread_id: str,
    env: str,
    sop_id: str,
) -> AsyncIterator[BaseCoreEvent]:
    yield PlanEvent(
        thread_id=thread_id,
        content="已生成 SOP 质检计划",
        data=PlanData(
            plan_id=f"plan-{thread_id}",
            title="SOP 质检计划",
            description=f"对 {env} 环境的 {sop_id} 做执行质检",
            status="running",
            steps=[
                PlanStepData(
                    step_id="collect-context",
                    title="收集 SOP 上下文",
                    status="running",
                    description="确认环境、SOP 编号与需要补充的数据",
                ),
                PlanStepData(
                    step_id="risk-review",
                    title="识别风险点",
                    status="pending",
                    description="按执行完整性、监控、回滚与验证维度检查",
                ),
                PlanStepData(
                    step_id="final-report",
                    title="输出质检结论",
                    status="pending",
                    description="给出风险等级、结论和后续建议",
                ),
            ],
        ),
    )
    yield SubAgentEvent(
        thread_id=thread_id,
        content="SRE 子代理开始收集上下文",
        data=SubAgentData(
            agent_name="sre-sop-reviewer",
            current_node="collect_context",
            input_payload={"env": env, "sop_id": sop_id},
        ),
    )
    yield TaskEvent(
        thread_id=thread_id,
        content="收集 SOP 上下文",
        data=TaskData(
            task_id=f"task-context-{thread_id}",
            title="收集 SOP 上下文",
            status="running",
            input_payload={"env": env, "sop_id": sop_id},
            items=[env, sop_id, "监控指标", "回滚策略", "验证清单"],
        ),
    )
    yield ToolCallEvent(
        thread_id=thread_id,
        content="已加载 SOP 上下文",
        data=ToolCallData(
            status="finish",
            tool_name="sop_context_loader",
            arguments={"env": env, "sop_id": sop_id},
            call_id=f"tool-context-{thread_id}",
            result={
                "context_loaded": True,
                "required_sections": ["检查对象", "风险点", "风险等级", "结论"],
            },
        ),
    )


async def iter_mock_events(thread_id: str) -> AsyncIterator[BaseCoreEvent]:
    yield MessageStartEvent(thread_id=thread_id, state={"runtime": "mock"})
    for delta in (
        "开始执行轻量 SOP 质检。\n\n",
        "当前链路使用 mock 流，事件格式与真实模型输出一致。\n\n",
        "结论：测试流已完成，可以用于前端或 curl 联调。\n",
    ):
        await asyncio.sleep(0.05)
        yield TextDeltaEvent(thread_id=thread_id, delta=delta)
    yield FinishEvent(thread_id=thread_id)


async def iter_mock_sop_events(
    thread_id: str,
    env: str,
    sop_id: str,
) -> AsyncIterator[BaseCoreEvent]:
    yield MessageStartEvent(
        thread_id=thread_id,
        state={"runtime": "mock", "flow": "sop", "env": env, "sop_id": sop_id},
    )
    async for event in iter_sop_structured_events(thread_id, env, sop_id):
        yield event
    for delta in (
        f"开始对 {env} 环境的 {sop_id} 执行 SOP 质检。\n\n",
        "检查项：执行完整性、关键指标、风险等级、回滚与后续建议。\n\n",
        "结论：当前为测试模式；事件流结构与真实 DeepSeek 输出一致。\n",
    ):
        await asyncio.sleep(0.05)
        yield TextDeltaEvent(thread_id=thread_id, delta=delta)
    yield FinishEvent(thread_id=thread_id)


async def iter_mock_chat_events(
    thread_id: str,
    messages: list[ChatMessage],
) -> AsyncIterator[BaseCoreEvent]:
    yield MessageStartEvent(
        thread_id=thread_id,
        state={"runtime": "mock", "message_count": len(messages)},
    )
    last_user_message = next(
        (message.content for message in reversed(messages) if message.role == "user"),
        "",
    )
    for delta in (
        f"收到你的消息：{last_user_message or '空输入'}\n\n",
        "这是测试模式下的对话流，真实模型会使用同一套事件 envelope 输出。\n",
    ):
        await asyncio.sleep(0.05)
        yield TextDeltaEvent(thread_id=thread_id, delta=delta)
    yield FinishEvent(thread_id=thread_id)


def to_langchain_messages(messages: list[ChatMessage]) -> list[BaseMessage]:
    converted: list[BaseMessage] = []
    for message in messages:
        if message.role == "system":
            converted.append(SystemMessage(content=message.content))
        elif message.role == "assistant":
            converted.append(AIMessage(content=message.content))
        else:
            converted.append(HumanMessage(content=message.content))
    return converted


async def iter_deepseek_events(thread_id: str) -> AsyncIterator[BaseCoreEvent]:
    initial_state: GraphState = {
        "thread_id": thread_id,
        "env": "production",
        "sop_id": "test-sop",
        "prompt": "",
    }
    state = await GRAPH.ainvoke(initial_state)
    model = ChatDeepSeek(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        api_key=os.environ["DEEPSEEK_API_KEY"],
    )

    yield MessageStartEvent(thread_id=thread_id, state={"runtime": "deepseek"})
    async for chunk in model.astream(
        [
            SystemMessage(content="你是一个严谨的 SRE SOP 质检助手。"),
            HumanMessage(content=state["prompt"]),
        ]
    ):
        content = chunk.content
        if isinstance(content, str) and content:
            yield TextDeltaEvent(thread_id=thread_id, delta=content)
    yield FinishEvent(thread_id=thread_id)


def build_sop_messages(env: str, sop_id: str) -> list[BaseMessage]:
    return [
        SystemMessage(
            content=(
                "你是一个严谨的 SRE SOP 质检助手。"
                "请用中文输出结构化质检结果，必须包含：检查对象、关键检查项、"
                "风险点、风险等级、结论、后续建议。"
            )
        ),
        HumanMessage(
            content=(
                f"请对 {env} 环境的 SOP {sop_id} 做一次执行质检。"
                "如果缺少真实监控数据，请明确说明假设，并给出需要补充的数据。"
            )
        ),
    ]


async def iter_deepseek_sop_events(
    thread_id: str,
    env: str,
    sop_id: str,
) -> AsyncIterator[BaseCoreEvent]:
    model = ChatDeepSeek(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        api_key=os.environ["DEEPSEEK_API_KEY"],
    )

    yield MessageStartEvent(
        thread_id=thread_id,
        state={"runtime": "deepseek", "flow": "sop", "env": env, "sop_id": sop_id},
    )
    async for chunk in model.astream(build_sop_messages(env, sop_id)):
        content = chunk.content
        if isinstance(content, str) and content:
            yield TextDeltaEvent(thread_id=thread_id, delta=content)
    yield FinishEvent(thread_id=thread_id)


async def iter_demo_deepseek_sop_events(
    thread_id: str,
    env: str,
    sop_id: str,
) -> AsyncIterator[BaseCoreEvent]:
    model = ChatDeepSeek(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        api_key=os.environ["DEEPSEEK_API_KEY"],
    )

    yield MessageStartEvent(
        thread_id=thread_id,
        state={
            "runtime": "fallback_demo",
            "flow": "sop",
            "env": env,
            "sop_id": sop_id,
        },
    )
    async for event in iter_sop_structured_events(thread_id, env, sop_id):
        yield event
    async for chunk in model.astream(build_sop_messages(env, sop_id)):
        content = chunk.content
        if isinstance(content, str) and content:
            yield TextDeltaEvent(thread_id=thread_id, delta=content)
    yield FinishEvent(thread_id=thread_id)


async def iter_deepagents_sop_events(
    thread_id: str,
    env: str,
    sop_id: str,
) -> AsyncIterator[BaseCoreEvent]:
    agent = create_sop_deep_agent()
    yield MessageStartEvent(
        thread_id=thread_id,
        state={
            "runtime": "deepagents",
            "flow": "sop",
            "env": env,
            "sop_id": sop_id,
        },
    )
    async for event in iter_deepagent_events(
        thread_id=thread_id,
        agent=agent,
        agent_input=build_sop_agent_input(env=env, sop_id=sop_id),
    ):
        yield event
    yield FinishEvent(thread_id=thread_id)


async def iter_deepseek_chat_events(
    thread_id: str,
    messages: list[ChatMessage],
) -> AsyncIterator[BaseCoreEvent]:
    model = ChatDeepSeek(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        api_key=os.environ["DEEPSEEK_API_KEY"],
    )
    model_messages = to_langchain_messages(messages)
    if not model_messages:
        model_messages = [HumanMessage(content="请用中文简单打个招呼。")]

    yield MessageStartEvent(
        thread_id=thread_id,
        state={"runtime": "deepseek", "message_count": len(model_messages)},
    )
    async for chunk in model.astream(model_messages):
        content = chunk.content
        if isinstance(content, str) and content:
            yield TextDeltaEvent(thread_id=thread_id, delta=content)
    yield FinishEvent(thread_id=thread_id)


async def iter_deepagents_chat_events(
    thread_id: str,
    messages: list[ChatMessage],
) -> AsyncIterator[BaseCoreEvent]:
    agent = create_chat_deep_agent()
    model_messages = to_langchain_messages(messages)

    yield MessageStartEvent(
        thread_id=thread_id,
        state={"runtime": "deepagents", "message_count": len(model_messages)},
    )
    async for event in iter_deepagent_events(
        thread_id=thread_id,
        agent=agent,
        agent_input=build_chat_agent_input(model_messages),
    ):
        yield event
    yield FinishEvent(thread_id=thread_id)


async def iter_core_events(thread_id: str) -> AsyncIterator[BaseCoreEvent]:
    if os.getenv("DEEPSEEK_API_KEY"):
        async for event in iter_deepseek_events(thread_id):
            yield event
        return

    async for event in iter_mock_events(thread_id):
        yield event


async def iter_chat_core_events(
    thread_id: str,
    messages: list[ChatMessage],
) -> AsyncIterator[BaseCoreEvent]:
    runtime = resolve_runtime()
    if runtime == "deepagents":
        try:
            async for event in iter_deepagents_chat_events(thread_id, messages):
                yield event
            return
        except (ImportError, KeyError, ValueError):
            if os.getenv("DEEPSEEK_API_KEY"):
                async for event in iter_deepseek_chat_events(thread_id, messages):
                    yield event
                return

    if runtime == "deepseek":
        async for event in iter_deepseek_chat_events(thread_id, messages):
            yield event
        return

    async for event in iter_mock_chat_events(thread_id, messages):
        yield event


async def iter_sop_core_events(
    thread_id: str,
    env: str,
    sop_id: str,
) -> AsyncIterator[BaseCoreEvent]:
    runtime = resolve_runtime()
    if runtime == "deepagents":
        try:
            async for event in iter_deepagents_sop_events(thread_id, env, sop_id):
                yield event
            return
        except (ImportError, KeyError, ValueError):
            if os.getenv("DEEPSEEK_API_KEY"):
                async for event in iter_demo_deepseek_sop_events(
                    thread_id, env, sop_id
                ):
                    yield event
                return

    if runtime == "deepseek":
        async for event in iter_deepseek_sop_events(thread_id, env, sop_id):
            yield event
        return

    async for event in iter_mock_sop_events(thread_id, env, sop_id):
        yield event


async def iter_sse(thread_id: str, request: Request) -> AsyncIterator[str]:
    seq = 0
    try:
        async for event in iter_core_events(thread_id):
            if await request.is_disconnected():
                return
            yield format_sse(build_envelope(thread_id=thread_id, seq=seq, event=event))
            seq += 1
    except Exception as error:
        error_event = ErrorEvent(
            thread_id=thread_id,
            content=str(error),
            data=ErrorData(code=500, traceback=traceback.format_exc()),
        )
        yield format_sse(build_envelope(thread_id=thread_id, seq=seq, event=error_event))


async def iter_sop_sse(
    thread_id: str,
    env: str,
    sop_id: str,
    request: Request,
) -> AsyncIterator[str]:
    seq = 0
    try:
        async for event in iter_sop_core_events(thread_id, env, sop_id):
            if await request.is_disconnected():
                return
            yield format_sse(build_envelope(thread_id=thread_id, seq=seq, event=event))
            seq += 1
    except Exception as error:
        error_event = ErrorEvent(
            thread_id=thread_id,
            content=str(error),
            data=ErrorData(code=500, traceback=traceback.format_exc()),
        )
        yield format_sse(build_envelope(thread_id=thread_id, seq=seq, event=error_event))


async def iter_chat_sse(
    thread_id: str,
    messages: list[ChatMessage],
    request: Request,
) -> AsyncIterator[str]:
    seq = 0
    try:
        async for event in iter_chat_core_events(thread_id, messages):
            if await request.is_disconnected():
                return
            yield format_sse(build_envelope(thread_id=thread_id, seq=seq, event=event))
            seq += 1
    except Exception as error:
        error_event = ErrorEvent(
            thread_id=thread_id,
            content=str(error),
            data=ErrorData(code=500, traceback=traceback.format_exc()),
        )
        yield format_sse(build_envelope(thread_id=thread_id, seq=seq, event=error_event))


@app.get("/v1/apis/sse/{thread_id}")
def stream_sse(thread_id: str, request: Request) -> StreamingResponse:
    return StreamingResponse(
        iter_sse(thread_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/v1/apis/sop/stream")
def stream_sop(payload: SopStreamRequest, request: Request) -> StreamingResponse:
    thread_id = payload.thread_id or str(uuid4())
    sop_id = payload.sop_id or payload.sopId or "test-sop"

    return StreamingResponse(
        iter_sop_sse(thread_id, payload.env, sop_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/v1/apis/chat/stream")
def stream_chat(payload: ChatStreamRequest, request: Request) -> StreamingResponse:
    thread_id = payload.thread_id or str(uuid4())
    messages = payload.messages
    if payload.prompt:
        messages = [*messages, ChatMessage(role="user", content=payload.prompt)]

    return StreamingResponse(
        iter_chat_sse(thread_id, messages, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
