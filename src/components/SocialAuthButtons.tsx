import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Provider = 'google' | 'facebook'

export type SocialAuthButtonConfig = {
  id: Provider
  label: string
  loading?: boolean
  disabled?: boolean
  onClick: () => void
  helperText?: string
}

const PROVIDER_ICON: Record<Provider, ReactNode> = {
  google: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 5.5c1.72 0 3.27.59 4.48 1.68l3.09-3.09C17.45 1.64 14.93.5 12 .5 6.87.5 2.54 3.82.98 8.36l3.74 2.91C5.47 7.93 8.46 5.5 12 5.5z" />
      <path fill="#34A853" d="M12 22.5c3.11 0 5.72-1.02 7.61-2.81l-3.52-2.88c-1.03.69-2.35 1.08-3.86 1.08-2.77 0-5.11-1.86-5.93-4.43H2.76v3.1C4.69 19.98 8.11 22.5 12 22.5z" />
      <path fill="#4285F4" d="M23.5 12c0-.8-.08-1.58-.23-2.32H12v4.64h6.51c-.29 1.48-1.1 2.74-2.29 3.6l3.52 2.88C21.92 18.93 23.5 15.8 23.5 12z" />
      <path fill="#FBBC05" d="M6.69 13.59A5.63 5.63 0 016.38 12c0-.55.09-1.09.26-1.59V7.36H2.76A9.97 9.97 0 002 12c0 1.59.36 3.1 1.03 4.43l3.66-2.84z" />
    </svg>
  ),
  facebook: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.49 0-1.954.928-1.954 1.88v2.26h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
      <path fill="#FFF" d="M16.671 15.563l.532-3.49h-3.328v-2.26c0-.952.465-1.88 1.954-1.88h1.513v-2.97s-1.374-.235-2.686-.235c-2.741 0-4.533 1.661-4.533 4.668v2.717H7.078v3.49h3.047V24h3.75v-8.437h2.796z"/>
    </svg>
  ),
}

const PROVIDER_STYLE: Record<Provider, string> = {
  google: 'bg-white text-[#14212e] border-white/60 hover:border-[#14212e]/30 shadow-[0_12px_30px_rgba(12,20,28,0.12)]',
  facebook: 'bg-[#1877F2] text-white border-[#1877F2] hover:brightness-110 shadow-[0_12px_30px_rgba(24,119,242,0.35)]',
}

export function SocialAuthButton({
  provider,
  label,
  loading,
  disabled,
  helperText,
  ...rest
}: {
  provider: Provider
  label: string
  loading?: boolean
  disabled?: boolean
  helperText?: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const baseClass =
    'group relative flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
  const style = PROVIDER_STYLE[provider]
  return (
    <button
      {...rest}
      className={`${baseClass} ${style} ${disabled ? 'cursor-not-allowed opacity-70' : 'hover:-translate-y-[1px]'}`}
      disabled={disabled}
    >
      <span className="flex items-center gap-3">
        <span className="rounded-full bg-white/10 p-2 group-hover:bg-white/15">
          {PROVIDER_ICON[provider]}
        </span>
        <span>{loading ? 'Conectando…' : label}</span>
      </span>
      {helperText && (
        <span className="absolute -bottom-5 text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">
          {helperText}
        </span>
      )}
    </button>
  )
}

export function SocialAuthButtons({ buttons }: { buttons: SocialAuthButtonConfig[] }) {
  return (
    <div className="space-y-3">
      {buttons.map((btn) => (
        <SocialAuthButton
          key={btn.id}
          provider={btn.id}
          label={btn.label}
          onClick={btn.onClick}
          loading={btn.loading}
          disabled={btn.disabled || btn.loading}
        />
      ))}
    </div>
  )
}
