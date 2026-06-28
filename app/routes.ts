import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  layout("layouts/app-layout.tsx", [
    index("routes/home.tsx"),
    route("sop-checks/new", "routes/sop-check-new.tsx"),
  ]),
] satisfies RouteConfig
