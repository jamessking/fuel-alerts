import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { data: latestSnap } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const latestDate = latestSnap?.snapshot_date

  // Get motorway station node_ids
  const { data: motorwayStations } = await supabase
    .from('pfs_stations')
    .select('node_id')
    .eq('is_motorway_service_station', true)

  const motorwayIds = new Set((motorwayStations || []).map(s => s.node_id))

  const { data: prices } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price')
    .eq('snapshot_date', latestDate)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  if (!prices) return res.status(500).json({ error: 'No data' })

  const motorway = { petrol: [], diesel: [] }
  const regular = { petrol: [], diesel: [] }

  for (const row of prices) {
    const bucket = motorwayIds.has(row.node_id) ? motorway : regular
    if (row.fuel_type === 'E10') bucket.petrol.push(parseFloat(row.price))
    if (row.fuel_type === 'B7_STANDARD') bucket.diesel.push(parseFloat(row.price))
  }

  const avg = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null

  const motorwayAvgPetrol = avg(motorway.petrol)
  const regularAvgPetrol = avg(regular.petrol)
  const motorwayAvgDiesel = avg(motorway.diesel)
  const regularAvgDiesel = avg(regular.diesel)

  // Most expensive motorway stations
  const { data: topMotorway } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price')
    .eq('snapshot_date', latestDate)
    .in('node_id', [...motorwayIds].slice(0, 500))
    .in('fuel_type', ['E10', 'B7_STANDARD'])
    .order('price', { ascending: false })
    .limit(100)

  // Get names for top motorway stations
  const topIds = [...new Set((topMotorway || []).map(r => r.node_id))].slice(0, 10)
  const { data: topStationDetails } = await supabase
    .from('pfs_stations')
    .select('node_id, trading_name, brand_name, logo_url')
    .in('node_id', topIds)

  const detailMap = Object.fromEntries((topStationDetails || []).map(s => [s.node_id, s]))
  const topStations = (topMotorway || [])
    .filter(r => r.fuel_type === 'E10')
    .slice(0, 8)
    .map(r => ({
      ...r,
      ...detailMap[r.node_id],
      price: parseFloat(r.price),
    }))

  return res.status(200).json({
    date: latestDate,
    motorway: {
      avg_petrol: motorwayAvgPetrol,
      avg_diesel: motorwayAvgDiesel,
      count: motorwayIds.size,
    },
    regular: {
      avg_petrol: regularAvgPetrol,
      avg_diesel: regularAvgDiesel,
      count: prices.length / 2,
    },
    petrol_premium: motorwayAvgPetrol && regularAvgPetrol
      ? parseFloat((motorwayAvgPetrol - regularAvgPetrol).toFixed(2)) : null,
    diesel_premium: motorwayAvgDiesel && regularAvgDiesel
      ? parseFloat((motorwayAvgDiesel - regularAvgDiesel).toFixed(2)) : null,
    top_motorway_stations: topStations,
  })
}
