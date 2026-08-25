import { useRef } from 'react'
import { Camera, CheckCircle2, Loader2 } from 'lucide-react'
import useUpload from '@/hooks/useUpload'

export type ChecklistItemKey = 'frame' | 'drivetrain' | 'brakes' | 'wheels' | 'scratches'

export type ChecklistItem = {
  ok: boolean
  photoUrl: string | null
  notes: string
}

export type ConditionChecklistValue = Record<ChecklistItemKey, ChecklistItem>

export const EMPTY_CHECKLIST: ConditionChecklistValue = {
  frame: { ok: true, photoUrl: null, notes: '' },
  drivetrain: { ok: true, photoUrl: null, notes: '' },
  brakes: { ok: true, photoUrl: null, notes: '' },
  wheels: { ok: true, photoUrl: null, notes: '' },
  scratches: { ok: true, photoUrl: null, notes: '' },
}

export function isChecklistComplete(value: ConditionChecklistValue | null | undefined): boolean {
  if (!value) return false
  return (['frame', 'drivetrain', 'brakes', 'wheels', 'scratches'] as ChecklistItemKey[]).every(
    (key) => Boolean(value[key]?.photoUrl)
  )
}

const ITEMS: Array<{ key: ChecklistItemKey; label: string; help: string }> = [
  { key: 'frame', label: 'Cuadro', help: 'Foto general del cuadro, sin golpes ocultos' },
  { key: 'drivetrain', label: 'Transmisión', help: 'Cassette, cadena y platos' },
  { key: 'brakes', label: 'Frenos', help: 'Pastillas/zapatas y discos o llantas de freno' },
  { key: 'wheels', label: 'Ruedas', help: 'Llantas, rayos y estado de cubiertas' },
  { key: 'scratches', label: 'Golpes o rayones', help: 'Foto de cualquier marca visible (o del estado general si no hay)' },
]

type Props = {
  value: ConditionChecklistValue
  onChange: (next: ConditionChecklistValue) => void
  sellerVerified?: boolean
}

export default function ConditionChecklist({ value, onChange, sellerVerified }: Props) {
  const { uploadFiles, uploading } = useUpload()
  const uploadingKeyRef = useRef<ChecklistItemKey | null>(null)

  const updateItem = (key: ChecklistItemKey, patch: Partial<ChecklistItem>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } })
  }

  const handlePhoto = async (key: ChecklistItemKey, file: File | undefined) => {
    if (!file) return
    uploadingKeyRef.current = key
    const urls = await uploadFiles([file])
    uploadingKeyRef.current = null
    if (urls[0]) updateItem(key, { photoUrl: urls[0] })
  }

  const complete = isChecklistComplete(value)

  return (
    <div className="bg-slate-50 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Camera className="w-5 h-5 text-slate-600" />
        <h4 className="font-medium text-slate-900">Checklist de condición (Pago Protegido)</h4>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Completá una foto por ítem para habilitar la opción de Pago Protegido en tu publicación.
        {complete ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium ml-2">
            <CheckCircle2 className="w-4 h-4" /> Completo
          </span>
        ) : null}
      </p>

      {sellerVerified === false ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Para ofrecer Pago Protegido también necesitás verificar tu identidad (Panel &gt; Configuración &gt; Verificación).
        </p>
      ) : null}

      <div className="space-y-4">
        {ITEMS.map(({ key, label, help }) => {
          const item = value[key]
          return (
            <div key={key} className="flex items-start gap-4 bg-white rounded-xl p-4 border border-slate-100">
              <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center">
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={label} className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{label}</p>
                  <label className="text-xs font-medium text-sky-600 cursor-pointer">
                    {uploading && uploadingKeyRef.current === key ? (
                      <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Subiendo…</span>
                    ) : item.photoUrl ? 'Cambiar foto' : 'Subir foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhoto(key, e.target.files?.[0])}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{help}</p>
                <input
                  type="text"
                  value={item.notes}
                  onChange={(e) => updateItem(key, { notes: e.target.value })}
                  placeholder="Notas (opcional)"
                  className="mt-2 w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
