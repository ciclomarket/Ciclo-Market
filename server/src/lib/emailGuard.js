/**
 * Guard atómico para el sistema de campañas simplificado.
 *
 * Reemplaza el patrón "leer si existe -> decidir -> escribir" del motor
 * viejo (email/orchestrator.js, eliminado) que dejaba una ventana de
 * carrera entre el chequeo y el envío: dos corridas solapadas podían
 * pasar el chequeo "no enviado todavía" al mismo tiempo y mandar dos
 * veces. Acá el propio INSERT/UPDATE condicional ES el chequeo — no hay
 * lectura separada de la escritura, así que no hay ventana.
 *
 * Uso por candidato, en orden:
 *   1. claimIdempotencyKey()  — ¿ya está reservado este envío?
 *   2. reserveDailyBudget()   — ¿queda cupo compartido hoy?
 *   3. sendMail(...)
 *   4. si algo de 3 falla: releaseSend() para no perder el intento para
 *      siempre (libera la key Y devuelve el cupo).
 */

const DEFAULT_DAILY_BUDGET = Number(process.env.EMAIL_DAILY_BUDGET) || 150

function todayInArgentina() {
  // Ancla el "día" al huso horario del negocio (UTC-3 fijo, Argentina no
  // tiene horario de verano), no a UTC.
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * Intenta reservar la idempotency_key. Devuelve true si el llamador es
 * quien la reservó (primera vez / nunca enviado) — debe proceder a
 * mandar el mail. Devuelve false si ya estaba reservada — no mandar.
 */
async function claimIdempotencyKey(supabase, { idempotencyKey, campaign, emailTo, listingId, userId }) {
  const { data, error } = await supabase
    .from('email_sends')
    .insert({
      idempotency_key: idempotencyKey,
      campaign,
      email_to: emailTo,
      listing_id: listingId || null,
      user_id: userId || null,
    })
    .select('idempotency_key')

  if (error) {
    // Unique violation = alguien ya lo reservó (nosotros mismos en una
    // corrida anterior, o una corrida concurrente que ganó la carrera).
    if (error.code === '23505') return false
    console.error('[emailGuard] claimIdempotencyKey error', error.message || error)
    return false
  }
  return Boolean(data && data.length)
}

/**
 * Reserva atómicamente un cupo del presupuesto diario compartido.
 * Devuelve true si quedaba cupo (ya reservado), false si no.
 */
async function reserveDailyBudget(supabase, { budget = DEFAULT_DAILY_BUDGET } = {}) {
  const day = todayInArgentina()

  // supabase-js no permite `sent_count = sent_count + 1` de forma atómica
  // en un .update() directo (traer la fila, sumarle 1 en JS y volver a
  // escribirla SÍ sería una carrera). La función de Postgres hace el
  // upsert + incremento condicional en una sola sentencia SQL.
  const { data, error } = await supabase.rpc('reserve_email_budget_slot', {
    p_day: day,
    p_budget: budget,
  })

  if (error) {
    console.error('[emailGuard] reserveDailyBudget error', error.message || error)
    return false
  }
  return Boolean(data)
}

/** Libera una key + devuelve un cupo, si el envío terminó fallando. */
async function releaseSend(supabase, idempotencyKey) {
  try {
    await supabase.from('email_sends').delete().eq('idempotency_key', idempotencyKey)
    const day = todayInArgentina()
    await supabase.rpc('release_email_budget_slot', { p_day: day })
  } catch (err) {
    console.error('[emailGuard] releaseSend error', err?.message || err)
  }
}

async function recordProviderMessageId(supabase, idempotencyKey, providerMessageId) {
  if (!providerMessageId) return
  try {
    await supabase
      .from('email_sends')
      .update({ provider_message_id: providerMessageId })
      .eq('idempotency_key', idempotencyKey)
  } catch {
    // no crítico
  }
}

module.exports = {
  DEFAULT_DAILY_BUDGET,
  claimIdempotencyKey,
  reserveDailyBudget,
  releaseSend,
  recordProviderMessageId,
}
