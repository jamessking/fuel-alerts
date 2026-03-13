import { supabase } from '../lib/supabase'

export async function getServerSideProps({ res }) {
  const baseUrl = "https://www.fuelalert.co.uk"

  const urls = []

  // Homepage + key pages
  urls.push(`${baseUrl}`)
  urls.push(`${baseUrl}/supermarket`)

  // Brand pages
  const { data: brands } = await supabase.rpc('get_all_brand_averages', {
    p_fuel_type: 'E10',
    p_min_stations: 1
  })

  if (brands) {
    brands.forEach(b => {
      const slug = b.brand_clean
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      urls.push(`${baseUrl}/brand/${slug}`)
    })
  }

  // Town pages
  const { data: towns } = await supabase.rpc('get_all_towns')

  if (towns) {
    towns.forEach(t => {
      const slug = t.city
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      urls.push(`${baseUrl}/town/${slug}`)
    })
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls
    .map(url => {
      return `
        <url>
          <loc>${url}</loc>
        </url>
      `
    })
    .join("")}
  </urlset>`

  res.setHeader("Content-Type", "text/xml")
  res.write(sitemap)
  res.end()

  return { props: {} }
}

export default function Sitemap() {
  return null
}