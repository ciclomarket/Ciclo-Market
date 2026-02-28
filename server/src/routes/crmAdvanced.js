/**
 * CRM Advanced Routes
 * Kanban, Next Best Action, Automation Rules, Impact Dashboard
 */

const { Router } = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const router = Router()

// ============================================================================
// KANBAN BOARD ENDPOINTS
// ============================================================================

// Get all kanban cards
router.get('/api/admin/kanban/cards', async (req, res) => {
  try {
    const { stage, priority, seller_id } = req.query
    const supabase = getServerSupabaseClient()

    let query = supabase
      .from('kanban_cards')
      .select('*, seller:seller_id(seller_name, whatsapp_number)')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })

    if (stage) query = query.eq('stage', stage)
    if (priority) query = query.eq('priority', priority)
    if (seller_id) query = query.eq('seller_id', seller_id)

    const { data, error } = await query
    if (error) throw error

    res.json(data || [])
  } catch (err) {
    console.error('[kanban] fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch kanban cards' })
  }
})

// Create new kanban card
router.post('/api/admin/kanban/cards', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const card = req.body

    const { data, error } = await supabase
      .from('kanban_cards')
      .insert({
        ...card,
        created_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[kanban] create error:', err)
    res.status(500).json({ error: 'Failed to create kanban card' })
  }
})

// Move kanban card to new stage
router.post('/api/admin/kanban/cards/:id/move', async (req, res) => {
  try {
    const { id } = req.params
    const { to_stage, notes } = req.body
    const supabase = getServerSupabaseClient()
    const adminUserId = req.session?.adminUser?.id

    // Get current card
    const { data: card, error: fetchError } = await supabase
      .from('kanban_cards')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Update card stage
    const { data: updated, error: updateError } = await supabase
      .from('kanban_cards')
      .update({
        stage: to_stage,
        notes: notes ? `${card.notes || ''}\n${new Date().toLocaleDateString()}: ${notes}`.trim() : card.notes,
        moved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log the move
    await supabase.from('kanban_moves').insert({
      card_id: id,
      from_stage: card.stage,
      to_stage: to_stage,
      moved_by: adminUserId,
      notes: notes,
    })

    res.json(updated)
  } catch (err) {
    console.error('[kanban] move error:', err)
    res.status(500).json({ error: 'Failed to move kanban card' })
  }
})

// Update kanban card
router.patch('/api/admin/kanban/cards/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .from('kanban_cards')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[kanban] update error:', err)
    res.status(500).json({ error: 'Failed to update kanban card' })
  }
})

// Delete kanban card
router.delete('/api/admin/kanban/cards/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()

    const { error } = await supabase
      .from('kanban_cards')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[kanban] delete error:', err)
    res.status(500).json({ error: 'Failed to delete kanban card' })
  }
})

// Get kanban metrics
router.get('/api/admin/kanban/metrics', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()

    const { data: byStage, error } = await supabase
      .rpc('get_kanban_metrics')

    if (error) throw error

    res.json(byStage || {
      by_stage: {},
      recent_moves: [],
      avg_time_in_stage: {},
    })
  } catch (err) {
    console.error('[kanban] metrics error:', err)
    res.status(500).json({ error: 'Failed to fetch kanban metrics' })
  }
})

// ============================================================================
// NEXT BEST ACTION ENDPOINTS
// ============================================================================

// Get recommended actions
router.get('/api/admin/crm/recommended-actions', async (req, res) => {
  try {
    const { seller_id } = req.query
    const supabase = getServerSupabaseClient()

    let query = supabase
      .from('recommended_actions')
      .select('*, seller:seller_id(seller_name), listing:listing_id(title)')
      .eq('dismissed', false)
      .eq('completed', false)
      .order('priority', { ascending: true })

    if (seller_id) query = query.eq('seller_id', seller_id)

    const { data, error } = await query.limit(20)
    if (error) throw error

    // Transform data
    const actions = (data || []).map(row => ({
      ...row,
      seller_name: row.seller?.seller_name,
      listing_title: row.listing?.title,
    }))

    res.json(actions)
  } catch (err) {
    console.error('[next-best-action] fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch recommended actions' })
  }
})

// Dismiss action
router.post('/api/admin/crm/actions/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()

    const { error } = await supabase
      .from('recommended_actions')
      .update({ dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[next-best-action] dismiss error:', err)
    res.status(500).json({ error: 'Failed to dismiss action' })
  }
})

