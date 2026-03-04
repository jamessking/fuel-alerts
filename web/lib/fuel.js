import { supabase } from './supabase'

export function toSlug(str) {
  return (str || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function fromSlug(slug) {
  return (slug || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Returns the most recent snapshot date in the DB — never hardcodes today.
// Falls back gracefully if ingest failed — always returns last good data.
let _snapshotDateCache = null
let _snapshotDateExpiry = 0

export async function getLatestSnapshotDate() {
  const now = Date.now()
  if (_snapshotDateCache && now < _snapshotDateExpiry) return _snapshotDateCache

  const { data } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const date = data?.snapshot_date || new Date().toISOString().split('T')[0]
  _snapshotDateCache = date
  _snapshotDateExpiry = now + 5 * 60 * 1000
  return date
}

// Fast: single SQL aggregate — no full table scan
export async function getAllTowns() {
  const { data, error } = await supabase
    .rpc('get_towns_with_counts')

  if (error || !data) {
    console.error('getAllTowns error:', error)
    return []
  }

  return data.map(r => ({
    city: r.city,
    slug: toSlug(r.city),
    count: r.station_count,
    country: r.country,
  }))
}

export async function getAllRegions() {
  const { data, error } = await supabase
    .rpc('get_regions_with_counts')

  if (error || !data) return []

  return data.map(r => ({
    region: r.county,
    slug: toSlug(r.county),
    count: r.station_count,
  }))
}

// Core data fetch for a town page
export async function getTownData(cityName) {
  const today = await getLatestSnapshotDate()
  const weekAgo = new Date(new Date(today).getTime() - 7 * 86400000).toISOString().split('T')[0]
  const thirtyAgo = new Date(new Date(today).getTime() - 30 * 86400000).toISOString().split('T')[0]

  const { data: stations } = await supabase
    .from('pfs_stations')
    .select('node_id, trading_name, brand_name, brand_clean, logo_url, city, county, country, postcode, is_motorway_service_station, is_supermarket_service_station, latitude, longitude')
    .ilike('city', cityName)
    .neq('permanent_closure', true)
    .neq('is_motorway_service_station', true)

  if (!stations || stations.length === 0) return null

  const nodeIds = stations.map(s => s.node_id)

  const [pricesRes, lastWeekRes, historyRes] = await Promise.all([
    supabase.from('fuel_prices_daily').select('node_id, fuel_type, price')
      .in('node_id', nodeIds).eq('snapshot_date', today).in('fuel_type', ['E10', 'B7_STANDARD']),
    supabase.from('fuel_prices_daily').select('node_id, fuel_type, price')
      .in('node_id', nodeIds).eq('snapshot_date', weekAgo).in('fuel_type', ['E10', 'B7_STANDARD']),
    supabase.from('fuel_prices_daily').select('node_id, fuel_type, price, snapshot_date')
      .in('node_id', nodeIds).gte('snapshot_date', thirtyAgo).lte('snapshot_date', today)
      .in('fuel_type', ['E10', 'B7_STANDARD']).order('snapshot_date', { ascending: true }),
  ])

  const prices = pricesRes.data || []
  const lastWeekPrices = lastWeekRes.data || []
  const history = historyRes.data || []

  if (prices.length === 0) return null

  const stationMap = {}
  for (const s of stations) stationMap[s.node_id] = s

  const enriched = prices.map(p => ({
    ...p,
    ...stationMap[p.node_id],
    price: parseFloat(p.price),
    display_name: stationMap[p.node_id]?.brand_clean || stationMap[p.node_id]?.brand_name || stationMap[p.node_id]?.trading_name || 'Station',
  })).filter(p => p.price > 0)

  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const toP = (arr, fuel) => arr.filter(p => p.fuel_type === fuel).map(p => parseFloat(p.price))

  const petrol = enriched.filter(p => p.fuel_type === 'E10').sort((a, b) => a.price - b.price)
  const diesel = enriched.filter(p => p.fuel_type === 'B7_STANDARD').sort((a, b) => a.price - b.price)
  const allSorted = [...enriched].sort((a, b) => a.price - b.price)

  const avgPetrol = avg(toP(enriched, 'E10'))
  const avgDiesel = avg(toP(enriched, 'B7_STANDARD'))
  const lastWeekAvgPetrol = avg(toP(lastWeekPrices, 'E10'))
  const lastWeekAvgDiesel = avg(toP(lastWeekPrices, 'B7_STANDARD'))

  const supermarketPetrol = petrol.filter(p => p.is_supermarket_service_station)
  const independentPetrol = petrol.filter(p => !p.is_supermarket_service_station)

  const chartData = {}
  for (const row of history) {
    const d = row.snapshot_date
    if (!chartData[d]) chartData[d] = { date: d, petrol: [], diesel: [] }
    if (row.fuel_type === 'E10') chartData[d].petrol.push(parseFloat(row.price))
    if (row.fuel_type === 'B7_STANDARD') chartData[d].diesel.push(parseFloat(row.price))
  }
  const chartSeries = Object.values(chartData)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date: d.date,
      petrol: d.petrol.length ? Math.round(avg(d.petrol) * 10) / 10 : null,
      diesel: d.diesel.length ? Math.round(avg(d.diesel) * 10) / 10 : null,
    }))

  return {
    city: cityName,
    county: stations[0]?.county || null,
    country: stations[0]?.country || null,
    stationCount: stations.length,
    updatedAt: today,
    avgPetrol: avgPetrol ? Math.round(avgPetrol * 10) / 10 : null,
    avgDiesel: avgDiesel ? Math.round(avgDiesel * 10) / 10 : null,
    lastWeekAvgPetrol: lastWeekAvgPetrol ? Math.round(lastWeekAvgPetrol * 10) / 10 : null,
    lastWeekAvgDiesel: lastWeekAvgDiesel ? Math.round(lastWeekAvgDiesel * 10) / 10 : null,
    cheapestPetrol: petrol[0] || null,
    cheapestDiesel: diesel[0] || null,
    mostExpensivePetrol: petrol[petrol.length - 1] || null,
    cheapestSupermarket: supermarketPetrol[0] || null,
    cheapestIndependent: independentPetrol[0] || null,
    top5: allSorted.slice(0, 5),
    chartSeries,
  }
}
