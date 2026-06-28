import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  HistoryIcon,
  PlayCircleIcon,
  SettingsIcon,
  XCircleIcon,
} from "lucide-react"
import { Link, useLocation } from "react-router"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
} from "~/components/ui/sidebar"

const statusIcon = {
  pass: { icon: CheckCircle2Icon, className: "text-emerald-500" },
  warn: { icon: AlertTriangleIcon, className: "text-amber-500" },
  fail: { icon: XCircleIcon, className: "text-red-500" },
} as const

const history: Array<{
  id: string
  title: string
  at: string
  status: keyof typeof statusIcon
}> = [
  { id: "c-2406-281432", title: "数据库主从延迟", at: "06-28 14:32", status: "warn" },
  { id: "c-2406-281015", title: "缓存集群健康", at: "06-28 10:15", status: "pass" },
  { id: "c-2406-272253", title: "网关 5xx 飙升", at: "06-27 22:53", status: "fail" },
  { id: "c-2406-271842", title: "日志采集巡检", at: "06-27 18:42", status: "pass" },
  { id: "c-2406-270900", title: "K8s 节点资源", at: "06-27 09:00", status: "pass" },
]

export function AppSidebar() {
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="group/header flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
              <SidebarMenuButton
                size="lg"
                asChild
                className="flex-1 group-data-[collapsible=icon]:hidden"
              >
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center">
                    <img
                      src="/logo.svg"
                      alt="ops-mind"
                      className="size-8"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">ops-mind</span>
                    <span className="text-muted-foreground text-xs">
                      AI 运维助手
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
              <Link
                to="/"
                aria-label="ops-mind"
                className="hidden aspect-square size-8 items-center justify-center group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:group-hover/header:hidden"
              >
                <img src="/logo.svg" alt="" className="size-8" />
              </Link>
              <SidebarTrigger className="size-8 group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:group-hover/header:inline-flex" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>SOP 质检</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="发起 SOP 质检"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary active:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                >
                  <Link to="/sop-checks/new">
                    <PlayCircleIcon />
                    <span>发起 SOP 质检</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <Collapsible defaultOpen asChild className="group/history">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip="质检历史">
                      <HistoryIcon />
                      <span>质检历史</span>
                      <ChevronRightIcon className="ml-auto size-4 transition-transform group-data-[state=open]/history:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="mt-1 gap-1.5">
                      {history.map((item) => {
                        const Status = statusIcon[item.status]
                        return (
                          <SidebarMenuSubItem key={item.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `/sop-checks/${item.id}`}
                            >
                              <Link to={`/sop-checks/${item.id}`}>
                                <Status.icon className={Status.className} />
                                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                  <span className="truncate">{item.title}</span>
                                  <span className="text-muted-foreground shrink-0 text-[10px]">
                                    {item.at}
                                  </span>
                                </span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="设置">
              <Link to="/settings">
                <SettingsIcon />
                <span>设置</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
