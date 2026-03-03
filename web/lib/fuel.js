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

// Get all towns with station counts — used for getStaticPaths
export async function getAllTowns() {
  const { data, error } = await supabase
    .from('pfs_stations')
    .select('city, country')
    .eq('permanent_closure', false)
    .neq('city', null)
    .neq('city', '')

  if (error || !data) return []

  // Count stations per city
  const counts = {}
  const cityCountry = {}
  for (const row of data) {
    const city = (row.city || '').trim()
    if (!city) continue
    counts[city] = (counts[city] || 0) + 1
    cityCountry[city] = row.country
  }

  return Object.entries(counts)
    .filter(([city]) => city.length > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500)
    .map(([city, count]) => ({
      city,
      slug: toSlug(city),
      count,
      country: cityCountry[city],
    }))
}

// Get all regions (counties)
export async function getAllRegions() {
  const { data, error } = await supabase
    .from('pfs_stations')
    .select('county')
    .neq('county', null)
    .neq('county', '')

  if (error || !data) return []

  const counts = {}
  for (const row of data) {
    const county = (row.county || '').trim()
    if (!county) continue
    counts[county] = (counts[county] || 0) + 1
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([county, count]) => ({
      region: county,
      slug: toSlug(county),
      count,
    }))
}

// Core data fetch for a town page
export async function getTownData(cityName) {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  // Get stations in this city (non-motorway)
  const { data: stations } = await supabase
    .from('pfs_stations')
    .select('node_id, trading_name, brand_name, brand_clean, logo_url, city, county, country, postcode, is_motorway_service_station, is_supermarket_service_station, latitude, longitude')
    .ilike('city', cityName)
    .neq('permanent_closure', true)
    .neq('is_motorway_service_station', true)

  if (!stations || stations.length === 0) return null

  const nodeIds = stations.map(s => s.node_id)

  // Get today's prices for these stations
  const { data: prices } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price, snapshot_date')
    .in('node_id', nodeIds)
    .eq('snapshot_date', today)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  // Get last week prices for delta
  const { data: lastWeekPrices } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price')
    .in('node_id', nodeIds)
    .eq('snapshot_date', weekAgo)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  // Get price history for chart (last 30 days)
  const { data: history } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price, snapshot_date')
    .in('node_id', nodeIds)
    .gte('snapshot_date', thirtyAgo)
    .lte('snapshot_date', today)
    .in('fuel_type', ['E10', 'B7_STANDARD'])
    .order('snapshot_date', { ascending: true })

  if (!prices || prices.length === 0) return null

  // Build station map
  const stationMap = {}
  for (const s of stations) stationMap[s.node_id] = s

  // Enrich prices with station info
  const enriched = prices.map(p => ({
    ...p,
    ...stationMap[p.node_id],
    price: parseFloat(p.price),
    display_name: stationMap[p.node_id]?.brand_clean || stationMap[p.node_id]?.brand_name || stationMap[p.node_id]?.trading_name || 'Station',
  })).filter(p => p.price > 0)

  // Build last week map for delta
  const lastWeekMap = {}
  for (const p of (lastWeekPrices || [])) {
    lastWeekMap[`${p.node_id}_${p.fuel_type}`] = parseFloat(p.price)
  }

  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const toP = (arr, fuel) => arr.filter(p => p.fuel_type === fuel).map(p => p.price)

  const petrol = enriched.filter(p => p.fuel_type === 'E10').sort((a, b) => a.price - b.price)
  const diesel = enriched.filter(p => p.fuel_type === 'B7_STANDARD').sort((a, b) => a.price - b.price)
  const allSorted = [...enriched].sort((a, b) => a.price - b.price)

  const avgPetrol = avg(toP(enriched, 'E10'))
  const avgDiesel = avg(toP(enriched, 'B7_STANDARD'))
  const lastWeekAvgPetrol = avg((lastWeekPrices || []).filter(p => p.fuel_type === 'E10').map(p => parseFloat(p.price)))
  const lastWeekAvgDiesel = avg((lastWeekPrices || []).filter(p => p.fuel_type === 'B7_STANDARD').map(p => parseFloat(p.price)))

  // Supermarket vs independent
  const supermarketPetrol = petrol.filter(p => p.is_supermarket_service_station)
  const independentPetrol = petrol.filter(p => !p.is_supermarket_service_station)

  // Price chart data — daily average per fuel type
  const chartData = {}
  for (const row of (history || [])) {
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
