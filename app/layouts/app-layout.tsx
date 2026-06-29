import { Outlet } from "react-router"

import { AppSidebar } from "~/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { TooltipProvider } from "~/components/ui/tooltip"
import type { HistoryResponse } from "~/lib/history-types"

import type { Route } from "./+types/app-layout"

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL("/v1/apis/sop/history?page_size=20", new URL(request.url).origin)
  const response = await fetch(url, { headers: { accept: "application/json" } })
  if (!response.ok) {
    return { history: [] as HistoryResponse["items"] }
  }
  const data = (await response.json()) as HistoryResponse
  return { history: data.items }
}

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
