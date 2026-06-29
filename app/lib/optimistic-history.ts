import { useSyncExternalStore } from "react"

import type { HistoryItem } from "~/lib/history-types"

let optimisticItems: HistoryItem[] = []
const EMPTY_SNAPSHOT: HistoryItem[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return optimisticItems
}

function getServerSnapshot(): HistoryItem[] {
  return EMPTY_SNAPSHOT
}

export function addOptimisticHistory(item: HistoryItem) {
  if (optimisticItems.some((existing) => existing.id === item.id)) return
  optimisticItems = [item, ...optimisticItems]
  emit()
}

export function reconcileOptimisticHistory(serverIds: Set<string>) {
  if (optimisticItems.length === 0) return
  const next = optimisticItems.filter((item) => !serverIds.has(item.id))
  if (next.length === optimisticItems.length) return
  optimisticItems = next
  emit()
}

export function useOptimisticHistory(): HistoryItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
