// Kiểm tra bản deploy — P4-T6, design §8.6.
// Client giữ __BUILD_ID__ nhúng lúc build; GET /version.json (no-store) trả id của
// bản ĐANG Ở MÁY CHỦ → lệch nghĩa là vừa deploy bản mới (tab cũ còn bundle cũ).

export type VersionFile = {
  version?: string
  builtAt?: string
}

export const VERSION_URL = '/version.json'

/** true = bản trên máy chủ khác bản đang chạy → cần dọn cache/tải lại. */
export function isVersionMismatch(currentBuildId: string, remote: VersionFile | null): boolean {
  if (!remote || typeof remote.version !== 'string' || remote.version === '') return false
  if (!currentBuildId) return false
  return remote.version !== currentBuildId
}

/**
 * Lấy /version.json không cache. Lỗi mạng hoặc file thiếu → null
 * (không hiện thông báo cập nhật giả — offline thì cứ để app chạy).
 */
export async function fetchRemoteVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<VersionFile | null> {
  try {
    const res = await fetchImpl(VERSION_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') return null
    return data as VersionFile
  } catch {
    return null
  }
}
