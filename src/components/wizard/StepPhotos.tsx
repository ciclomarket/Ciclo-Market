/* eslint-disable react/prop-types */
import { Label } from '@/components/ui/label';
import ImageUploader from '@/components/listing/ImageUploader';
import { Camera, CheckCircle2 } from 'lucide-react';

const photoTips = [
  'Foto del lado derecho de la bicicleta completa',
  'Detalle del cuadro y marca',
  'Transmisión y cassette',
  'Frenos y ruedas',
  'Cualquier detalle de desgaste o imperfección',
];

export default function StepPhotos({ data, onChange, errors, maxPhotos = 12, uploading, progress, onAddFiles }) {
  const visibleCap = (() => {
    const raw = Number(data?.grantedVisiblePhotos || 4)
    if (!Number.isFinite(raw) || raw <= 0) return 4
    return Math.max(1, Math.min(12, raw))
  })()
  return (
    <div className="space-y-8">
      <div>
        <Label className="text-base font-medium">Fotos de la bicicleta *</Label>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Subí hasta {maxPhotos} fotos. Elegí cuál será la portada (podés cambiarla cuando quieras).
        </p>
        
        <ImageUploader
          images={data.images || []}
          max={maxPhotos}
          onAddFiles={onAddFiles}
          onChange={(images) => onChange('images', images)}
        />
        {errors?.images && <p className="text-sm text-red-500 mt-2">{errors.images}</p>}
        <p className="mt-3 text-xs text-slate-500">
          Tu plan actual mostrará las primeras <b>{visibleCap}</b> fotos. Podés subir hasta {maxPhotos} y al mejorar el plan se habilitan automáticamente.
        </p>
        {uploading && (
          <p className="mt-2 text-xs text-slate-500">
            Subiendo imágenes… {progress}%
          </p>
        )}
      </div>

      {/* Tips */}
      <div className="bg-slate-50 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-slate-600" />
          <h4 className="font-medium text-slate-900">Tips para mejores fotos</h4>
        </div>
        <ul className="space-y-2">
          {photoTips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
