import type { SupabaseClient } from '@supabase/supabase-js'

// Detecta si la tabla blog_posts contiene columnas SEO/JSON-LD/Theme.
// Hace un select limitado y si falla, asumimos que no están migradas aún.
export async function getOptionalColumns(supabase: SupabaseClient): Promise<{ supportsSeo: boolean }> {
  try {
    const { error } = await supabase
      .from('blog_posts')
      .select('id, seo_title, seo_description, canonical_url, og_image_url, json_ld, theme')
      .limit(1)
    if (error) return { supportsSeo: false }
    return { supportsSeo: true }
  } catch {
    return { supportsSeo: false }
  }
}

