import { getSupabaseClient, supabaseEnabled } from './supabase'

export interface SupportRequestPayload {
  name: string
  email: string
  message: string
}

export async function submitSupportRequest(payload: SupportRequestPayload): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('support_requests').insert({
      name: payload.name.trim(),
      email: payload.email.trim(),
      message: payload.message.trim(),
      created_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}
