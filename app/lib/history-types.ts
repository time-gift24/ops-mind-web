export type Env = "production" | "staging" | "dev"

export type CheckStatus = "pass" | "warn" | "fail" | "running"

export type HistoryItem = {
  id: string
  title: string
  env: Env
  sop_id: string
  status: CheckStatus
  created_at: string
}

export type HistoryResponse = {
  items: HistoryItem[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}
