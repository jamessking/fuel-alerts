import { getTownData } from '../../lib/fuel'

export default async function handler(req, res) {
  const { city } = req.query
  try {
    const data = await getTownData(city || 'ELLON')
    res.status(200).json({ data, error: null })
  } catch (err) {
    res.status(500).json({ data: null, error: err.message })
  }
}