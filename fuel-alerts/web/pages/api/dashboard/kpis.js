import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Total stations
  const { count: totalStations } = await supabase
    .from('pfs_stations')
    .select('*', { count: 'exact', head: true })

  // Latest snapshot date
  const { data: latestSnap } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const latestDate = latestSnap?.snapshot_date

  // UK average prices today for E10 and B7
  const { data: avgPrices } = await supabase
    .from('fuel_prices_daily')
    .select('fuel_type, price')
    .eq('snapshot_date', latestDate)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  let avgPetrol = null, avgDiesel = null
  if (avgPrices) {
    const petrolPrices = avgPrices.filter(r => r.fuel_type === 'E10').map(r => parseFloat(r.price))
    const dieselPrices = avgPrices.filter(r => r.fuel_type === 'B7_STANDARD').map(r => parseFloat(r.price))
    avgPetrol = petrolPrices.length ? petrolPrices.reduce((a, b) => a + b, 0) / petrolPrices.length : null
    avgDiesel = dieselPrices.length ? dieselPrices.reduce((a, b) => a + b, 0) / dieselPrices.length : null
  }

  // Previous snapshot for trend
  const { data: snapDates } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(2)

  let prevAvgPetrol = null, prevAvgDiesel = null
  if (snapDates && snapDates.length >= 2) {
    const prevDate = snapDates[1].snapshot_date
    const { data: prevPrices } = await supabase
      .from('fuel_prices_daily')
      .select('fuel_type, price')
      .eq('snapshot_date', prevDate)
      .in('fuel_type', ['E10', 'B7_STANDARD'])

    if (prevPrices) {
      const pp = prevPrices.filter(r => r.fuel_type === 'E10').map(r => parseFloat(r.price))
      const dp = prevPrices.filter(r => r.fuel_type === 'B7_STANDARD').map(r => parseFloat(r.price))
      prevAvgPetrol = pp.length ? pp.reduce((a, b) => a + b, 0) / pp.length : null
      prevAvgDiesel = dp.length ? dp.reduce((a, b) => a + b, 0) / dp.length : null
    }
  }

  // Subscriber count
  const { count: subscribers } = await supabase
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  // Motorway count
  const { count: motorwayCount } = await supabase
    .from('pfs_stations')
    .select('*', { count: 'exact', head: true })
    .eq('is_motorway_service_station', true)

  return res.status(200).json({
    totalStations,
    latestDate,
    avgPetrol,
    avgDiesel,
    prevAvgPetrol,
    prevAvgDiesel,
    subscribers,
    motorwayCount,
  })
}
