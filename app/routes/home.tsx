import { ActivityIcon, ServerIcon, ShieldAlertIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

const stats = [
  {
    label: "在线服务器",
    value: "128",
    delta: "较昨日 +4",
    icon: ServerIcon,
  },
  {
    label: "未解决事件",
    value: "3",
    delta: "1 个严重",
    icon: ShieldAlertIcon,
  },
  {
    label: "健康服务占比",
    value: "97.4%",
    delta: "过去 24 小时",
    icon: ActivityIcon,
  },
]

export default function Home() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">仪表盘</h1>
          <Badge variant="secondary">预览</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          欢迎回来，以下是当前基础设施的运行状态。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <stat.icon className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">{stat.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
