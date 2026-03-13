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

  const { node_id } = req.body || req.query

  // POST — add favourite
  if (req.method === 'POST') {
    if (!node_id) return res.status(400).json({ error: 'node_id required' })
    const { error } = await supabase
      .from('subscriber_favourites')
      .upsert({ subscriber_id: subscriber.id, node_id }, { onConflict: 'subscriber_id,node_id' })
    if (error) return res.status(500).json({ error: 'Failed to add favourite' })
    return res.status(200).json({ message: 'Added' })
  }

  // DELETE — remove favourite
  if (req.method === 'DELETE') {
    if (!node_id) return res.status(400).json({ error: 'node_id required' })
    const { error } = await supabase
      .from('subscriber_favourites')
      .delete()
      .eq('subscriber_id', subscriber.id)
      .eq('node_id', node_id)
    if (error) return res.status(500).json({ error: 'Failed to remove favourite' })
    return res.status(200).json({ message: 'Removed' })
  }

  return res.status(405).end()
}
