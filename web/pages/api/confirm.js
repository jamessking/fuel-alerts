import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
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
    .select('id, status, lat, lon, fuel_type, radius_miles, postcode')
    .eq('confirm_token_hash', tokenHash)
    .single()

  if (error || !subscriber) {
    return res.status(404).json({ error: 'Invalid or expired confirmation link.' })
  }

  if (subscriber.status !== 'active') {
    const { error: updateError } = await supabase
      .from('subscribers')
      .update({
        status: 'active',
        confirmed_at: new Date().toISOString(),
        confirm_token_hash: null,
      })
      .eq('id', subscriber.id)

    if (updateError) {
      return res.status(500).json({ error: 'Failed to confirm subscription.' })
    }
  }

  // Fetch live fuel prices using the top5 function
  // Try each relevant fuel type
  const fuelTypes = subscriber.fuel_type === 'both'
    ? ['E10', 'B7_STANDARD']
    : subscriber.fuel_type === 'petrol'
    ? ['E10']
    : ['B7_STANDARD']

  let stations = []

  for (const ft of fuelTypes) {
    const { data, error: fnError } = await supabase.rpc('top5_cheapest_nearby', {
      lat: subscriber.lat,
      lon: subscriber.lon,
      radius_miles: subscriber.radius_miles,
      fuel: ft,
    })
    if (!fnError && data) {
      stations = stations.concat(data.map(s => ({ ...s, fuel_type: ft })))
    }
  }

  // Sort by price, take top 5
  stations.sort((a, b) => a.price - b.price)
  stations = stations.slice(0, 5)

  // Enrich with logo and amenities from pfs_stations
  if (stations.length > 0) {
    const nodeIds = stations.map(s => s.node_id)
    const { data: stationDetails } = await supabase
      .from('pfs_stations')
      .select('node_id, logo_url, amenities')
      .in('node_id', nodeIds)

    if (stationDetails) {
      const detailMap = Object.fromEntries(stationDetails.map(s => [s.node_id, s]))
      stations = stations.map(s => ({
        ...s,
        logo_url: detailMap[s.node_id]?.logo_url || null,
        amenities: detailMap[s.node_id]?.amenities || [],
      }))
    }
  }

  return res.status(200).json({
    message: 'Confirmed successfully.',
    postcode: subscriber.postcode,
    fuel_type: subscriber.fuel_type,
    radius_miles: subscriber.radius_miles,
    stations,
  })
}
