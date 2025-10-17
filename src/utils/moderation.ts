// Heurística para detectar teléfonos/WhatsApp en texto libre
// Evita falsos positivos simples pero bloquea patrones comunes: +54..., 11 1234-5678, (011) 15-1234-5678, wa.me, whatsapp
export function containsPhoneLike(input: string | null | undefined): boolean {
  if (!input) return false
  const text = String(input).toLowerCase()
  // URLs/directas de WhatsApp
  if (/wa\.me\//.test(text) || /whatsapp\.(com|me)/.test(text)) return true
  // Quitar separadores y contar dígitos
  const digits = (text.match(/[0-9]/g) || []).length
  // Regla fuerte: si hay 9+ dígitos en total (ignorando todo lo demás), lo tratamos como teléfono
  // Esto bloquea casos "encriptados" tipo "376 como 436 estas5000".
  if (digits >= 9 && digits <= 13) return true
  if (digits >= 8) {
    // Si hay al menos 8 dígitos totales en el texto, revisar patrones típicos
    const phoneLike = /(?:\+?\d{1,3}[\s-]*)?(?:\(?\d{2,4}\)?[\s-]*)?\d{3,4}[\s-]*\d{3,4}/
    if (phoneLike.test(text)) return true
  }
  return false
}
