import { AnimatePresence, motion } from "motion/react"
import { LoaderIcon, PlayCircleIcon, RotateCcwIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "~/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "~/components/ai-elements/message"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type Env = "production" | "staging" | "dev"
type ChatMessage = { id: string; role: "user" | "assistant"; text: string }
type Status = "idle" | "dispatching" | "streaming" | "done" | "error"

const ENV_LABEL: Record<Env, string> = {
  production: "生产",
  staging: "预发",
  dev: "测试",
}

async function dispatchSopCheck(input: {
  env: Env
  sopId: string
}): Promise<{ thread_id: string }> {
  const res = await fetch("/api/sop-checks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`下发失败: HTTP ${res.status}`)
  return res.json()
}

export default function SopCheckNew() {
  const [env, setEnv] = useState<Env>("production")
  const [sopId, setSopId] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const esRef = useRef<EventSource | null>(null)

  const closeStream = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  useEffect(() => closeStream, [closeStream])

  const openStream = useCallback((tid: string) => {
    closeStream()
    const es = new EventSource(
      `/api/threads/${encodeURIComponent(tid)}/stream`,
    )
    esRef.current = es

    let currentAssistantId: string | null = null

    es.addEventListener("message", (ev) => {
      let payload: { type?: string; role?: string; text?: string; delta?: string } = {}
      try {
        payload = JSON.parse(ev.data)
      } catch {
        payload = { type: "text-delta", delta: ev.data }
      }

      const role = (payload.role === "user" ? "user" : "assistant") as
        | "user"
        | "assistant"
      const chunk = payload.delta ?? payload.text ?? ""

      setMessages((prev) => {
        if (role === "assistant" && currentAssistantId) {
          return prev.map((m) =>
            m.id === currentAssistantId ? { ...m, text: m.text + chunk } : m,
          )
        }
        const id = crypto.randomUUID()
        if (role === "assistant") currentAssistantId = id
        return [...prev, { id, role, text: chunk }]
      })
    })

    es.addEventListener("done", () => {
      setStatus("done")
      closeStream()
    })

    es.addEventListener("error", () => {
      setStatus((s) => (s === "done" ? s : "error"))
      setError("流连接中断")
      closeStream()
    })
  }, [closeStream])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!sopId.trim() || status === "dispatching" || status === "streaming")
        return
      setError(null)
      setStatus("dispatching")
      try {
        const { thread_id } = await dispatchSopCheck({ env, sopId: sopId.trim() })
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "user",
            text: `对 ${ENV_LABEL[env]} 环境执行 SOP ${sopId.trim()} 的质检。`,
          },
        ])
        setThreadId(thread_id)
        setStatus("streaming")
        openStream(thread_id)
      } catch (err) {
        setStatus("idle")
        setError(err instanceof Error ? err.message : "下发失败")
      }
    },
    [env, sopId, status, openStream],
  )

  const handleRestart = useCallback(() => {
    closeStream()
    setStatus("idle")
    setMessages([])
    setThreadId(null)
    setError(null)
  }, [closeStream])

  const inChat = threadId !== null

  return (
    <div className="relative flex flex-1 flex-col">
      <AnimatePresence mode="wait">
        {inChat ? (
          <motion.div
            key="chat"
            className="flex flex-1 flex-col gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <motion.div
              className="mx-auto w-full max-w-3xl"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
            >
              <DispatchedHeader
                env={env}
                sopId={sopId}
                status={status}
                threadId={threadId}
                error={error}
                onRestart={handleRestart}
              />
            </motion.div>

            <Conversation>
              <ConversationContent className="mx-auto w-full max-w-3xl pb-32">
                {messages.map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: 0.15 + i * 0.05,
                      ease: "easeOut",
                    }}
                  >
                    <Message from={m.role}>
                      <MessageContent>
                        <MessageResponse>{m.text}</MessageResponse>
                      </MessageContent>
                    </Message>
                  </motion.div>
                ))}
                {status === "streaming" && (
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <LoaderIcon className="size-3 animate-spin" />
                    正在分析…
                  </div>
                )}
                {error ? (
                  <div className="text-destructive text-sm">{error}</div>
                ) : null}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-6"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
            >
              <div className="pointer-events-auto bg-background/80 supports-[backdrop-filter]:bg-background/60 w-full max-w-3xl rounded-full border px-2 py-2 shadow-sm backdrop-blur-xl">
                <div className="text-muted-foreground flex items-center gap-3 px-3 py-1 text-xs">
                  <span className="font-mono">
                    thread · {threadId.slice(0, 8)}
                  </span>
                  <span className="ml-auto">追问能力待接入</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            className="flex flex-1 items-center justify-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -32 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="flex w-full max-w-2xl flex-col items-stretch gap-2">
              <form
                onSubmit={handleSubmit}
                className="bg-muted/60 supports-[backdrop-filter]:bg-muted/40 flex w-full flex-col gap-2 rounded-full px-2 py-2 backdrop-blur-xl sm:flex-row sm:items-center"
              >
                <Select value={env} onValueChange={(v) => setEnv(v as Env)}>
                  <SelectTrigger className="w-full rounded-full border-none bg-transparent shadow-none sm:w-32">
                    <SelectValue placeholder="环境" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">生产</SelectItem>
                    <SelectItem value="staging">预发</SelectItem>
                    <SelectItem value="dev">测试</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="SOP 单号，如 SOP-20260628-001"
                  value={sopId}
                  onChange={(e) => setSopId(e.target.value)}
                  className="flex-1 border-none bg-transparent font-mono shadow-none focus-visible:ring-0"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={!sopId.trim() || status === "dispatching"}
                  className="rounded-full sm:w-32"
                >
                  {status === "dispatching" ? (
                    <LoaderIcon className="size-4 animate-spin" />
                  ) : (
                    <PlayCircleIcon className="size-4" />
                  )}
                  发起质检
                </Button>
              </form>
              {error ? (
                <div className="text-destructive px-4 text-center text-sm">
                  {error}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DispatchedHeader({
  env,
  sopId,
  status,
  threadId,
  error,
  onRestart,
}: {
  env: Env
  sopId: string
  status: Status
  threadId: string | null
  error: string | null
  onRestart: () => void
}) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
      <span className="text-foreground font-medium">SOP 质检</span>
      <span>环境 · {ENV_LABEL[env]}</span>
      <span>SOP · {sopId}</span>
      {threadId ? (
        <span className="font-mono">thread · {threadId.slice(0, 8)}</span>
      ) : null}
      <StatusText status={status} hasError={!!error} />
      <span className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestart}
          className="h-7 px-2 text-xs"
        >
          <RotateCcwIcon className="size-3.5" />
          重新发起
        </Button>
      </span>
    </div>
  )
}

function StatusText({ status, hasError }: { status: Status; hasError: boolean }) {
  if (hasError) return <span className="text-destructive">· 中断</span>
  if (status === "dispatching") return <span>· 下发中</span>
  if (status === "streaming")
    return (
      <span className="inline-flex items-center gap-1">
        <LoaderIcon className="size-3 animate-spin" />
        流式中
      </span>
    )
  if (status === "done") return <span className="text-foreground">· 已完成</span>
  return null
}
