const { createClient } = require('@supabase/supabase-js')

function getServerSupabaseClient() {
  const url = process.env.SUPABASE_SERVICE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase server credentials no configurados. Definí SUPABASE_SERVICE_URL/SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  })
}

module.exports = {
  getServerSupabaseClient
}
