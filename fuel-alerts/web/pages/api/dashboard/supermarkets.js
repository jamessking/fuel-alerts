import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const SUPERMARKET_PATTERNS = {
  'TESCO': ['tesco'],
  'ASDA': ['asda'],
  'SAINSBURYS': ["sainsbury"],
  'MORRISONS': ['morrisons'],
  'COSTCO': ['costco'],
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { data: latestSnap } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const latestDate = latestSnap?.snapshot_date

  // Get supermarket station node_ids
  const { data: supermarketStations } = await supabase
    .from('pfs_stations')
    .select('node_id, brand_name, logo_url')
    .or(Object.keys(SUPERMARKET_PATTERNS).map(b =>
      `brand_name.ilike.%${SUPERMARKET_PATTERNS[b][0]}%`
    ).join(','))

  if (!supermarketStations) return res.status(500).json({ error: 'No data' })

  const nodeIds = supermarketStations.map(s => s.node_id)
  const stationMap = Object.fromEntries(supermarketStations.map(s => [s.node_id, s]))

  const { data: prices } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price')
    .eq('snapshot_date', latestDate)
    .in('node_id', nodeIds)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  if (!prices) return res.status(500).json({ error: 'No prices' })

  const brandData = {}
  for (const brand of Object.keys(SUPERMARKET_PATTERNS)) {
    brandData[brand] = { petrol: [], diesel: [], logo_url: null, station_count: 0 }
  }

  for (const row of prices) {
    const station = stationMap[row.node_id]
    if (!station) continue
    const name = station.brand_name?.toUpperCase() || ''
    let matchedBrand = null
    for (const [brand, patterns] of Object.entries(SUPERMARKET_PATTERNS)) {
      if (patterns.some(p => name.includes(p.toUpperCase()))) {
        matchedBrand = brand
        break
      }
    }
    if (!matchedBrand) continue
    if (!brandData[matchedBrand].logo_url) brandData[matchedBrand].logo_url = station.logo_url
    if (row.fuel_type === 'E10') brandData[matchedBrand].petrol.push(parseFloat(row.price))
    if (row.fuel_type === 'B7_STANDARD') brandData[matchedBrand].diesel.push(parseFloat(row.price))
  }

  // Count unique stations per brand
  for (const station of supermarketStations) {
    const name = station.brand_name?.toUpperCase() || ''
    for (const [brand, patterns] of Object.entries(SUPERMARKET_PATTERNS)) {
      if (patterns.some(p => name.includes(p.toUpperCase()))) {
        brandData[brand].station_count++
        break
      }
    }
  }

  const result = Object.entries(brandData).map(([brand, d]) => ({
    brand,
    logo_url: d.logo_url,
    station_count: d.station_count,
    avg_petrol: d.petrol.length ? parseFloat((d.petrol.reduce((a, b) => a + b, 0) / d.petrol.length).toFixed(2)) : null,
    avg_diesel: d.diesel.length ? parseFloat((d.diesel.reduce((a, b) => a + b, 0) / d.diesel.length).toFixed(2)) : null,
    min_petrol: d.petrol.length ? Math.min(...d.petrol) : null,
    min_diesel: d.diesel.length ? Math.min(...d.diesel) : null,
  })).sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))

  return res.status(200).json({ supermarkets: result, date: latestDate })
}
