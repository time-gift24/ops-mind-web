import json

from app.events import StreamEnvelope, TextDeltaEvent
from app.main import build_envelope, format_sse


def test_build_envelope_wraps_core_event_with_matching_event_type() -> None:
    core_event = TextDeltaEvent(thread_id="thread-1", delta="hello")

    envelope = build_envelope(thread_id="thread-1", seq=3, event=core_event)

    assert envelope.thread_id == "thread-1"
    assert envelope.seq == 3
    assert envelope.event_type == "text_delta"
    assert envelope.payload["type"] == "text_delta"
    assert envelope.payload["delta"] == "hello"


def test_format_sse_sends_full_stream_envelope_json() -> None:
    envelope = StreamEnvelope(
        thread_id="thread-1",
        seq=0,
        event_type="text_delta",
        payload={"type": "text_delta", "thread_id": "thread-1", "delta": "hello"},
        timestamp=1.0,
    )

    frame = format_sse(envelope)

    assert frame.startswith("event: text_delta\n")
    data_line = next(line for line in frame.splitlines() if line.startswith("data: "))
    payload = json.loads(data_line.removeprefix("data: "))
    parsed = StreamEnvelope.model_validate(payload)
    assert parsed.event_type == parsed.payload["type"]

