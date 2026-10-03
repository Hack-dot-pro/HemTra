// Đồng bộ outbox bill — P6-T7 (pwa-offline/skill.md §4: "bill vào outbox, tự
// sync khi có mạng"): sync khi mount nếu online + khi event `online` bắn.

import { useCallback, useEffect } from 'react'
import { syncOutbox, type SyncSummary } from './outbox'
import { createBillUploader } from './billUpload'
import { getSupabase } from './supabase'

export async function syncOutboxNow(): Promise<SyncSummary | null> {
  const client = getSupabase()
  if (!client || typeof navigator === 'undefined' || !navigator.onLine) return null
  return syncOutbox({ client, uploadPng: createBillUploader(client) })
}

export function useOutboxSync(): () => Promise<SyncSummary | null> {
  const run = useCallback(() => syncOutboxNow(), [])
  useEffect(() => {
    void run()
    const onOnline = (): void => void run()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [run])
  return run
}
