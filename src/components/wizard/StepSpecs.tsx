import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const BRAKE_TYPES = ['Disco hidráulico', 'Disco mecánico', 'Herradura'] as const;
const MATERIALS = ['Aluminio', 'Carbono', 'Aluminio + Carbono', 'Titanio', 'Acero', 'Otro'] as const;

const CUSTOM_BRAND_VALUE = '__custom__';
const MIN_YEAR = 1980;
const MAX_YEAR = 2026;
const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MAX_YEAR - i));

const normalize = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const BRAND_ALIASES: Record<string, string> = {
  'merida': 'Merida',
  'merida ': 'Merida',
  'mérida': 'Merida',
  'cervelo': 'Cervelo',
  'cervélo': 'Cervelo',
  'van ryzel': 'Van Rysel',
  'van rysel (van ryzen)': 'Van Rysel',
  'van ryzen': 'Van Rysel',
  'wilier triestina': 'Wilier',
};

const canonicalBrand = (raw: string) => {
  const key = normalize(raw);
  return BRAND_ALIASES[key] || raw.trim();
};

const uniqueSorted = (values: string[]) => {
  const seen = new Map<string, string>();
  for (const v of values) {
    const c = canonicalBrand(v);
    const key = normalize(c);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, c);
  }
  return Array.from(seen.values()).sort((a, b) => normalize(a).localeCompare(normalize(b), 'es'));
};

const BIKE_BRANDS = uniqueSorted([
  'Aurum',
  'Argon 18',
  'BMC',
  'BH',
  'Berria',
  'Cannondale',
  'Canyon',
  'Carrera',
  'Celer',
  'Cervélo',
  'Colnago',
  'Cube',
  'EOS',
  'Factor',
  'Felt',
  'FRM',
  'Fuji',
  'GW',
  'Giant',
  'Intense',
  'KTM',
  'Laudenbach',
  'Liv',
  'Look',
  'Merida',
  'Mérida',
  'Niner',
  'Orbea',
  'Pinarello',
  'Pivot',
  'Polygon',
  'Quintana Roo',
  'Raleigh',
  'Rower',
  'S-Works',
  'SARS',
  'Sava',
  'SBK',
  'Scott',
  'SLP',
  'Specialized',
  'Sunpeed',
  'Tern',
  'Top Mega',
  'Trek',
  'Trifox',
  'Trinx',
  'Twister',
  'Van Rysel (Van Ryzen)',
  'Venzo',
  'Vivi',
  'Volta',
  'Wilier',
  'Wilier Triestina',
]);

const ACCESSORY_BRANDS = uniqueSorted([
  // existentes
  'Garmin',
  'Wahoo',
  'RockShox',
  'Oval',
  'Profile',
  'Superteam',
  'FRM',
  'SBK',
  // agregadas
  'Shimano',
  'SRAM',
  'Campagnolo',
  'Fox',
  'DT Swiss',
  'Zipp',
  'Mavic',
  'Fulcrum',
  'Vision',
  'ENVE',
  'Easton',
  'FSA',
  'Race Face',
  'Hope',
  'Magura',
  'TRP',
  'Pirelli',
  'Continental',
  'Vittoria',
  'Maxxis',
  'Schwalbe',
  'Michelin',
  'Crankbrothers',
  'Time',
  'Look Keo',
  'BBB',
  'PRO',
]);

const APPAREL_BRANDS = uniqueSorted([
  // existentes
  'Adidas',
  // agregadas
  'Castelli',
  'Rapha',
  'Assos',
  'Santini',
  'Sportful',
  'Gobik',
  'Le Col',
  'Alé',
  'Ale',
  'Endura',
  'Pearl Izumi',
  'Giro',
  'Oakley',
  'Fox Racing',
  'Troy Lee Designs',
  'Specialized',
  // regionales
  'Sars',
  'SARS',
  'Venzo',
  'Top Mega',
]);

const NUTRITION_BRANDS = uniqueSorted([
  // existentes
  'Maurten',
  // agregadas
  'SIS (Science in Sport)',
  'GU Energy',
  'PowerBar',
  'Clif',
  'Enervit',
  'High5',
  'NAMEDSPORT',
  'Tailwind',
  // regionales
  'Nutrin',
  'ENA Sport',
  'Gentech',
]);

