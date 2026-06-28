import { Outlet } from "react-router"

import { AppSidebar } from "~/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { TooltipProvider } from "~/components/ui/tooltip"

export default function AppLayout() {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset>
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
