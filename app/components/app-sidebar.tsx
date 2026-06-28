import {
  LayoutDashboardIcon,
  MessagesSquareIcon,
  ScrollTextIcon,
  ServerIcon,
  SettingsIcon,
  TerminalIcon,
} from "lucide-react"
import { Link, useLocation } from "react-router"

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
  SidebarRail,
  SidebarTrigger,
} from "~/components/ui/sidebar"

const overview = [
  { title: "仪表盘", to: "/", icon: LayoutDashboardIcon },
  { title: "会话", to: "/conversations", icon: MessagesSquareIcon },
]

const operations = [
  { title: "服务器", to: "/servers", icon: ServerIcon },
  { title: "日志", to: "/logs", icon: ScrollTextIcon },
  { title: "运维手册", to: "/runbooks", icon: TerminalIcon },
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
          <SidebarGroupLabel>概览</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {overview.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.to}
                    tooltip={item.title}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>运维</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operations.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.to}
                    tooltip={item.title}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
