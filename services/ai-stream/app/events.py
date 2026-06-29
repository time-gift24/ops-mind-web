import time
from typing import Any, Literal

from pydantic import BaseModel, Field
from typing_extensions import Annotated


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class ToolCallData(BaseModel):
    status: Literal["start", "finish", "error"]
    tool_name: str
    arguments: dict[str, Any] | None = None
    call_id: str
    result: Any = None
    error_text: str | None = None


class SubAgentData(BaseModel):
    agent_name: str
    current_node: str = ""
    input_payload: dict[str, Any] = Field(default_factory=dict)
    output_payload: Any = None


class TaskData(BaseModel):
    task_id: str = ""
    title: str = ""
    status: str = "running"
    input_payload: dict[str, Any] = Field(default_factory=dict)
    output_payload: Any = None
    items: list[str] = Field(default_factory=list)
    files: list[str] = Field(default_factory=list)


class PlanStepData(BaseModel):
    step_id: str = ""
    title: str = ""
    status: str = "pending"
    description: str = ""


class PlanData(BaseModel):
    plan_id: str = ""
    title: str = ""
    description: str = ""
    status: str = "running"
    steps: list[PlanStepData] = Field(default_factory=list)


class ErrorData(BaseModel):
    code: int
    traceback: str | None = None


class BaseCoreEvent(BaseModel):
    # 核心的 thread_id
    thread_id: str
    # 不同运行时自行决定的 metadata
    metadata: dict[str, Any] = Field(default_factory=dict)


class MessageStartEvent(BaseCoreEvent):
    type: Literal["message_start"] = "message_start"
    state: dict[str, Any] = Field(default_factory=dict)


class TextDeltaEvent(BaseCoreEvent):
    type: Literal["text_delta"] = "text_delta"
    delta: str


class ReasoningDeltaEvent(BaseCoreEvent):
    type: Literal["reasoning_delta"] = "reasoning_delta"
    delta: str


class ToolCallEvent(BaseCoreEvent):
    type: Literal["tool_call"] = "tool_call"
    content: str = ""
    data: ToolCallData


class SubAgentEvent(BaseCoreEvent):
    type: Literal["sub_agent"] = "sub_agent"
    content: str
    data: SubAgentData


class TaskEvent(BaseCoreEvent):
    type: Literal["task"] = "task"
    content: str
    data: TaskData


class PlanEvent(BaseCoreEvent):
    type: Literal["plan"] = "plan"
    content: str
    data: PlanData


class ErrorEvent(BaseCoreEvent):
    type: Literal["error"] = "error"
    content: str
    data: ErrorData


class FinishEvent(BaseCoreEvent):
    type: Literal["finish"] = "finish"
    finish_reason: str = "stop"
    usage: TokenUsage = Field(default_factory=TokenUsage)


CoreEvent = Annotated[
    MessageStartEvent
    | TextDeltaEvent
    | ReasoningDeltaEvent
    | ToolCallEvent
    | SubAgentEvent
    | TaskEvent
    | PlanEvent
    | ErrorEvent
    | FinishEvent,
    Field(discriminator="type"),
]


class StreamEnvelope(BaseModel):
    thread_id: str
    seq: int = Field(default=0, ge=0)
    event_type: str
    payload: dict[str, Any]
    timestamp: float = Field(default_factory=time.time)

