export type CoreEventType =
  | "message_start"
  | "text_delta"
  | "reasoning_delta"
  | "tool_call"
  | "sub_agent"
  | "task"
  | "plan"
  | "error"
  | "finish"

export type StreamEnvelope = {
  thread_id: string
  seq: number
  event_type: CoreEventType | string
  payload: {
    type: CoreEventType | string
    thread_id: string
    metadata?: Record<string, unknown>
    state?: Record<string, unknown>
    delta?: string
    content?: string
    data?: unknown
    finish_reason?: string
    usage?: unknown
  }
  timestamp: number
}

export async function readSseStream(
  stream: ReadableStream<Uint8Array> | null,
  onEnvelope: (envelope: StreamEnvelope) => void,
) {
  if (!stream) {
    throw new Error("stream_body_missing")
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const flushFrame = (frame: string) => {
    if (!frame.trim()) return

    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())

    if (dataLines.length === 0) return

    const envelope = JSON.parse(dataLines.join("\n")) as StreamEnvelope
    if (envelope.event_type !== envelope.payload?.type) {
      throw new Error("stream_event_type_mismatch")
    }
    onEnvelope(envelope)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const frameEnd = buffer.search(/\r?\n\r?\n/)
        if (frameEnd < 0) break

        const frame = buffer.slice(0, frameEnd)
        const separatorLength =
          buffer.slice(frameEnd, frameEnd + 4) === "\r\n\r\n" ? 4 : 2
        buffer = buffer.slice(frameEnd + separatorLength)
        flushFrame(frame)
      }
    }

    buffer += decoder.decode()
    flushFrame(buffer)
  } finally {
    reader.releaseLock()
  }
}

