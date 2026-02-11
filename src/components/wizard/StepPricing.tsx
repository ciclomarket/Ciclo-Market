/* eslint-disable react/prop-types */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { OTHER_CITY_OPTION } from '@/constants/locations';

const CURRENCY_META = {
  USD: { label: 'USD', symbol: 'US$' },
  ARS: { label: 'ARS', symbol: '$' },
} as const;

export default function StepPricing({ data, onChange, errors, provinces = [], currencies = ['USD', 'ARS'] }) {
  const updateField = (field, value) => {
    onChange(field, value);
  };

  const selectedCurrency = CURRENCY_META[(data.priceCurrency || 'USD') as 'USD' | 'ARS'] || CURRENCY_META.USD;
  const provinceOptions = provinces.map((p) => (typeof p === 'string' ? p : p.name));
  const cityOptions =
    (provinces.find((p) => (typeof p === 'string' ? p === data.province : p.name === data.province)) as any)
      ?.cities ?? [];
  const cityOptionsNoOther = Array.isArray(cityOptions) ? cityOptions.filter((c) => c && c !== OTHER_CITY_OPTION) : [];
  const cityHasOther = Array.isArray(cityOptions) && cityOptions.includes(OTHER_CITY_OPTION);
  const inferredCustomCity = Boolean(
    data.city &&
      Array.isArray(cityOptionsNoOther) &&
      cityOptionsNoOther.length > 0 &&
      !cityOptionsNoOther.includes(data.city)
  );
  const isCustomCity = data.cityMode === 'custom' || inferredCustomCity;
  const customCityValue = (data.cityCustom || (isCustomCity ? data.city : '') || '').toString();
  const citySelectValue = isCustomCity ? '__other__' : (data.city || '');

  return (
    <div className="space-y-8">
      {/* Price */}
      <div className="space-y-4">
        <Label className="text-base font-medium">Precio *</Label>
        
        <div className="flex gap-3">
          <Select
            value={data.priceCurrency || 'USD'}
            onValueChange={(v) => updateField('priceCurrency', v)}
          >
            <SelectTrigger className="w-28 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {CURRENCY_META[c]?.label || c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
              {selectedCurrency.symbol}
            </span>
            <Input
              type="number"
              placeholder="0"
              value={data.priceInput || ''}
              onChange={(e) => updateField('priceInput', e.target.value)}
              className={cn("h-12 pl-12 text-lg font-medium", errors?.priceInput && "border-red-500")}
            />
          </div>
        </div>
        {errors?.priceInput && <p className="text-sm text-red-500">{errors.priceInput}</p>}

        {/* Negotiable toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="font-medium text-slate-900">Precio negociable</p>
            <p className="text-sm text-slate-500">Mostrar que estás abierto a ofertas</p>
          </div>
          <Switch
            checked={Boolean(data.isNegotiable)}
            onCheckedChange={(v) => updateField('isNegotiable', v)}
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-4">
        <Label className="text-base font-medium">Ubicación *</Label>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm text-slate-600">Provincia</Label>
            <Select
              value={data.province || ''}
              onValueChange={(v) => updateField('province', v)}
            >
              <SelectTrigger className={cn("h-12", errors?.province && "border-red-500")}>
                <SelectValue placeholder="Seleccioná la provincia" />
              </SelectTrigger>
              <SelectContent>
                {provinceOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors?.province && <p className="text-sm text-red-500">{errors.province}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-slate-600">Ciudad</Label>
            {Array.isArray(cityOptionsNoOther) && cityOptionsNoOther.length > 0 ? (
              <Select
                value={citySelectValue}
                onValueChange={(v) => {
                  if (v === '__other__') {
                    updateField('cityMode', 'custom');
                    updateField('city', '');
                    if (!data.cityCustom) updateField('cityCustom', '');
                    return;
                  }
                  updateField('cityMode', 'preset');
                  updateField('cityCustom', '');
                  updateField('city', v);
                }}
              >
                <SelectTrigger className={cn("h-12", errors?.city && "border-red-500")}>
                  <SelectValue placeholder="Seleccioná la ciudad" />
                </SelectTrigger>
                <SelectContent>
                  {cityOptionsNoOther.map((c: string) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  {cityHasOther ? (
                    <SelectItem value="__other__">{OTHER_CITY_OPTION}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Ej: Palermo, San Isidro"
                value={data.city || ''}
                onChange={(e) => updateField('city', e.target.value)}
                className={cn("h-12", errors?.city && "border-red-500")}
              />
            )}
            {isCustomCity && (
              <Input
                className={cn("h-12 mt-2", errors?.city && "border-red-500")}
                placeholder="Escribí tu ciudad"
                value={customCityValue}
                onChange={(e) => {
                  updateField('cityMode', 'custom');
                  updateField('cityCustom', e.target.value);
                }}
              />
            )}
            {errors?.city && <p className="text-sm text-red-500">{errors.city}</p>}
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="space-y-4">
        <Label className="text-base font-medium">WhatsApp (opcional)</Label>
        <p className="text-sm text-slate-500 -mt-2">Si activás Premium, los compradores podrán contactarte directo.</p>
        
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <Select value={data.waCountry || '+54'} onValueChange={(v) => updateField('waCountry', v)}>
            <SelectTrigger className="h-12 col-span-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="+54">🇦🇷 +54</SelectItem>
              <SelectItem value="+55">🇧🇷 +55</SelectItem>
              <SelectItem value="+56">🇨🇱 +56</SelectItem>
              <SelectItem value="+595">🇵🇾 +595</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="col-span-2 sm:col-span-3 h-12"
            inputMode="tel"
            placeholder="Ej.: 1122334455"
            value={data.waLocal || ''}
            onChange={(e) => updateField('waLocal', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
