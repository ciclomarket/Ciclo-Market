const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
import { getSupabaseClient, supabaseEnabled } from './supabase'

export type Credit = {
  id: string
  created_at: string
  plan_code: 'basic' | 'premium'
  status: 'available' | 'used' | 'pending' | 'expired' | 'cancelled'
  used_at?: string | null
  expires_at?: string | null
  listing_id?: string | null
}

export async function fetchMyCredits(userId: string): Promise<Credit[]> {
  // Sistema de créditos deshabilitado
  return []
}

export async function fetchCreditsHistory(userId: string): Promise<Credit[]> {
  return []
}

export async function redeemCredit(userId: string, planCode: 'basic' | 'premium'): Promise<{ ok: true; creditId: string; planCode: 'basic' | 'premium' } | { ok: false; error: string }> {
  return { ok: false, error: 'credits_disabled' }
}

export async function attachCreditToListing(userId: string, creditId: string, listingId: string): Promise<boolean> {
  return false
}

// Ensure the user has a one-time welcome Basic credit
// Removed: welcome credit grant (no longer supported)
