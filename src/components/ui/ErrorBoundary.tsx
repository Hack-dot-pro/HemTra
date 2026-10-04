import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

export type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary caught]', error, info)
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="glass-card p-6 text-center text-sm text-white/80">
            <p className="font-semibold text-red-200">Không thể tải nội dung.</p>
            <p className="mt-1 text-xs text-white/60">
              Vui lòng kiểm tra kết nối mạng hoặc thử lại.
            </p>
            <button
              type="button"
              className="glass-btn glass-btn-primary mt-4"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Thử lại
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
