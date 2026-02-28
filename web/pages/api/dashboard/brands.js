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

  const { data: prices, error } = await supabase.rpc('brand_avg_prices', {
    snap_date: latestDate,
  })

  if (error || !prices) {
    // Fallback: raw query
    const { data: raw } = await supabase
      .from('fuel_prices_daily')
      .select('fuel_type, price, node_id')
      .eq('snapshot_date', latestDate)
      .in('fuel_type', ['E10', 'B7_STANDARD'])

    const { data: stations } = await supabase
      .from('pfs_stations')
      .select('node_id, brand_name, logo_url')

    if (!raw || !stations) return res.status(500).json({ error: 'Failed to fetch data' })

    const stationMap = Object.fromEntries(stations.map(s => [s.node_id, s]))

    const BRAND_MAP = (name) => {
      if (!name) return 'OTHER'
      const n = name.toUpperCase()
      if (n.includes('TESCO')) return 'TESCO'
      if (n.includes('ASDA')) return 'ASDA'
      if (n.includes('SAINSBURY')) return 'SAINSBURYS'
      if (n.includes('MORRISONS')) return 'MORRISONS'
      if (n.includes('COSTCO')) return 'COSTCO'
      if (n.includes('SHELL')) return 'SHELL'
      if (n.includes('BP') || n === 'B P') return 'BP'
      if (n.includes('ESSO')) return 'ESSO'
      if (n.includes('TEXACO')) return 'TEXACO'
      if (n.includes('GULF')) return 'GULF'
      if (n.includes('JET')) return 'JET'
      if (n.includes('MURCO')) return 'MURCO'
      if (n.includes('CIRCLE K')) return 'CIRCLE K'
      if (n.includes('MAXOL')) return 'MAXOL'
      if (n.includes('HARVEST')) return 'HARVEST ENERGY'
      if (n.includes('TOTAL')) return 'TOTAL'
      return 'OTHER'
    }

    const brandData = {}
    for (const row of raw) {
      const station = stationMap[row.node_id]
      const brand = BRAND_MAP(station?.brand_name)
      if (brand === 'OTHER') continue
      if (!brandData[brand]) {
        brandData[brand] = {
          brand,
          logo_url: station?.logo_url || null,
          petrol_prices: [],
          diesel_prices: [],
          count: 0,
        }
      }
      if (row.fuel_type === 'E10') brandData[brand].petrol_prices.push(parseFloat(row.price))
      if (row.fuel_type === 'B7_STANDARD') brandData[brand].diesel_prices.push(parseFloat(row.price))
      brandData[brand].count++
    }

    const result = Object.values(brandData)
      .map(b => ({
        brand: b.brand,
        logo_url: b.logo_url,
        avg_petrol: b.petrol_prices.length ? (b.petrol_prices.reduce((a, c) => a + c, 0) / b.petrol_prices.length).toFixed(1) : null,
        avg_diesel: b.diesel_prices.length ? (b.diesel_prices.reduce((a, c) => a + c, 0) / b.diesel_prices.length).toFixed(1) : null,
        station_count: Math.round(b.count / 2),
      }))
      .filter(b => b.avg_petrol || b.avg_diesel)
      .sort((a, b) => parseFloat(a.avg_petrol || a.avg_diesel) - parseFloat(b.avg_petrol || b.avg_diesel))

    return res.status(200).json({ brands: result, date: latestDate })
  }

  return res.status(200).json({ brands: prices, date: latestDate })
}
