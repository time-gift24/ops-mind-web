import {
  ActivityIcon,
  ArrowRightIcon,
  PlayCircleIcon,
  ServerIcon,
  ShieldAlertIcon,
} from "lucide-react"
import { Link } from "react-router"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

type Stat = {
  label: string
  value: string
  delta: string
  icon: typeof ServerIcon
  tone?: "default" | "warn" | "ok"
}

const stats: Stat[] = [
  {
    label: "在线服务器",
    value: "128",
    delta: "较昨日 +4",
    icon: ServerIcon,
    tone: "ok",
  },
  {
    label: "未解决事件",
    value: "3",
    delta: "1 个严重",
    icon: ShieldAlertIcon,
    tone: "warn",
  },
  {
    label: "健康服务占比",
    value: "97.4%",
    delta: "过去 24 小时",
    icon: ActivityIcon,
    tone: "ok",
  },
]

const toneClass: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-500",
  ok: "text-emerald-600 dark:text-emerald-500",
}

export default function Home() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
          <Badge variant="secondary">预览</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          欢迎回来，以下是当前基础设施的运行状态。
        </p>
      </div>

      <Card className="from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border-primary/20 bg-gradient-to-br">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">发起一次 SOP 质检</CardTitle>
            <CardDescription className="text-sm">
              选择环境与 SOP 单号，AI 将自动审查执行结果并给出风险评级。
            </CardDescription>
          </div>
          <Button asChild size="lg" className="h-11 gap-2 rounded-full">
            <Link to="/sop-checks/new">
              <PlayCircleIcon className="size-4" />
              发起 SOP 质检
              <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <stat.icon className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-3xl tabular-nums">
                {stat.value}
              </CardTitle>
              <p
                className={`mt-1 text-xs ${
                  toneClass[stat.tone ?? "default"]
                }`}
              >
                {stat.delta}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