export default function StepSpecs({ data, onChange, frameSizes = [], wheelSizeOptions = [], drivetrainOptions = [], errors }) {
  const updateField = (field, value) => {
    onChange(field, value);
  };

  const inferTxType = (txt) => {
    const v = String(txt || '').toLowerCase();
    if (!v.trim()) return '';
    if (v.includes('di2') || v.includes('etap') || v.includes('axs') || v.includes('eps') || v.includes('electr')) return 'Electrónico';
    return 'Mecánico';
  };

  const isBike = data.mainCategory === 'Bicicletas';
  const isAccessory = data.mainCategory === 'Accesorios';
  const isApparel = data.mainCategory === 'Indumentaria';
  const isNutrition = data.mainCategory === 'Nutrición';

  const modelPlaceholder = (() => {
    if (isBike) return 'Ej: Domane SL 6, Tarmac SL7';
    if (isAccessory) {
      const sc = String(data.accessorySubcat || '');
      if (sc === 'Ruedas') return 'Ej: Bora WTO 45, Zipp 303';
      if (sc === 'Computadoras') return 'Ej: Edge 540, Elemnt Bolt';
      if (sc === 'Grupos') return 'Ej: Ultegra Di2, Rival AXS';
      if (sc === 'Componentes') return 'Ej: Manillar aero, Stem 100mm';
      return 'Ej: Modelo del accesorio';
    }
    if (isApparel) {
      const sc = String(data.apparelSubcat || '');
      if (sc === 'Casco') return 'Ej: Ventral Air, Aether';
      if (sc === 'Zapatos') return 'Ej: S-Works Torch, RC9';
      if (sc === 'Jersey') return 'Ej: Pro Team, Aero Jersey';
      return 'Ej: Modelo de la prenda';
    }
    if (isNutrition) {
      const sc = String(data.nutritionSubcat || '');
      if (sc === 'Gel') return 'Ej: Gel Doble CHO';
      if (sc === 'Barra') return 'Ej: Barrita energética';
      return 'Ej: Nombre del producto';
    }
    return 'Ej: Modelo';
  })();

  const customBrandPlaceholder = (() => {
    if (isBike) return 'Ej: Trek, Specialized';
    if (isAccessory) return 'Ej: Shimano, Garmin';
    if (isApparel) return 'Ej: Castelli, Rapha';
    if (isNutrition) return 'Ej: Maurten, SIS';
    return 'Escribí la marca';
  })();

  const brandOptions = isBike
    ? BIKE_BRANDS
    : isAccessory
      ? ACCESSORY_BRANDS
      : isApparel
        ? APPAREL_BRANDS
        : NUTRITION_BRANDS;

  const isCustomBrand =
    data.brandSource === 'custom' || (data.brand && !brandOptions.includes(canonicalBrand(data.brand)));

  const currentBrandValue = isCustomBrand
    ? CUSTOM_BRAND_VALUE
    : data.brand && brandOptions.includes(canonicalBrand(data.brand))
      ? canonicalBrand(data.brand)
      : '';

  return (
    <div className="space-y-8">
      {/* Brand & Model */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="space-y-2 md:col-span-4">
          <Label className="text-base font-medium">Marca *</Label>
          <Select
            value={currentBrandValue}
            onValueChange={(v) => {
              if (v === CUSTOM_BRAND_VALUE) {
                updateField('brandSource', 'custom');
                if (data.brand && brandOptions.includes(canonicalBrand(data.brand))) {
                  updateField('brand', '');
                }
                return;
              }
              updateField('brandSource', 'preset');
              updateField('brand', canonicalBrand(v));
            }}
          >
            <SelectTrigger className={cn("h-12", errors?.brand && "border-red-500")}>
              <SelectValue placeholder="Seleccioná una marca" />
            </SelectTrigger>
            <SelectContent>
              {brandOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_BRAND_VALUE}>Otra (escribir)</SelectItem>
            </SelectContent>
          </Select>
          {currentBrandValue === CUSTOM_BRAND_VALUE ? (
            <Input
              placeholder={customBrandPlaceholder}
              value={data.brand || ''}
              onChange={(e) => {
                updateField('brandSource', 'custom');
                updateField('brand', canonicalBrand(e.target.value));
              }}
              className={cn("h-12", errors?.brand && "border-red-500")}
            />
          ) : null}
          {errors?.brand && <p className="text-sm text-red-500">{errors.brand}</p>}
        </div>

        <div className="space-y-2 md:col-span-6">
          <Label className="text-base font-medium">Modelo *</Label>
          <Input
            placeholder={modelPlaceholder}
            value={data.model || ''}
            onChange={(e) => updateField('model', e.target.value)}
            className={cn("h-12", errors?.model && "border-red-500")}
          />
          {errors?.model && <p className="text-sm text-red-500">{errors.model}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-base font-medium">Año</Label>
          <Select value={data.year || ''} onValueChange={(v) => updateField('year', v)}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bike core specs */}
      {isBike && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Material</Label>
              <Select value={data.material || ''} onValueChange={(v) => updateField('material', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIALS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-base font-medium">Talle</Label>
              <Select value={data.frameSize || ''} onValueChange={(v) => updateField('frameSize', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {frameSizes.map((s) => (
                    <SelectItem key={s || 'none'} value={s || ''}>
                      {s || '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Rodado</Label>
              <Select value={data.wheelSize || ''} onValueChange={(v) => updateField('wheelSize', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {wheelSizeOptions.map((s) => (
                    <SelectItem key={s || 'none'} value={s || ''}>
                      {s || '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Tipo de freno *</Label>
              <Select value={data.brakeType || ''} onValueChange={(v) => updateField('brakeType', v)}>
                <SelectTrigger className={cn("h-12", errors?.brakeType && "border-red-500")}>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {BRAKE_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors?.brakeType && <p className="text-sm text-red-500">{errors.brakeType}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Grupo de transmisión *</Label>
              <Select
                value={data.drivetrain || ''}
                onValueChange={(v) => {
                  updateField('drivetrain', v);
                  if (v !== 'Otro' && data.drivetrainOther) updateField('drivetrainOther', '');
                }}
              >
                <SelectTrigger className={cn("h-12", errors?.drivetrain && "border-red-500")}>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {drivetrainOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data.drivetrain === 'Otro' && (
                <Input
                  className="h-12 mt-2"
                  placeholder="Detalle del grupo (ej: 105 Di2)"
                  value={data.drivetrainOther || ''}
                  onChange={(e) => updateField('drivetrainOther', e.target.value)}
                />
              )}
              {errors?.drivetrain && <p className="text-sm text-red-500">{errors.drivetrain}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Tipo de transmisión</Label>
              <Input
                className="h-12"
                value={inferTxType(data.drivetrain === 'Otro' ? data.drivetrainOther : data.drivetrain) || ''}
                placeholder="Auto (mecánico/electrónico)"
                disabled
              />
            </div>
          </div>
        </>
      )}

      {/* Accessories */}
      {isAccessory && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Uso</Label>
              <Select value={data.accUseType || ''} onValueChange={(v) => updateField('accUseType', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {['Ruta', 'MTB', 'Gravel', 'Urbano'].map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-base font-medium">Material</Label>
              <Select value={data.material || ''} onValueChange={(v) => updateField('material', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIALS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Rodado (si aplica)</Label>
              <Select value={data.wheelSize || ''} onValueChange={(v) => updateField('wheelSize', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {wheelSizeOptions.map((s) => (
                    <SelectItem key={s || 'none'} value={s || ''}>
                      {s || '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Tipo de freno (si aplica)</Label>
              <Select value={data.brakeType || ''} onValueChange={(v) => updateField('brakeType', v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {['Disco', 'Herradura', ...BRAKE_TYPES].map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {data.accessorySubcat === 'Grupos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-base font-medium">Contenido</Label>
                <Select value={data.groupComplete || ''} onValueChange={(v) => updateField('groupComplete', v)}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Completo">Completo</SelectItem>
                    <SelectItem value="Partes">Partes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-base font-medium">Modo</Label>
                <Select value={data.groupMode || ''} onValueChange={(v) => updateField('groupMode', v)}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mecánico">Mecánico</SelectItem>
                    <SelectItem value="Electrónico">Electrónico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.groupComplete === 'Completo' && (
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-base font-medium">Grupo</Label>
                  <Select value={data.drivetrain || ''} onValueChange={(v) => updateField('drivetrain', v)}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivetrainOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Compatibilidad (opcional)</Label>
              <Input
                className="h-12"
                placeholder="Ej: 11v, XDR, 12x100"
                value={data.accCompatibility || ''}
                onChange={(e) => updateField('accCompatibility', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-base font-medium">Peso (opcional)</Label>
              <Input
                className="h-12"
                placeholder="Ej: 1520 g (par)"
                value={data.accWeight || ''}
                onChange={(e) => updateField('accWeight', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Apparel */}
      {isApparel && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-base font-medium">Género (opcional)</Label>
            <Select value={data.apparelGender || ''} onValueChange={(v) => updateField('apparelGender', v)}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {['Unisex', 'Hombre', 'Mujer'].map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-base font-medium">Talle (opcional)</Label>
            <Input
              className="h-12"
              placeholder="Ej: M, 42, L"
              value={data.apparelSize || ''}
              onChange={(e) => updateField('apparelSize', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Nutrition */}
      {isNutrition && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-base font-medium">CHO (opcional)</Label>
            <Input className="h-12" value={data.nutriCHO || ''} onChange={(e) => updateField('nutriCHO', e.target.value)} placeholder="Ej: 40" />
          </div>
          <div className="space-y-2">
            <Label className="text-base font-medium">Sodio (opcional)</Label>
            <Input className="h-12" value={data.nutriSodium || ''} onChange={(e) => updateField('nutriSodium', e.target.value)} placeholder="Ej: 200" />
          </div>
          <div className="space-y-2">
            <Label className="text-base font-medium">Porciones (opcional)</Label>
            <Input className="h-12" value={data.nutriServings || ''} onChange={(e) => updateField('nutriServings', e.target.value)} placeholder="Ej: 10" />
          </div>
          <div className="space-y-2">
            <Label className="text-base font-medium">Peso neto (opcional)</Label>
            <Input className="h-12" value={data.nutriNetWeight || ''} onChange={(e) => updateField('nutriNetWeight', e.target.value)} placeholder="Ej: 500g" />
          </div>
        </div>
      )}

      {/* Description + Extras */}
      <div className="space-y-2">
        <Label className="text-base font-medium">Descripción</Label>
        <Textarea
          placeholder="Describí el estado, historial, qué incluye, etc."
          value={data.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          className="min-h-[120px] resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-base font-medium">Extras / Agregados (opcional)</Label>
        <Textarea
          placeholder="Upgrades, mantenimiento, accesorios incluidos…"
          value={data.extras || ''}
          onChange={(e) => updateField('extras', e.target.value)}
          className="min-h-[100px] resize-none"
        />
      </div>
    </div>
  );
}
