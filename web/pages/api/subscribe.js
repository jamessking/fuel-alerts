import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, postcode, lat, lon, fuel_type, radius_miles, annual_miles, mpg, tank_litres } = req.body

  if (!email || !postcode || !lat || !lon || !fuel_type) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Generate tokens
  const confirmToken = crypto.randomBytes(32).toString('hex')
  const unsubscribeToken = crypto.randomBytes(32).toString('hex')

  const confirmTokenHash = crypto.createHash('sha256').update(confirmToken).digest('hex')
  const unsubscribeTokenHash = crypto.createHash('sha256').update(unsubscribeToken).digest('hex')

  // Check if already subscribed
  const { data: existing } = await supabase
    .from('subscribers')
    .select('id, status')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existing) {
    if (existing.status === 'confirmed') {
      return res.status(409).json({ error: 'This email is already subscribed.' })
    }
    // Re-send confirmation for pending subscribers
    // (update their token and send again)
    await supabase
      .from('subscribers')
      .update({ confirm_token_hash: confirmTokenHash, unsubscribe_token_hash: unsubscribeTokenHash })
      .eq('id', existing.id)

    // TODO: send confirmation email via Brevo
    return res.status(200).json({ message: 'Confirmation email resent.' })
  }

  // Insert new subscriber
  const { error } = await supabase
    .from('subscribers')
    .insert({
      email: email.toLowerCase().trim(),
      postcode: postcode.toUpperCase(),
      lat,
      lon,
      fuel_type,
      radius_miles: radius_miles || 5,
      status: 'pending',
      confirm_token_hash: confirmTokenHash,
      unsubscribe_token_hash: unsubscribeTokenHash,
      annual_miles: annual_miles || null,
      mpg: mpg || null,
      tank_litres: tank_litres || null,
    })

  if (error) {
    console.error('Supabase insert error:', error)
    return res.status(500).json({ error: 'Failed to save subscription. Please try again.' })
  }

  // TODO: Send confirmation email via Brevo using confirmToken

  return res.status(200).json({ message: 'Subscribed successfully. Please check your email to confirm.' })
}
