import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function getSubscriberFromToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data } = await supabase
    .from('subscribers')
    .select('id')
    .eq('magic_token_hash', tokenHash)
    .gt('magic_token_expiry', new Date().toISOString())
    .single()
  return data
}

export default async function handler(req, res) {
  const token = req.query.token || req.body?.token
  if (!token) return res.status(401).json({ error: 'No token' })

  const subscriber = await getSubscriberFromToken(token)
  if (!subscriber) return res.status(401).json({ error: 'Invalid or expired token' })

  // POST — add/update vehicle
  if (req.method === 'POST') {
    const { vehicle } = req.body
    if (!vehicle?.reg) return res.status(400).json({ error: 'vehicle.reg required' })

    const { error } = await supabase
      .from('subscriber_vehicles')
      .upsert({
        subscriber_id:         subscriber.id,
        vehicle_reg:           vehicle.reg,
        make:                  vehicle.make               || null,
        year:                  vehicle.year               || null,
        month_of_first_regis:  vehicle.monthOfFirstRegistration || null,
        fuel_type:             vehicle.fuelType           || null,
        colour:                vehicle.colour             || null,
        engine_capacity:       vehicle.engineCapacity     || null,
        co2_emissions:         vehicle.co2Emissions       || null,
        euro_status:           vehicle.euroStatus         || null,
        tax_status:            vehicle.taxStatus          || null,
        tax_due_date:          vehicle.taxDueDate         || null,
        mot_status:            vehicle.motStatus          || null,
        mot_expiry_date:       vehicle.motExpiryDate      || null,
        type_approval:         vehicle.typeApproval       || null,
        wheelplan:             vehicle.wheelplan          || null,
        revenue_weight:        vehicle.revenueWeight      || null,
        marked_for_export:     vehicle.markedForExport    || false,
      }, { onConflict: 'subscriber_id,vehicle_reg' })

    if (error) return res.status(500).json({ error: 'Failed to save vehicle' })
    return res.status(200).json({ message: 'Vehicle saved' })
  }

  // DELETE — remove vehicle
  if (req.method === 'DELETE') {
    const { vehicle_reg } = req.body
    if (!vehicle_reg) return res.status(400).json({ error: 'vehicle_reg required' })

    const { error } = await supabase
      .from('subscriber_vehicles')
      .delete()
      .eq('subscriber_id', subscriber.id)
      .eq('vehicle_reg', vehicle_reg)

    if (error) return res.status(500).json({ error: 'Failed to remove vehicle' })
    return res.status(200).json({ message: 'Removed' })
  }

  return res.status(405).end()
}
