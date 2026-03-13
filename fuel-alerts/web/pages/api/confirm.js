import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Normalise fuel type to API codes
const FUEL_NORMALISE = {
  'petrol':          'E10',
  'unleaded':        'E10',
  'e10':             'E10',
  'e5':              'E5',
  'super unleaded':  'E5',
  'diesel':          'B7_STANDARD',
  'b7':              'B7_STANDARD',
  'super diesel':    'SDV',
  'sdv':             'SDV',
  'both':            null, // handled separately
}

function normaliseFuel(ft) {
  return FUEL_NORMALISE[(ft || '').toLowerCase().trim()] || 'E10'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'No token provided' })

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const { data: subscriber, error } = await supabase
    .from('subscribers')
    .select('id, status, lat, lon, fuel_type, radius_miles, postcode, annual_miles, mpg, vehicle_reg, vehicle_make, vehicle_year')
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

  // Normalise fuel type — handle 'both' and legacy values
  const rawFuel = subscriber.fuel_type || 'E10'
  const fuelTypes = rawFuel.toLowerCase() === 'both'
    ? ['E10', 'B7_STANDARD']
    : [normaliseFuel(rawFuel)]

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

  // Enrich with brand_clean, logo and amenities from pfs_stations
  if (stations.length > 0) {
    const nodeIds = stations.map(s => s.node_id)
    const { data: stationDetails } = await supabase
      .from('pfs_stations')
      .select('node_id, trading_name, brand_name, brand_clean, logo_url, amenities')
      .in('node_id', nodeIds)

    if (stationDetails) {
      const detailMap = Object.fromEntries(stationDetails.map(s => [s.node_id, s]))
      stations = stations.map(s => ({
        ...s,
        // Name priority: brand_clean → brand_name → trading_name
        display_name: detailMap[s.node_id]?.brand_clean
          || detailMap[s.node_id]?.brand_name
          || detailMap[s.node_id]?.trading_name
          || s.name
          || 'Station',
        logo_url: detailMap[s.node_id]?.logo_url || null,
        amenities: detailMap[s.node_id]?.amenities || [],
      }))
    }
  }

  return res.status(200).json({
    message: 'Confirmed successfully.',
    postcode: subscriber.postcode,
    fuel_type: normaliseFuel(rawFuel),
    radius_miles: subscriber.radius_miles,
	annual_miles: subscriber.annual_miles,
	mpg: subscriber.mpg,
    stations,
	car_make: subscriber.vehicle_make
      ? subscriber.vehicle_make.charAt(0).toUpperCase() + subscriber.vehicle_make.slice(1).toLowerCase()
      : null,
    vehicle_reg:  subscriber.vehicle_reg  || null,
    vehicle_year: subscriber.vehicle_year || null,
  })
}