import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

// Test mẫu P0-T4: smoke test App render. Chi tiết chuẩn test: testing/skill.md.
describe('App', () => {
  it('hiển thị tiêu đề Hẻm Trà', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /hẻm trà/i })).toBeInTheDocument()
  })
})
