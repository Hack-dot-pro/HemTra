import { describe, expect, it, vi } from 'vitest'
import { fetchRemoteVersion, isVersionMismatch, VERSION_URL } from './version'

describe('isVersionMismatch', () => {
  it('true khi bản trên máy chủ khác bản đang chạy', () => {
    expect(isVersionMismatch('build-a', { version: 'build-b' })).toBe(true)
  })

  it('false khi trùng nhau', () => {
    expect(isVersionMismatch('build-a', { version: 'build-a' })).toBe(false)
  })

  it('false khi chưa từng nhúng build id (không báo cập nhật giả)', () => {
    expect(isVersionMismatch('', { version: 'build-b' })).toBe(false)
  })

  it('false khi không có file version (offline / chưa deploy)', () => {
    expect(isVersionMismatch('build-a', null)).toBe(false)
    expect(isVersionMismatch('build-a', {})).toBe(false)
    expect(isVersionMismatch('build-a', { version: '' })).toBe(false)
  })
})

describe('fetchRemoteVersion', () => {
  it('đọc được version.json', async () => {
    const fetchImpl = vi.fn(viFetch(JSON.stringify({ version: 'x1' }), 200))
    await expect(fetchRemoteVersion(fetchImpl as unknown as typeof fetch)).resolves.toEqual({ version: 'x1' })
    expect(fetchImpl).toHaveBeenCalledWith(VERSION_URL, { cache: 'no-store' })
  })

  it('HTTP != 200 → null', async () => {
    await expect(fetchRemoteVersion(viFetch('{}', 404))).resolves.toBeNull()
  })

  it('mất mạng → null (không ném lỗi)', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(fetchRemoteVersion(fetchImpl)).resolves.toBeNull()
  })

  it('JSON hỏng → null', async () => {
    await expect(fetchRemoteVersion(viFetch('not-json', 200))).resolves.toBeNull()
  })
})

function viFetch(body: string, status: number): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch
}
