import { AnimatePresence, motion } from "motion/react"
import {
  CheckIcon,
  DownloadIcon,
  LinkIcon,
  LoaderIcon,
  PlayCircleIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"

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
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "~/components/ai-elements/prompt-input"
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
  const res = await fetch("/v1/apis/sop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env: input.env, sop_id: input.sopId }),
  })
  if (!res.ok) throw new Error(`下发失败: HTTP ${res.status}`)
  return res.json()
}

// 追问：POST 用户输入到既有 thread；后端会把新的助手回复推回到同一 SSE 流。
// TODO(backend-pending): 接入真实接口后保留此处签名即可。
async function dispatchFollowup(input: {
  threadId: string
  text: string
}): Promise<void> {
  const res = await fetch(
    `/v1/apis/sop/${encodeURIComponent(input.threadId)}/followup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
    },
  )
  if (!res.ok) throw new Error(`追问失败: HTTP ${res.status}`)
}

export default function SopCheckNew() {
  const [env, setEnv] = useState<Env>("production")
  const [sopId, setSopId] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [copied, setCopied] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  const closeStream = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  useEffect(() => closeStream, [closeStream])

  const openStream = useCallback((tid: string) => {
    closeStream()
    const es = new EventSource(
      `/v1/apis/sse/${encodeURIComponent(tid)}`,
    )
    esRef.current = es

    const assistantId = { current: null as string | null }

    es.addEventListener("message", (ev) => {
      let payload: { type?: string; role?: string; text?: string; delta?: string } = {}
      try {
        payload = JSON.parse(ev.data)
      } catch {
        payload = { delta: ev.data }
      }

      const role: "user" | "assistant" =
        payload.role === "user" ? "user" : "assistant"
      const chunk = payload.delta ?? payload.text ?? ""
      if (!chunk) return

      // Decide id outside the updater so React's potential double-invocation
      // in dev never produces inconsistent state from a closure mutation.
      let id = role === "assistant" ? assistantId.current : null
      if (!id) {
        id = crypto.randomUUID()
        if (role === "assistant") assistantId.current = id
      }
      const targetId = id

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === targetId)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = { ...next[idx], text: next[idx].text + chunk }
          return next
        }
        return [...prev, { id: targetId, role, text: chunk }]
      })
    })

    es.addEventListener("done", () => {
      setStatus("done")
      closeStream()
    })

    es.addEventListener("error", () => {
      // EventSource fires "error" when the server closes the stream after
      // sending "done"; ignore unless we never reached the done state.
      if (es.readyState === EventSource.CLOSED) return
      setStatus((s) => (s === "done" ? s : "error"))
      setError((e) => e ?? "流连接中断")
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
      ...messages.map(
        (m) => `**${m.role === "user" ? "用户" : "助手"}**\n\n${m.text}\n`,
      ),
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
  }, [env, sopId, threadId, messages])

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

  const handleFollowup = useCallback(
    async (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const text = message.text.trim()
      if (
        !text ||
        !threadId ||
        status === "streaming" ||
        status === "dispatching"
      )
        return
      setError(null)
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", text },
      ])
      setStatus("dispatching")
      try {
        await dispatchFollowup({ threadId, text })
        setStatus("streaming")
        openStream(threadId)
      } catch (err) {
        setStatus("error")
        setError(err instanceof Error ? err.message : "追问失败")
      }
    },
    [threadId, status, openStream],
  )

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
            <Conversation className="min-h-0">
              <ConversationContent className="mx-auto w-full max-w-3xl px-4 pt-20 pb-44">
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
              <ConversationScrollButton className="bottom-36" />
            </Conversation>

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
                  canExport={
                    status !== "streaming" && messages.length > 0
                  }
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
              <div className="pointer-events-auto bg-background/90 supports-[backdrop-filter]:bg-background/75 w-full max-w-3xl rounded-2xl border shadow-lg backdrop-blur-xl">
                <PromptInputProvider>
                  <PromptInput
                    onSubmit={handleFollowup}
                    className="bg-transparent"
                  >
                    <PromptInputBody>
                      <PromptInputTextarea
                        placeholder={
                          status === "streaming"
                            ? "等待当前回复完成…"
                            : "继续追问，例如：进一步分析受影响的下游服务"
                        }
                        disabled={status === "streaming" || status === "dispatching"}
                      />
                    </PromptInputBody>
                    <PromptInputFooter>
                      <span className="text-muted-foreground text-xs">
                        {status === "streaming"
                          ? "AI 正在分析，稍后可继续追问"
                          : "Enter 发送 · Shift+Enter 换行"}
                      </span>
                      <PromptInputSubmit
                        disabled={status === "streaming" || status === "dispatching"}
                      />
                    </PromptInputFooter>
                  </PromptInput>
                </PromptInputProvider>
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
                <Select value={env} onValueChange={(v) => setEnv(v as Env)}>
                  <SelectTrigger className="h-11 w-full rounded-full border-none bg-transparent text-sm shadow-none sm:w-32">
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
                  className="h-11 flex-1 border-none bg-transparent text-sm font-mono shadow-none focus-visible:ring-0"
                  autoFocus
                />
                <Button
                  type="submit"
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
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 pl-3 pr-1 text-sm">
      <h1 className="text-foreground font-medium">SOP 质检</h1>
      <span aria-hidden className="bg-border h-4 w-px" />
      <span>
        环境 · <span className="text-foreground">{ENV_LABEL[env]}</span>
      </span>
      <span className="min-w-0">
        SOP ·{" "}
        <span className="text-foreground truncate font-mono">{sopId}</span>
      </span>
      {threadId ? (
        <span className="font-mono hidden lg:inline">
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
