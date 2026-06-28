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
    label: "Active servers",
    value: "128",
    delta: "+4 since yesterday",
    icon: ServerIcon,
  },
  {
    label: "Open incidents",
    value: "3",
    delta: "1 critical",
    icon: ShieldAlertIcon,
  },
  {
    label: "Healthy services",
    value: "97.4%",
    delta: "rolling 24h",
    icon: ActivityIcon,
  },
]

export default function Home() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <Badge variant="secondary">preview</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Welcome back. Here is the current state of your infrastructure.
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
