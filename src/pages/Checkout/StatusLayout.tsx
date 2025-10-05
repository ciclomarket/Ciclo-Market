import { ReactNode } from 'react'
import Container from '../../components/Container'
import Button from '../../components/Button'

interface StatusLayoutProps {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  secondary?: ReactNode
  tone: 'success' | 'failure' | 'pending'
}

const toneStyles: Record<StatusLayoutProps['tone'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  failure: 'border-red-200 bg-red-50 text-red-900',
  pending: 'border-amber-200 bg-amber-50 text-amber-900'
}

export default function StatusLayout({
  title,
  description,
  actionLabel,
  onAction,
  secondary,
  tone
}: StatusLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#0c1723] py-12">
      <Container>
        <div className="mx-auto max-w-2xl">
          <div className={`rounded-3xl border ${toneStyles[tone]} p-8 shadow`}>
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="mt-2 text-sm leading-relaxed">{description}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={onAction}>
                  {actionLabel}
                </Button>
                {secondary}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
