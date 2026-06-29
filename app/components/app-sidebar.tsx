import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  HistoryIcon,
  LoaderIcon,
  MoonIcon,
  PlayCircleIcon,
  SettingsIcon,
  SunIcon,
  XCircleIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useRouteLoaderData } from "react-router"

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
import type { CheckStatus, HistoryItem } from "~/lib/history-types"
import {
  reconcileOptimisticHistory,
  useOptimisticHistory,
} from "~/lib/optimistic-history"

const statusIcon: Record<
  CheckStatus,
  { icon: typeof CheckCircle2Icon; className: string }
> = {
  pass: { icon: CheckCircle2Icon, className: "text-emerald-500" },
  warn: { icon: AlertTriangleIcon, className: "text-amber-500" },
  fail: { icon: XCircleIcon, className: "text-red-500" },
  running: { icon: LoaderIcon, className: "text-primary animate-spin" },
}

type LayoutLoaderData = { history: HistoryItem[] }

function formatCreatedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  return `${mm}-${dd} ${hh}:${mi}`
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const loaderData = useRouteLoaderData<LayoutLoaderData>("layouts/app-layout")
  const serverItems = loaderData?.history ?? []
  const optimisticItems = useOptimisticHistory()

  useEffect(() => {
    if (serverItems.length === 0) return
    reconcileOptimisticHistory(new Set(serverItems.map((item) => item.id)))
  }, [serverItems])

  const items = useMemo(() => {
    const seen = new Set<string>()
    const merged: HistoryItem[] = []
    for (const item of optimisticItems) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
    for (const item of serverItems) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
    return merged
  }, [optimisticItems, serverItems])

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
                      {items.length === 0 ? (
                        <SidebarMenuSubItem>
                          <span className="text-muted-foreground px-2 py-1.5 text-xs">
                            暂无历史
                          </span>
                        </SidebarMenuSubItem>
                      ) : (
                        items.map((item) => {
                          const Status = statusIcon[item.status]
                          return (
                            <SidebarMenuSubItem key={item.id}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  pathname === `/sop-checks/${item.id}`
                                }
                              >
                                <Link to={`/sop-checks/${item.id}`}>
                                  <Status.icon className={Status.className} />
                                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                    <span className="truncate">
                                      {item.title}
                                    </span>
                                    <span className="text-muted-foreground shrink-0 text-[10px]">
                                      {formatCreatedAt(item.created_at)}
                                    </span>
                                  </span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })
                      )}
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
            <ModeToggle />
          </SidebarMenuItem>
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

function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"
  const label = mounted ? (isDark ? "切换到浅色" : "切换到深色") : "切换主题"
  const Icon = isDark ? SunIcon : MoonIcon

  return (
    <SidebarMenuButton
      onClick={() => setTheme(isDark ? "light" : "dark")}
      tooltip={label}
      aria-label={label}
    >
      <Icon />
      <span>{label}</span>
    </SidebarMenuButton>
  )
}
