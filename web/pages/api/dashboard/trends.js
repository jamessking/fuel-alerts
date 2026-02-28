import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { data: snapDates } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: true })
    .limit(30)

  const dates = [...new Set(snapDates?.map(r => r.snapshot_date) || [])]

  // For each date, get UK average by fuel type
  const trendData = []

  for (const date of dates) {
    const { data: prices } = await supabase
      .from('fuel_prices_daily')
      .select('fuel_type, price')
      .eq('snapshot_date', date)
      .in('fuel_type', ['E10', 'B7_STANDARD'])

    if (!prices) continue

    const petrol = prices.filter(r => r.fuel_type === 'E10').map(r => parseFloat(r.price))
    const diesel = prices.filter(r => r.fuel_type === 'B7_STANDARD').map(r => parseFloat(r.price))

    trendData.push({
      date,
      petrol: petrol.length ? parseFloat((petrol.reduce((a, b) => a + b, 0) / petrol.length).toFixed(2)) : null,
      diesel: diesel.length ? parseFloat((diesel.reduce((a, b) => a + b, 0) / diesel.length).toFixed(2)) : null,
    })
  }

  return res.status(200).json({ trends: trendData })
}
