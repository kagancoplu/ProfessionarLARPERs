import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { fallback: (error: Error, reset: () => void) => ReactNode, resetKey?: unknown, children: ReactNode }
interface State { error?: Error }

/**
 * Keeps one broken card from taking the whole page down (a render error otherwise unmounts the route and React
 * Router shows its bare error page). `resetKey` clears the error when the content changes (another drawer).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError (error: unknown): State { return { error: error instanceof Error ? error : new Error(String(error)) } }

  componentDidCatch (error: unknown, info: ErrorInfo): void { console.error('[ui] render error', error, info.componentStack) }

  componentDidUpdate (prev: Props): void { if (this.state.error !== undefined && prev.resetKey !== this.props.resetKey) this.setState({ error: undefined }) }

  render (): ReactNode {
    const { error } = this.state
    return error !== undefined ? this.props.fallback(error, () => this.setState({ error: undefined })) : this.props.children
  }
}
