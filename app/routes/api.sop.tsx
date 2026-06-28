import type { Route } from "./+types/api.sop"

type Env = "production" | "staging" | "dev"

type DispatchBody = {
  env?: Env
  sopId?: string
  sop_id?: string
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "POST" } },
    )
  }

  let body: DispatchBody = {}
  try {
    body = (await request.json()) as DispatchBody
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const sopId = (body.sopId ?? body.sop_id ?? "").trim()
  const env = body.env ?? "production"

  if (!sopId) {
    return Response.json({ error: "sop_id_required" }, { status: 400 })
  }

  // Useful for visualising the "下发中" state.
  await new Promise((r) => setTimeout(r, 400))

  return Response.json(
    {
      thread_id: crypto.randomUUID(),
      env,
      sop_id: sopId,
      dispatched_at: new Date().toISOString(),
    },
    { status: 201 },
  )
}

export function loader() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 })
}
