import { getSupabaseClient, supabaseEnabled } from './supabase'

const TABLE_CANDIDATES = ['app_settings', 'settings', 'config'] as const
const FX_KEY = 'usd_ars_fx'

export async function fetchFxFromSupabase(): Promise<number | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()
  for (const table of TABLE_CANDIDATES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('value')
        .eq('key', FX_KEY)
        .maybeSingle()
      if (error) continue
      if (data && typeof data.value !== 'undefined') {
        const n = Number(data.value)
        return Number.isFinite(n) && n > 0 ? n : null
      }
    } catch { /* ignore */ }
  }
  return null
}

export async function upsertFxInSupabase(fx: number): Promise<boolean> {
  if (!supabaseEnabled) return false
  const supabase = getSupabaseClient()
  for (const table of TABLE_CANDIDATES) {
    try {
      const { error } = await supabase
        .from(table)
        .upsert({ key: FX_KEY, value: String(fx), updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (!error) return true
    } catch { /* ignore */ }
  }
  return false
}

