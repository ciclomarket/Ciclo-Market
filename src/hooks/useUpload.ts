
import { useState } from 'react'
import { getSupabaseClient, supabaseEnabled, supabaseStorageBucket } from '../services/supabase'

export default function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const uploadFiles = async (files: File[]) => {
    if (!supabaseEnabled || files.length === 0) return []
    const supabase = getSupabaseClient()
    const storage = supabase.storage.from(supabaseStorageBucket)
    setUploading(true)
    const urls: string[] = []
    try {
      for (const f of files) {
        const safeName = f.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
        const key = `${new Date().getFullYear()}/${Date.now()}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}_${safeName}`
        const { error: uploadError } = await storage.upload(key, f, {
          cacheControl: '3600',
          contentType: f.type,
          upsert: false
        })
        if (uploadError) throw uploadError
        const { data } = storage.getPublicUrl(key)
        if (data?.publicUrl) {
          urls.push(data.publicUrl)
        }
        setProgress((p) => Math.min(100, p + Math.round(100 / files.length)))
      }
      return urls
    } finally { setUploading(false); setProgress(0) }
  }
  return { uploadFiles, uploading, progress }
}
