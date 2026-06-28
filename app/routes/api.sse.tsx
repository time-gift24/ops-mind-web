import type { Route } from "./+types/api.sse"

const SCRIPT: Array<{ delta: string; wait: number }> = [
  { delta: "开始连接目标集群，准备执行 SOP 巡检…\n\n", wait: 350 },
  { delta: "## 巡检结果\n\n", wait: 400 },
  {
    delta:
      "| 指标 | 当前值 | 阈值 | 状态 |\n| --- | --- | --- | --- |\n",
    wait: 450,
  },
  { delta: "| CPU 平均 | 42% | 80% | ✅ |\n", wait: 320 },
  { delta: "| 内存使用 | 68% | 85% | ✅ |\n", wait: 320 },
  { delta: "| P99 延迟 | 312ms | 500ms | ✅ |\n", wait: 320 },
  { delta: "| 5xx 比例 | 0.03% | 0.10% | ✅ |\n\n", wait: 380 },
  { delta: "## 关键命令\n\n", wait: 350 },
  {
    delta:
      "```bash\nkubectl top nodes\nkubectl get pods -n production -o wide\n```\n\n",
    wait: 700,
  },
  { delta: "## 结论\n\n", wait: 300 },
  {
    delta:
      "所有关键指标均在阈值范围内，**SOP 检查通过**。建议保留此次 thread 作为基线，",
    wait: 450,
  },
  { delta: "并在下一轮回归对比 P99 与 5xx 走势。\n", wait: 600 },
]

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function loader({ params, request }: Route.LoaderArgs) {
  const threadId = params.thread_id
  if (!threadId) {
    return Response.json({ error: "thread_id_required" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const abort = request.signal

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cancelled = false
      const onAbort = () => {
        cancelled = true
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      abort.addEventListener("abort", onAbort)

      try {
        controller.enqueue(
          encoder.encode(sse("open", { thread_id: threadId })),
        )

        for (const step of SCRIPT) {
          if (cancelled) return
          await new Promise((r) => setTimeout(r, step.wait))
          if (cancelled) return
          controller.enqueue(
            encoder.encode(
              sse("message", { role: "assistant", delta: step.delta }),
            ),
          )
        }

        if (!cancelled) {
          controller.enqueue(encoder.encode(sse("done", { thread_id: threadId })))
          controller.close()
        }
      } catch (err) {
        if (!cancelled) {
          controller.enqueue(
            encoder.encode(
              sse("error", {
                message: err instanceof Error ? err.message : "stream_error",
              }),
            ),
          )
          controller.close()
        }
      } finally {
        abort.removeEventListener("abort", onAbort)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
