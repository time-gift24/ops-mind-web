import { AnimatePresence, motion } from "motion/react"
import {
  BotIcon,
  CheckIcon,
  ClipboardListIcon,
  DownloadIcon,
  LinkIcon,
  ListChecksIcon,
  LoaderIcon,
  PlayCircleIcon,
  RotateCcwIcon,
  SendIcon,
  WrenchIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useRevalidator } from "react-router"
import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import { Streamdown } from "streamdown"

import type { HistoryItem } from "~/lib/history-types"
import { addOptimisticHistory } from "~/lib/optimistic-history"
import {
  type StreamEnvelope,
  readSseStream,
} from "~/lib/sse-stream"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

type Env = "production" | "staging" | "dev"
type Role = "user" | "assistant"
type Status = "idle" | "dispatching" | "streaming" | "done" | "error"

type StructuredEvent = {
  id: string
  type: string
  content: string
  data: unknown
}

type ChatMessage = {
  id: string
  role: Role
  text: string
  reasoning?: string
  events: StructuredEvent[]
}

const ENV_LABEL: Record<Env, string> = {
  production: "生产",
  staging: "预发",
  dev: "测试",
}

const streamdownPlugins = { cjk, code, math, mermaid }

function createUserMessage(text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    text,
    events: [],
  }
}

function createAssistantMessage(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: "",
    reasoning: "",
    events: [],
  }
}

function messagesForApi(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.text.trim())
    .map((message) => ({
      role: message.role,
      content: message.text,
    }))
}

function getErrorMessage(envelope: StreamEnvelope) {
  const content = envelope.payload.content
  if (typeof content === "string" && content.trim()) return content
  return "流式响应出错"
}

