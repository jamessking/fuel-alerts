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

// Uses pfs_locations via RPC — clean town/country data, no row limit issues
export async function getAllTowns() {
  const { data, error } = await supabase.rpc('get_towns_with_counts')
  if (error || !data) { console.error('getAllTowns error:', error); return [] }
  return data.map(r => ({
    city:    r.city,
    slug:    toSlug(r.city),
    count:   Number(r.station_count),
    country: r.country,
  }))
}

// Uses pfs_locations via RPC — clean county data
export async function getAllRegions() {
  const { data, error } = await supabase.rpc('get_regions_with_counts')
  if (error || !data) return []
  return data.map(r => ({
    region: r.county,
    slug:   toSlug(r.county),
    count:  Number(r.station_count),
  }))
}

// Uses get_town_stations RPC — server-side join, no row limits, clean location data
export async function getTownData(townName) {
  const today   = await getLatestSnapshotDate()
  const weekAgo = new Date(new Date(today).getTime() - 7 * 86400000).toISOString().split('T')[0]
  const thirtyAgo = new Date(new Date(today).getTime() - 30 * 86400000).toISOString().split('T')[0]

  // Primary station + price data via RPC
  const { data: stations, error } = await supabase.rpc('get_town_stations', {
    p_town:  townName,
    p_today: today,
  })

  if (error) console.error('get_town_stations error:', error)
  if (!stations || stations.length === 0) return null

  const nodeIds = stations.map(s => s.node_id)

  // Week-ago prices and 30-day history still fetched directly (small targeted queries)
  const [lastWeekRes, historyRes] = await Promise.all([
    supabase.from('fuel_prices_daily').select('node_id, fuel_type, price')
      .in('node_id', nodeIds).eq('snapshot_date', weekAgo)
      .in('fuel_type', ['E10', 'B7_STANDARD']).gt('price', 50),
    supabase.from('fuel_prices_daily').select('node_id, fuel_type, price, snapshot_date')
      .in('node_id', nodeIds).gte('snapshot_date', thirtyAgo).lte('snapshot_date', today)
      .in('fuel_type', ['E10', 'B7_STANDARD']).gt('price', 50)
      .order('snapshot_date', { ascending: true }),
  ])

  const lastWeekPrices = lastWeekRes.data || []
  const history        = historyRes.data  || []

  // Build enriched rows from RPC result
  const enriched = stations.flatMap(s => {
    const rows = []
    if (s.petrol_price != null) rows.push({
      ...s,
      fuel_type:    'E10',
      price:        parseFloat(s.petrol_price),
      display_name: s.brand_clean || s.trading_name || 'Station',
    })
    if (s.diesel_price != null) rows.push({
      ...s,
      fuel_type:    'B7_STANDARD',
      price:        parseFloat(s.diesel_price),
      display_name: s.brand_clean || s.trading_name || 'Station',
    })
    return rows
  })

  if (enriched.length === 0) return null

  const avg   = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const toP   = (arr, fuel) => arr.filter(p => p.fuel_type === fuel).map(p => p.price)

  const petrol  = enriched.filter(p => p.fuel_type === 'E10').sort((a, b) => a.price - b.price)
  const diesel  = enriched.filter(p => p.fuel_type === 'B7_STANDARD').sort((a, b) => a.price - b.price)
  const allSorted = [...enriched].sort((a, b) => a.price - b.price)

  const avgPetrol         = avg(toP(enriched, 'E10'))
  const avgDiesel         = avg(toP(enriched, 'B7_STANDARD'))
  const lastWeekAvgPetrol = avg(toP(lastWeekPrices, 'E10'))
  const lastWeekAvgDiesel = avg(toP(lastWeekPrices, 'B7_STANDARD'))

  const supermarketPetrol = petrol.filter(p => p.is_supermarket)
  const independentPetrol = petrol.filter(p => !p.is_supermarket && !p.is_motorway)

  // Get location context from first station (all same town)
  const { data: locData } = await supabase
    .from('pfs_locations')
    .select('county, country')
    .eq('node_id', stations[0].node_id)
    .single()

  // 30-day chart series
  const chartData = {}
  for (const row of history) {
    const d = row.snapshot_date
    if (!chartData[d]) chartData[d] = { date: d, petrol: [], diesel: [] }
    if (row.fuel_type === 'E10')         chartData[d].petrol.push(parseFloat(row.price))
    if (row.fuel_type === 'B7_STANDARD') chartData[d].diesel.push(parseFloat(row.price))
  }
  const chartSeries = Object.values(chartData)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date:   d.date,
      petrol: d.petrol.length ? Math.round(avg(d.petrol) * 10) / 10 : null,
      diesel: d.diesel.length ? Math.round(avg(d.diesel) * 10) / 10 : null,
    }))

  return {
    city:              townName,
    county:            locData?.county  || null,
    country:           locData?.country || null,
    stationCount:      stations.length,
    updatedAt:         today,
    avgPetrol:         avgPetrol  ? Math.round(avgPetrol  * 10) / 10 : null,
    avgDiesel:         avgDiesel  ? Math.round(avgDiesel  * 10) / 10 : null,
    lastWeekAvgPetrol: lastWeekAvgPetrol ? Math.round(lastWeekAvgPetrol * 10) / 10 : null,
    lastWeekAvgDiesel: lastWeekAvgDiesel ? Math.round(lastWeekAvgDiesel * 10) / 10 : null,
    cheapestPetrol:    petrol[0]  || null,
    cheapestDiesel:    diesel[0]  || null,
    mostExpensivePetrol: petrol[petrol.length - 1] || null,
    cheapestSupermarket: supermarketPetrol[0] || null,
    cheapestIndependent: independentPetrol[0] || null,
    top5:              allSorted.slice(0, 5),
    chartSeries,
    // All stations with coords for the map — deduplicated by node_id (cheapest price per station)
    mapStations: Object.values(
      enriched.reduce((acc, s) => {
        if (!s.latitude && !s.longitude) return acc
        const existing = acc[s.node_id]
        if (!existing || s.price < existing.price) {
          acc[s.node_id] = {
            node_id:      s.node_id,
            display_name: s.display_name,
            brand_clean:  s.brand_clean,
            postcode:     s.postcode,
            lat:          parseFloat(s.latitude),
            lon:          parseFloat(s.longitude),
            price:        s.price,
            fuel_type:    s.fuel_type,
            price_last_updated:       s.price_last_updated || null,
            price_change_effective_timestamp: s.price_change_effective_timestamp || null,
          }
        }
        return acc
      }, {})
    ),
  }
}
