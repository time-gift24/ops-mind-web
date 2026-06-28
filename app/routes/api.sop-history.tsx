import type { Route } from "./+types/api.sop-history"

type Env = "production" | "staging" | "dev"
type CheckStatus = "pass" | "warn" | "fail"

type HistoryItem = {
  id: string
  title: string
  env: Env
  sop_id: string
  status: CheckStatus
  created_at: string
}

const TITLES = [
  "数据库主从延迟",
  "缓存集群健康",
  "网关 5xx 飙升",
  "日志采集巡检",
  "K8s 节点资源",
  "消息队列堆积",
  "支付链路探活",
  "对象存储配额",
  "搜索集群副本",
  "推送服务回执",
  "灰度配置一致性",
  "证书到期检查",
  "Cron 作业巡检",
  "网络抖动排查",
  "鉴权服务健康",
]

const ENVS: Env[] = ["production", "staging", "dev"]
const STATUSES: CheckStatus[] = ["pass", "pass", "pass", "warn", "fail"]

function seeded(seed: number) {
  // Mulberry32 — deterministic so the mock is stable across requests.
  let t = seed
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296
  }
}

const TOTAL = 50

function buildHistory(): HistoryItem[] {
  const rand = seeded(20260628)
  const now = Date.now()
  const items: HistoryItem[] = []
  for (let i = 0; i < TOTAL; i++) {
    const env = ENVS[Math.floor(rand() * ENVS.length)]
    const title = TITLES[Math.floor(rand() * TITLES.length)]
    const status = STATUSES[Math.floor(rand() * STATUSES.length)]
    // Spread the timeline across ~20 days, newest first.
    const offsetMinutes = Math.floor(rand() * 20 * 24 * 60) + i * 17
    const createdAt = new Date(now - offsetMinutes * 60_000)
    const stamp = createdAt
      .toISOString()
      .replaceAll(/[-:T]/g, "")
      .slice(2, 12) // yyMMddHHmm
    items.push({
      id: `c-${stamp}-${i.toString().padStart(3, "0")}`,
      title,
      env,
      sop_id: `SOP-${createdAt.toISOString().slice(0, 10).replaceAll("-", "")}-${(i + 1)
        .toString()
        .padStart(3, "0")}`,
      status,
      created_at: createdAt.toISOString(),
    })
  }
  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  return items
}

const HISTORY = buildHistory()

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const page = clamp(Number(url.searchParams.get("page") ?? "1") || 1, 1, 1000)
  const pageSize = clamp(
    Number(url.searchParams.get("page_size") ?? "20") || 20,
    1,
    100,
  )
  const env = url.searchParams.get("env") as Env | null
  const status = url.searchParams.get("status") as CheckStatus | null

  let filtered = HISTORY
  if (env) filtered = filtered.filter((it) => it.env === env)
  if (status) filtered = filtered.filter((it) => it.status === status)

  const total = filtered.length
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  return Response.json({
    items,
    page,
    page_size: pageSize,
    total,
    has_more: start + items.length < total,
  })
}
