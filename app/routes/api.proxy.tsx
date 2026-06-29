const DEFAULT_AI_STREAM_BASE_URL = "http://127.0.0.1:8000"

function getTargetUrl(request: Request) {
  const incoming = new URL(request.url)
  const base = process.env.AI_STREAM_BASE_URL ?? DEFAULT_AI_STREAM_BASE_URL
  const target = new URL(incoming.pathname + incoming.search, base)
  return target.toString()
}

function getForwardHeaders(request: Request) {
  const headers = new Headers(request.headers)
  headers.delete("connection")
  headers.delete("content-length")
  headers.delete("host")
  return headers
}

async function proxy(request: Request) {
  const method = request.method.toUpperCase()
  const init: RequestInit = {
    headers: getForwardHeaders(request),
    method,
    redirect: "manual",
  }

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer()
  }

  const upstream = await fetch(getTargetUrl(request), init)
  const headers = new Headers(upstream.headers)
  headers.delete("content-encoding")
  headers.delete("content-length")

  return new Response(upstream.body, {
    headers,
    status: upstream.status,
    statusText: upstream.statusText,
  })
}

export function loader({ request }: { request: Request }) {
  return proxy(request)
}

export function action({ request }: { request: Request }) {
  return proxy(request)
}