// Complete action
router.post('/api/admin/crm/actions/:id/complete', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const adminUserId = req.session?.adminUser?.id

    const { error } = await supabase
      .from('recommended_actions')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        completed_by: adminUserId,
      })
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[next-best-action] complete error:', err)
    res.status(500).json({ error: 'Failed to complete action' })
  }
})

// ============================================================================
// AUTOMATION RULES ENDPOINTS
// ============================================================================

// Get all automation rules
router.get('/api/admin/automation/rules', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .from('automation_rules')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('[automation] fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch automation rules' })
  }
})

// Create automation rule
router.post('/api/admin/automation/rules', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const rule = req.body

    const { data, error } = await supabase
      .from('automation_rules')
      .insert({
        ...rule,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[automation] create error:', err)
    res.status(500).json({ error: 'Failed to create automation rule' })
  }
})

// Update automation rule
router.patch('/api/admin/automation/rules/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .from('automation_rules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[automation] update error:', err)
    res.status(500).json({ error: 'Failed to update automation rule' })
  }
})

// Toggle rule enabled state
router.post('/api/admin/automation/rules/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params
    const { enabled } = req.body
    const supabase = getServerSupabaseClient()

    const { error } = await supabase
      .from('automation_rules')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[automation] toggle error:', err)
    res.status(500).json({ error: 'Failed to toggle rule' })
  }
})

// Delete automation rule
router.delete('/api/admin/automation/rules/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()

    const { error } = await supabase
      .from('automation_rules')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[automation] delete error:', err)
    res.status(500).json({ error: 'Failed to delete automation rule' })
  }
})

// Get automation logs
router.get('/api/admin/automation/logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .from('automation_logs')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(parseInt(limit))

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('[automation] logs error:', err)
    res.status(500).json({ error: 'Failed to fetch automation logs' })
  }
})

// ============================================================================
// IMPACT DASHBOARD ENDPOINTS
// ============================================================================

// Get impact metrics
router.get('/api/admin/impact/metrics', async (req, res) => {
  try {
    const { period = '30d' } = req.query
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .rpc('get_impact_metrics', { p_period: period })

    if (error) throw error

    res.json(data || {
      period,
      confirmed_sales: 0,
      total_revenue: 0,
      conversion_rate: 0,
      avg_time_to_sale: 0,
      active_listings: 0,
      total_leads: 0,
      gmv_per_listing: 0,
    })
  } catch (err) {
    console.error('[impact] metrics error:', err)
    res.status(500).json({ error: 'Failed to fetch impact metrics' })
  }
})

// Get sales by category
router.get('/api/admin/impact/sales-by-category', async (req, res) => {
  try {
    const { period = '30d' } = req.query
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .rpc('get_sales_by_category', { p_period: period })

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('[impact] sales by category error:', err)
    res.status(500).json({ error: 'Failed to fetch sales by category' })
  }
})

// Get sales by city
router.get('/api/admin/impact/sales-by-city', async (req, res) => {
  try {
    const { period = '30d' } = req.query
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .rpc('get_sales_by_city', { p_period: period })

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('[impact] sales by city error:', err)
    res.status(500).json({ error: 'Failed to fetch sales by city' })
  }
})

// Get conversion funnel
router.get('/api/admin/impact/conversion-funnel', async (req, res) => {
  try {
    const { period = '30d' } = req.query
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .rpc('get_conversion_funnel', { p_period: period })

    if (error) throw error

    res.json(data || {
      views: 0,
      inquiries: 0,
      whatsapp_clicks: 0,
      confirmed_sales: 0,
      conversion_rate: 0,
      stage_rates: {
        view_to_inquiry: 0,
        inquiry_to_whatsapp: 0,
        whatsapp_to_sale: 0,
      },
    })
  } catch (err) {
    console.error('[impact] funnel error:', err)
    res.status(500).json({ error: 'Failed to fetch conversion funnel' })
  }
})

// ============================================================================
// SELLER INTELLIGENCE ENDPOINTS
// ============================================================================

router.get('/api/admin/sellers/:id/intelligence', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .rpc('get_seller_intelligence', { p_seller_id: id })

    if (error) throw error
    res.json(data)
  } catch (err) {
    console.error('[intelligence] fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch seller intelligence' })
  }
})

module.exports = { crmAdvancedRouter: router }
