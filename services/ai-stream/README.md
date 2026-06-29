# AI Stream Test Service

Lightweight FastAPI test service for streaming LangGraph / Deep Agents output as strict event envelopes.

## Run

```bash
uv sync
uv run fastapi dev app/main.py
```

## Check

```bash
curl http://127.0.0.1:8000/health
curl -N http://127.0.0.1:8000/v1/apis/sse/test-thread
curl -N -X POST http://127.0.0.1:8000/v1/apis/sop/stream \
  -H 'Content-Type: application/json' \
  -d '{"thread_id":"sop-thread","env":"production","sop_id":"SOP-20260628-001"}'
curl -N -X POST http://127.0.0.1:8000/v1/apis/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"thread_id":"chat-thread","messages":[{"role":"user","content":"打个招呼"}]}'
curl -N -X POST http://127.0.0.1:8000/v1/apis/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"说一句测试文本"}'
```

Set `DEEPSEEK_API_KEY` to stream with DeepSeek. Without it, the service emits a mock stream using the same event schema.

## Runtime

`AI_STREAM_RUNTIME` supports:

- `auto`: default; use Deep Agents when `DEEPSEEK_API_KEY` exists, otherwise mock.
- `deepagents`: run a real `deepagents.create_deep_agent` graph and adapt tool/subagent/message events to the core event schema.
- `deepseek`: stream direct `ChatDeepSeek` text deltas without generated plan/task events.
- `mock`: use the saved demo/fallback stream with fixed structured events.
