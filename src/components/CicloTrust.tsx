import type { UserProfileRecord } from '../services/users'

type Props = {
  profile: UserProfileRecord | null
  paidPlanActive: boolean
  publishedCount?: number
}

const segmentColor = (idx: number) => {
  if (idx <= 2) return 'bg-amber-400'
  if (idx === 3) return 'bg-lime-500'
  return 'bg-emerald-500'
}

export default function CicloTrust({ profile, paidPlanActive, publishedCount = 0 }: Props) {
  const identityVerified = Boolean(profile?.verified)
  const profileComplete = Boolean(
    (profile?.instagram_handle && profile.instagram_handle.trim()) ||
      (profile?.store_instagram && profile.store_instagram.trim()) ||
      (profile?.bio && profile.bio.trim().length >= 10)
  )
  const activity = publishedCount > 0
  const premium = paidPlanActive

  const score =
    (identityVerified ? 2 : 0) +
    (premium ? 1.5 : 0) +
    (profileComplete ? 1 : 0) +
    (activity ? 0.5 : 0)

  const positives: string[] = []
  if (identityVerified) positives.push('Identidad Verificada')
  if (profileComplete) positives.push('Perfil Completo (Redes vinculadas)')
  if (activity) positives.push('Usuario con publicaciones')
  if (premium) positives.push('Miembro Premium')

  const filled = (idx: number) => score >= idx - 0.5

  return (
    <div className="mt-6 border-t border-gray-100 pt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Nivel de confianza</div>
        <div className="text-xs font-medium text-gray-400">{Math.min(5, Math.max(0, score)).toFixed(1)}/5</div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const idx = i + 1
          return (
            <div
              key={idx}
              className={`h-1.5 rounded-full ${filled(idx) ? segmentColor(idx) : 'bg-gray-200'}`}
              aria-hidden="true"
            />
          )
        })}
      </div>

      {positives.length > 0 ? (
        <div className="mt-4 space-y-2">
          {positives.map((label) => (
            <div key={label} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-emerald-600">✓</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-gray-500">
          Perfil en proceso de verificación.
        </div>
      )}
    </div>
  )
}

