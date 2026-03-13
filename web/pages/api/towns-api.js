// web/pages/api/towns.js
// Returns list of towns with station counts for autocomplete
// Cached for 6 hours — town list doesn't change often

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

let cache = null
let cacheExpiry = 0

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=21600, stale-while-revalidate=3600')

  const now = Date.now()
  if (cache && now < cacheExpiry) {
    return res.status(200).json(cache)
  }

  const { data, error } = await supabase.rpc('get_towns_with_counts')
  if (error) {
    console.error('towns API error:', error)
    return res.status(500).json([])
  }

  const towns = (data || []).map(r => ({
    city:  r.city,
    count: Number(r.station_count),
    slug:  r.city.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'),
  })).sort((a, b) => b.count - a.count)

  cache = towns
  cacheExpiry = now + 6 * 60 * 60 * 1000

  return res.status(200).json(towns)
}
