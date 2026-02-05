/* eslint-disable react/prop-types */
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bike,
  Mountain,
  Compass,
  Building2,
  Zap,
  Trophy,
  Timer,
  CircleDot,
  Baby,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const disciplines = [
  { value: 'Ruta', label: 'Ruta', icon: Bike, description: 'Carrera, fondos, criteriums' },
  { value: 'MTB', label: 'Mountain Bike', icon: Mountain, description: 'XC, Trail, Enduro, DH' },
  { value: 'Gravel', label: 'Gravel', icon: Compass, description: 'Aventura, bikepacking, mixto' },
  { value: 'Urbana', label: 'Urbana', icon: Building2, description: 'Commuter, paseo, híbrida' },
  { value: 'E-Bike', label: 'E-Bike', icon: Zap, description: 'Asistida, eléctrica' },
  { value: 'Triatlón', label: 'Triatlón', icon: Trophy, description: 'TT, contrarreloj, aero' },
  { value: 'Fixie', label: 'Fixie', icon: CircleDot, description: 'Piñón fijo, pista urbana' },
  { value: 'Pista', label: 'Pista', icon: Timer, description: 'Velódromo, competición pura' },
  { value: 'Niños', label: 'Niños', icon: Baby, description: 'Infantil, balance, rodados chicos' },
];

export default function StepBasicInfo({
  data,
  onChange,
  errors,
  bikeCategories,
  accessorySubcats,
  apparelSubcats,
  nutritionSubcats,
  conditionOptions,
  conditionCopy,
}) {
  const updateField = (field, value) => {
    onChange(field, value);
  };

  const categoryHelp = (() => {
    if (errors?.category) return errors.category;
    if (data.mainCategory === 'Bicicletas') return 'Elegí el tipo de bicicleta.';
    if (data.mainCategory === 'Accesorios') return 'Elegí la categoría del accesorio.';
    if (data.mainCategory === 'Indumentaria') return 'Elegí la categoría de indumentaria.';
    return 'Elegí el tipo de producto.';
  })();

  const conditionKey = `${data.mainCategory}|${data.condition}`;
  const conditionDesc = data.condition ? (conditionCopy?.[conditionKey] || '') : '';

  return (
    <div className="space-y-8">
      {/* Subcategory selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">
          {data.mainCategory === 'Bicicletas' ? 'Tipo de bicicleta *' : 'Categoría *'}
        </Label>

        {data.mainCategory === 'Bicicletas' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {bikeCategories
              .filter(Boolean)
              .map((d) => {
                const item = disciplines.find((x) => x.value === d) || {
                  value: d,
                  label: d,
                  icon: HelpCircle,
                  description: '',
                }
                const Icon = item.icon
                const isSelected = data.category === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => updateField('category', item.value)}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-xl border-2 transition-all text-left sm:gap-3 sm:p-3 sm:flex-col sm:items-start sm:justify-center sm:min-h-[112px]",
                      isSelected
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <Icon className={cn("w-6 h-6 shrink-0 sm:w-7 sm:h-7 sm:mb-2", isSelected ? "text-slate-900" : "text-slate-400")} />
                    <div className="min-w-0 space-y-1">
                      <span className={cn("font-semibold text-sm leading-tight", isSelected ? "text-slate-900" : "text-slate-700")}>
                          {item.label}
                        </span>
                      {item.description ? (
                        <span className="block text-xs text-slate-500 leading-snug line-clamp-2">{item.description}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
          </div>
        ) : data.mainCategory === 'Accesorios' ? (
          <Select value={data.accessorySubcat || ''} onValueChange={(v) => updateField('accessorySubcat', v)}>
            <SelectTrigger className={cn("h-12", errors?.category && "border-red-500")}>
              <SelectValue placeholder="Seleccioná una categoría" />
            </SelectTrigger>
            <SelectContent>
              {accessorySubcats.map((sc) => (
                <SelectItem key={sc} value={sc}>
                  {sc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : data.mainCategory === 'Indumentaria' ? (
          <Select value={data.apparelSubcat || ''} onValueChange={(v) => updateField('apparelSubcat', v)}>
            <SelectTrigger className={cn("h-12", errors?.category && "border-red-500")}>
              <SelectValue placeholder="Seleccioná una categoría" />
            </SelectTrigger>
            <SelectContent>
              {apparelSubcats.map((sc) => (
                <SelectItem key={sc} value={sc}>
                  {sc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={data.nutritionSubcat || ''} onValueChange={(v) => updateField('nutritionSubcat', v)}>
            <SelectTrigger className={cn("h-12", errors?.category && "border-red-500")}>
              <SelectValue placeholder="Seleccioná una categoría" />
            </SelectTrigger>
            <SelectContent>
              {nutritionSubcats.map((sc) => (
                <SelectItem key={sc} value={sc}>
                  {sc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {errors?.category && <p className="text-sm text-red-500">{errors.category}</p>}
        {!errors?.category && <p className="text-sm text-slate-500">{categoryHelp}</p>}
      </div>

      {/* Condition */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Condición *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {conditionOptions.map((cond) => (
            <button
              key={cond}
              type="button"
              onClick={() => updateField('condition', cond)}
              className={cn(
                "p-4 text-left border-2 rounded-xl transition-all",
                data.condition === cond ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <span className={cn("font-semibold block", data.condition === cond ? "text-slate-900" : "text-slate-700")}>
                {cond}
              </span>
              <span className="mt-1 block text-xs text-slate-500 leading-snug">
                {(conditionCopy?.[`${data.mainCategory}|${cond}`] || conditionCopy?.[`Bicicletas|${cond}`] || '').trim()}
              </span>
            </button>
          ))}
        </div>
        {errors?.condition && <p className="text-sm text-red-500">{errors.condition}</p>}
        {conditionDesc ? <p className="text-sm text-slate-500">{conditionDesc}</p> : null}
      </div>
    </div>
  );
}
