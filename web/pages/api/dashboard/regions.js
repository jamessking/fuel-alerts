import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Postcode area to region name mapping
const POSTCODE_REGIONS = {
  'AB': 'Scotland', 'DD': 'Scotland', 'DG': 'Scotland', 'EH': 'Scotland',
  'FK': 'Scotland', 'G': 'Scotland', 'HS': 'Scotland', 'IV': 'Scotland',
  'KA': 'Scotland', 'KW': 'Scotland', 'KY': 'Scotland', 'ML': 'Scotland',
  'PA': 'Scotland', 'PH': 'Scotland', 'TD': 'Scotland', 'ZE': 'Scotland',
  'BT': 'Northern Ireland',
  'CF': 'Wales', 'CH': 'Wales', 'LD': 'Wales', 'LL': 'Wales',
  'NP': 'Wales', 'SA': 'Wales', 'SY': 'Wales',
  'B': 'West Midlands', 'CV': 'West Midlands', 'DY': 'West Midlands',
  'ST': 'West Midlands', 'WS': 'West Midlands', 'WV': 'West Midlands',
  'BD': 'Yorkshire', 'DN': 'Yorkshire', 'HD': 'Yorkshire', 'HG': 'Yorkshire',
  'HU': 'Yorkshire', 'HX': 'Yorkshire', 'LS': 'Yorkshire', 'S': 'Yorkshire',
  'WF': 'Yorkshire', 'YO': 'Yorkshire',
  'BL': 'North West', 'CH': 'North West', 'CW': 'North West', 'FY': 'North West',
  'L': 'North West', 'LA': 'North West', 'M': 'North West', 'OL': 'North West',
  'PR': 'North West', 'SK': 'North West', 'WA': 'North West', 'WN': 'North West',
  'DH': 'North East', 'DL': 'North East', 'NE': 'North East', 'SR': 'North East',
  'TS': 'North East',
  'CA': 'Cumbria',
  'DE': 'East Midlands', 'LE': 'East Midlands', 'LN': 'East Midlands',
  'NG': 'East Midlands', 'NN': 'East Midlands', 'PE': 'East Midlands',
  'CB': 'East of England', 'CM': 'East of England', 'CO': 'East of England',
  'IP': 'East of England', 'NR': 'East of England', 'SS': 'East of England',
  'E': 'London', 'EC': 'London', 'N': 'London', 'NW': 'London',
  'SE': 'London', 'SW': 'London', 'W': 'London', 'WC': 'London',
  'BR': 'London', 'CR': 'London', 'DA': 'London', 'EN': 'London',
  'HA': 'London', 'IG': 'London', 'KT': 'London', 'RM': 'London',
  'SM': 'London', 'TW': 'London', 'UB': 'London', 'WD': 'London',
  'BN': 'South East', 'CT': 'South East', 'GU': 'South East', 'ME': 'South East',
  'MK': 'South East', 'OX': 'South East', 'PO': 'South East', 'RG': 'South East',
  'RH': 'South East', 'SL': 'South East', 'SO': 'South East', 'TN': 'South East',
  'AL': 'East of England', 'HP': 'South East', 'LU': 'East of England',
  'SG': 'East of England',
  'BA': 'South West', 'BH': 'South West', 'BS': 'South West', 'DT': 'South West',
  'EX': 'South West', 'GL': 'South West', 'PL': 'South West', 'SP': 'South West',
  'TA': 'South West', 'TQ': 'South West', 'TR': 'South West',
  'HR': 'West Midlands', 'TF': 'West Midlands', 'WR': 'West Midlands',
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

  const { data: prices } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price')
    .eq('snapshot_date', latestDate)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  const { data: stations } = await supabase
    .from('pfs_stations')
    .select('node_id, postcode')

  if (!prices || !stations) return res.status(500).json({ error: 'No data' })

  const postcodeMap = Object.fromEntries(stations.map(s => [s.node_id, s.postcode]))

  const regionData = {}

  for (const row of prices) {
    const postcode = postcodeMap[row.node_id] || ''
    // Extract postcode area (letters only from start)
    const area = postcode.match(/^[A-Z]+/)?.[0] || 'UNKNOWN'
    const region = POSTCODE_REGIONS[area] || 'Other England'

    if (!regionData[region]) regionData[region] = { petrol: [], diesel: [] }
    if (row.fuel_type === 'E10') regionData[region].petrol.push(parseFloat(row.price))
    if (row.fuel_type === 'B7_STANDARD') regionData[region].diesel.push(parseFloat(row.price))
  }

  const avg = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null

  const result = Object.entries(regionData)
    .map(([region, d]) => ({
      region,
      avg_petrol: avg(d.petrol),
      avg_diesel: avg(d.diesel),
      station_count: Math.round((d.petrol.length + d.diesel.length) / 2),
    }))
    .filter(r => r.avg_petrol || r.avg_diesel)
    .sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))

  return res.status(200).json({ regions: result, date: latestDate })
}
