import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  layout("layouts/app-layout.tsx", [
    index("routes/home.tsx"),
    route("sop-checks/new", "routes/sop-check-new.tsx"),
  ]),

  // Mock API endpoints (resource routes – no UI component).
  route("v1/apis/sop", "routes/api.sop.tsx"),
  route("v1/apis/sse/:thread_id", "routes/api.sse.tsx"),
  route("v1/apis/sop/history", "routes/api.sop-history.tsx"),
] satisfies RouteConfig
