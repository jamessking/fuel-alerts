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

  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'No token provided' })

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const { data: subscriber, error } = await supabase
    .from('subscribers')
    .select('id, status')
    .eq('confirm_token_hash', tokenHash)
    .single()

  if (error || !subscriber) {
    return res.status(404).json({ error: 'Invalid or expired confirmation link.' })
  }

  if (subscriber.status === 'confirmed') {
    return res.status(200).json({ message: 'Already confirmed.' })
  }

  const { error: updateError } = await supabase
    .from('subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirm_token_hash: null,
    })
    .eq('id', subscriber.id)

  if (updateError) {
    return res.status(500).json({ error: 'Failed to confirm subscription.' })
  }

  return res.status(200).json({ message: 'Confirmed successfully.' })
}