function isStructuredEvent(envelope: StreamEnvelope) {
  return (
    envelope.event_type === "tool_call" ||
    envelope.event_type === "task" ||
    envelope.event_type === "plan" ||
    envelope.event_type === "sub_agent"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export default function SopCheckNew() {
  const [env, setEnv] = useState<Env>("production")
  const [sopId, setSopId] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [followupText, setFollowupText] = useState("")
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const revalidator = useRevalidator()

  const abortStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => abortStream, [abortStream])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, status])

  const applyEnvelope = useCallback((envelope: StreamEnvelope) => {
    setMessages((prev) => {
      let next = prev
      let assistant: ChatMessage | undefined
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index]?.role === "assistant") {
          assistant = next[index]
          break
        }
      }

      const ensureAssistant = () => {
        if (assistant) return assistant
        const created = createAssistantMessage()
        next = [...next, created]
        assistant = created
        return created
      }

      if (envelope.event_type === "message_start") {
        return [...next, createAssistantMessage()]
      }

      if (envelope.event_type === "text_delta") {
        const delta = envelope.payload.delta ?? ""
        if (!delta) return next
        const target = ensureAssistant()
        return next.map((message) =>
          message.id === target.id
            ? { ...message, text: message.text + delta }
            : message,
        )
      }

      if (envelope.event_type === "reasoning_delta") {
        const delta = envelope.payload.delta ?? ""
        if (!delta) return next
        const target = ensureAssistant()
        return next.map((message) =>
          message.id === target.id
            ? { ...message, reasoning: `${message.reasoning ?? ""}${delta}` }
            : message,
        )
      }

      if (isStructuredEvent(envelope)) {
        const target = ensureAssistant()
        const event: StructuredEvent = {
          id: `${envelope.event_type}-${envelope.seq}`,
          type: envelope.event_type,
          content:
            typeof envelope.payload.content === "string"
              ? envelope.payload.content
              : "",
          data: envelope.payload.data,
        }
        return next.map((message) =>
          message.id === target.id
            ? { ...message, events: [...message.events, event] }
            : message,
        )
      }

      return next
    })

    if (envelope.event_type === "error") {
      setStatus("error")
      setError(getErrorMessage(envelope))
    }

    if (envelope.event_type === "finish") {
      setStatus("done")
      abortRef.current = null
    }
  }, [])

  const runStream = useCallback(
    async (
      url: string,
      body: unknown,
      options?: { onDispatched?: () => void },
    ) => {
      abortStream()
      const controller = new AbortController()
      abortRef.current = controller
      setStatus("streaming")

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`流请求失败: HTTP ${response.status}`)
        }

        options?.onDispatched?.()

        await readSseStream(response.body, applyEnvelope)
      } catch (err) {
        if (controller.signal.aborted) return
        setStatus("error")
        setError(err instanceof Error ? err.message : "流连接中断")
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    [abortStream, applyEnvelope],
  )

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmedSopId = sopId.trim()
      if (!trimmedSopId || status === "dispatching" || status === "streaming")
        return

      const nextThreadId = crypto.randomUUID()
      const userMessage = createUserMessage(
        `对 ${ENV_LABEL[env]} 环境执行 SOP ${trimmedSopId} 的质检。`,
      )

      setError(null)
      setThreadId(nextThreadId)
      setMessages([userMessage])
      setStatus("dispatching")

      const optimisticHistoryItem: HistoryItem = {
        id: nextThreadId,
        title: `${ENV_LABEL[env]} · SOP ${trimmedSopId}`,
        env,
        sop_id: trimmedSopId,
        status: "running",
        created_at: new Date().toISOString(),
      }

      await runStream(
        "/v1/apis/sop/stream",
        {
          thread_id: nextThreadId,
          env,
          sop_id: trimmedSopId,
        },
        {
          onDispatched: () => {
            addOptimisticHistory(optimisticHistoryItem)
            revalidator.revalidate()
          },
        },
      )
    },
    [env, revalidator, runStream, sopId, status],
  )

  const handleFollowup = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const text = followupText.trim()
      if (
        !text ||
        !threadId ||
        status === "streaming" ||
        status === "dispatching"
      )
        return

      const userMessage = createUserMessage(text)
      const nextMessages = [...messages, userMessage]
      setMessages(nextMessages)
      setFollowupText("")
      setError(null)
      setStatus("dispatching")

      await runStream("/v1/apis/chat/stream", {
        thread_id: threadId,
        messages: messagesForApi(nextMessages),
      })
    },
    [followupText, messages, runStream, status, threadId],
  )

  const handleRestart = useCallback(() => {
    abortStream()
    setStatus("idle")
    setMessages([])
    setThreadId(null)
    setError(null)
    setFollowupText("")
  }, [abortStream])

  const handleExport = useCallback(() => {
    if (messages.length === 0) return
    const lines = [
      `# SOP 质检报告`,
      ``,
      `- 环境：${ENV_LABEL[env]}`,
      `- SOP：${sopId}`,
      `- Thread：${threadId ?? "-"}`,
      `- 导出时间：${new Date().toLocaleString("zh-CN")}`,
      ``,
      `---`,
      ``,
      ...messages.map((message) => {
        const title = message.role === "user" ? "用户" : "助手"
        const reasoning = message.reasoning?.trim()
          ? `\n\n<reasoning>\n${message.reasoning}\n</reasoning>`
          : ""
        const events = message.events.length
          ? `\n\n<events>\n${JSON.stringify(message.events, null, 2)}\n</events>`
          : ""
        return `**${title}**\n\n${message.text}${reasoning}${events}\n`
      }),
    ]
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sop-${sopId || "report"}-${threadId?.slice(0, 8) ?? "draft"}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [env, messages, sopId, threadId])

  const handleCopyThread = useCallback(async () => {
    if (!threadId) return
    try {
      await navigator.clipboard.writeText(threadId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError("复制失败，请手动复制")
    }
  }, [threadId])

  const inChat = threadId !== null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait">
        {inChat ? (
          <motion.div
            key="chat"
            className="relative flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto"
              role="log"
              aria-live="polite"
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-20 pb-44">
                {messages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: Math.min(0.15 + index * 0.04, 0.35),
                      ease: "easeOut",
                    }}
                  >
                    <ChatBubble message={message} />
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
              </div>
            </div>

            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-4"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
            >
              <div className="pointer-events-auto bg-background/80 supports-[backdrop-filter]:bg-background/60 w-full max-w-3xl rounded-2xl border py-1.5 shadow-sm backdrop-blur-xl">
                <DispatchedHeader
                  env={env}
                  sopId={sopId}
                  status={status}
                  threadId={threadId}
                  error={error}
                  copied={copied}
                  onRestart={handleRestart}
                  onExport={handleExport}
                  onCopyThread={handleCopyThread}
                  canExport={status !== "streaming" && messages.length > 0}
                />
              </div>
            </motion.div>

            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-4 pb-4"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
            >
              <div
                aria-hidden
                className="from-background pointer-events-none -mb-2 h-12 w-full max-w-3xl bg-gradient-to-t to-transparent"
              />
              <form
                onSubmit={handleFollowup}
                className="pointer-events-auto bg-background/90 supports-[backdrop-filter]:bg-background/75 flex w-full max-w-3xl flex-col gap-2 rounded-2xl border p-3 shadow-lg backdrop-blur-xl"
              >
                <textarea
                  id="sop-followup"
                  name="followup"
                  aria-label="追问内容"
                  rows={2}
                  value={followupText}
                  onChange={(event) => setFollowupText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder={
                    status === "streaming"
                      ? "等待当前回复完成…"
                      : "继续追问，例如：进一步分析受影响的下游服务"
                  }
                  disabled={status === "streaming" || status === "dispatching"}
                  className="placeholder:text-muted-foreground resize-none bg-transparent px-1 text-sm leading-6 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">
                    {status === "streaming"
                      ? "AI 正在分析，稍后可继续追问"
                      : "Enter 发送 · Shift+Enter 换行"}
                  </span>
                  <Button
                    type="submit"
                    size="icon"
                    name="send_followup"
                    disabled={
                      !followupText.trim() ||
                      status === "streaming" ||
                      status === "dispatching"
                    }
                    aria-label="发送追问"
                    className="size-9 rounded-full"
                  >
                    <SendIcon className="size-4" />
                  </Button>
                </div>
              </form>
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
            <div className="flex w-full max-w-2xl flex-col items-stretch gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                  SOP 质检
                </h1>
                <p className="text-muted-foreground text-sm">
                  选择环境并填入 SOP 单号，AI 将检查执行结果并给出风险评级。
                </p>
              </div>
              <form
                onSubmit={handleSubmit}
                className="bg-muted/60 supports-[backdrop-filter]:bg-muted/40 flex w-full flex-col gap-2 rounded-full p-1.5 backdrop-blur-xl sm:flex-row sm:items-center"
              >
                <Select
                  name="env"
                  value={env}
                  onValueChange={(value) => setEnv(value as Env)}
                >
                  <SelectTrigger
                    id="sop-env"
                    aria-label="选择环境"
                    className="h-11 w-full rounded-full border-none bg-transparent text-sm shadow-none sm:w-32"
                  >
                    <SelectValue placeholder="环境" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">生产</SelectItem>
                    <SelectItem value="staging">预发</SelectItem>
                    <SelectItem value="dev">测试</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="sop-id"
                  name="sop_id"
                  aria-label="SOP 单号"
                  placeholder="SOP 单号，如 SOP-20260628-001"
                  value={sopId}
                  onChange={(event) => setSopId(event.target.value)}
                  className="h-11 flex-1 border-none bg-transparent text-sm font-mono shadow-none focus-visible:ring-0"
                  autoFocus
                />
                <Button
                  type="submit"
                  name="start_sop_check"
                  disabled={!sopId.trim() || status === "dispatching"}
                  className="h-11 gap-2 rounded-full sm:w-32"
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

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div
      className={
        isUser
          ? "ml-auto flex w-full max-w-[88%] justify-end"
          : "flex w-full max-w-[95%] justify-start"
      }
    >
      <div
        className={
          isUser
            ? "bg-secondary text-foreground rounded-lg px-4 py-3 text-sm"
            : "text-foreground min-w-0 text-sm"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : (
          <div className="space-y-3">
            {message.events.length > 0 ? (
              <StructuredEvents events={message.events} />
            ) : null}
            {message.text ? (
              <Streamdown plugins={streamdownPlugins}>{message.text}</Streamdown>
            ) : message.events.length === 0 ? (
              <span className="text-muted-foreground inline-flex items-center gap-2">
                <LoaderIcon className="size-3 animate-spin" />
                准备回复…
              </span>
            ) : null}
            {message.reasoning?.trim() ? (
              <details className="border-border/70 text-muted-foreground rounded-md border px-3 py-2 text-xs">
                <summary className="cursor-pointer text-foreground">
                  推理过程
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans">
                  {message.reasoning}
                </pre>
              </details>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function StructuredEvents({ events }: { events: StructuredEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <StructuredEventCard event={event} key={event.id} />
      ))}
    </div>
  )
}

function StructuredEventCard({ event }: { event: StructuredEvent }) {
  if (event.type === "plan") return <PlanEventCard event={event} />
  if (event.type === "sub_agent") return <SubAgentEventCard event={event} />
  if (event.type === "task") return <TaskEventCard event={event} />
  if (event.type === "tool_call") return <ToolCallEventCard event={event} />
  return <GenericStructuredEventCard event={event} />
}

function StructuredCard({
  children,
  icon,
  title,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  title: string
}) {
  return (
    <section className="border-border/70 bg-muted/30 rounded-md border px-3 py-2 text-xs">
      <div className="text-foreground mb-2 flex items-center gap-2 font-medium">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const tone =
    normalized === "finish" || normalized === "done" || normalized === "completed"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : normalized === "running" || normalized === "start"
        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
        : normalized === "error" || normalized === "failed"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${tone}`}>
      {status || "pending"}
    </span>
  )
}

function PlanEventCard({ event }: { event: StructuredEvent }) {
  const data = isRecord(event.data) ? event.data : {}
  const steps = asRecordArray(data.steps)

  return (
    <StructuredCard
      icon={<ListChecksIcon className="size-3.5" />}
      title={asString(data.title, "计划")}
    >
      {event.content ? (
        <p className="text-muted-foreground mb-2">{event.content}</p>
      ) : null}
      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li
            className="flex items-start gap-2 rounded-md bg-background/50 px-2 py-1.5"
            key={asString(step.step_id, `step-${index}`)}
          >
            <span className="text-muted-foreground mt-0.5 font-mono">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-foreground font-medium">
                  {asString(step.title, "未命名步骤")}
                </span>
                <StatusPill status={asString(step.status, "pending")} />
              </div>
              {asString(step.description) ? (
                <p className="text-muted-foreground mt-0.5">
                  {asString(step.description)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </StructuredCard>
  )
}

function SubAgentEventCard({ event }: { event: StructuredEvent }) {
  const data = isRecord(event.data) ? event.data : {}

  return (
    <StructuredCard
      icon={<BotIcon className="size-3.5" />}
      title={`子代理 · ${asString(data.agent_name, "agent")}`}
    >
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>
          节点：<span className="text-foreground">{asString(data.current_node, "-")}</span>
        </span>
        {event.content ? <span>{event.content}</span> : null}
      </div>
    </StructuredCard>
  )
}

function TaskEventCard({ event }: { event: StructuredEvent }) {
  const data = isRecord(event.data) ? event.data : {}
  const items = Array.isArray(data.items) ? data.items.map(String) : []

  return (
    <StructuredCard
      icon={<ClipboardListIcon className="size-3.5" />}
      title={`任务 · ${asString(data.title, "未命名任务")}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <StatusPill status={asString(data.status, "running")} />
        {event.content ? (
          <span className="text-muted-foreground">{event.content}</span>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              className="bg-background text-muted-foreground rounded-full px-2 py-0.5"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </StructuredCard>
  )
}

function ToolCallEventCard({ event }: { event: StructuredEvent }) {
  const data = isRecord(event.data) ? event.data : {}

  return (
    <StructuredCard
      icon={<WrenchIcon className="size-3.5" />}
      title={`工具调用 · ${asString(data.tool_name, "tool")}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <StatusPill status={asString(data.status, "finish")} />
        {event.content ? (
          <span className="text-muted-foreground">{event.content}</span>
        ) : null}
      </div>
      <pre className="text-muted-foreground max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2">
        {JSON.stringify(data.result ?? data.arguments ?? data, null, 2)}
      </pre>
    </StructuredCard>
  )
}

function GenericStructuredEventCard({ event }: { event: StructuredEvent }) {
  return (
    <details className="border-border/70 rounded-md border px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium">
        {event.type}
        {event.content ? ` · ${event.content}` : ""}
      </summary>
      <pre className="text-muted-foreground mt-2 overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(event.data, null, 2)}
      </pre>
    </details>
  )
}

function DispatchedHeader({
  env,
  sopId,
  status,
  threadId,
  error,
  copied,
  onRestart,
  onExport,
  onCopyThread,
  canExport,
}: {
  env: Env
  sopId: string
  status: Status
  threadId: string | null
  error: string | null
  copied: boolean
  onRestart: () => void
  onExport: () => void
  onCopyThread: () => void
  canExport: boolean
}) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 pr-1 pl-3 text-sm">
      <h1 className="text-foreground font-medium">SOP 质检</h1>
      <span aria-hidden className="bg-border h-4 w-px" />
      <span>
        环境 · <span className="text-foreground">{ENV_LABEL[env]}</span>
      </span>
      <span className="min-w-0">
        SOP · <span className="text-foreground truncate font-mono">{sopId}</span>
      </span>
      {threadId ? (
        <span className="hidden font-mono lg:inline">
          thread · {threadId.slice(0, 8)}
        </span>
      ) : null}
      <StatusText status={status} hasError={!!error} />
      <div className="ml-auto flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCopyThread}
              disabled={!threadId}
              aria-label="复制 Thread ID"
              className="size-9 rounded-full"
            >
              {copied ? (
                <CheckIcon className="size-4 text-emerald-500" />
              ) : (
                <LinkIcon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? "已复制" : "复制 Thread ID"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onExport}
              disabled={!canExport}
              aria-label="导出报告"
              className="size-9 rounded-full"
            >
              <DownloadIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>导出报告</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRestart}
              aria-label="重新发起"
              className="size-9 rounded-full"
            >
              <RotateCcwIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重新发起</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function StatusText({ status, hasError }: { status: Status; hasError: boolean }) {
  if (hasError) return <span className="text-destructive">中断</span>
  if (status === "dispatching") return <span>下发中</span>
  if (status === "streaming")
    return (
      <span className="inline-flex items-center gap-1">
        <LoaderIcon className="size-3 animate-spin" />
        流式中
      </span>
    )
  if (status === "done")
    return <span className="text-emerald-600 dark:text-emerald-500">已完成</span>
  return null
}
