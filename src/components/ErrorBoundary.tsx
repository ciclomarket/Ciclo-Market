import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('[app] Uncaught error', error, info)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="py-10 text-center text-[#14212e]">
          <h2 className="text-lg font-semibold">Ocurrió un problema al cargar la app</h2>
          <p className="mt-2 text-sm text-[#14212e]/70">Actualizá la página o volvé a intentar en unos segundos.</p>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#14212e]/20 bg-white px-4 py-2 text-sm font-semibold text-[#14212e] shadow-sm hover:bg-white/90"
            onClick={() => (typeof window !== 'undefined' ? window.location.reload() : undefined)}
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

