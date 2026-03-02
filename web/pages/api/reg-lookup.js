export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { reg } = req.body
  if (!reg) return res.status(400).json({ error: 'No registration provided' })

  const apiKey = process.env.DVLA_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'DVLA API not configured' })

  try {
    const response = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ registrationNumber: reg.replace(/\s/g, '').toUpperCase() }),
    })

    if (!response.ok) {
      return res.status(404).json({ error: 'Vehicle not found. Check the registration and try again.' })
    }

    const data = await response.json()

    // Map DVLA fuel type to internal codes
    const fuelMap = {
      'PETROL':           'E10',
      'DIESEL':           'B7',
      'ELECTRIC':         null,
      'HYBRID ELECTRIC':  'E10',
      'PETROL/ELECTRIC':  'E10',
      'DIESEL/ELECTRIC':  'B7',
      'GAS/PETROL':       'E10',
    }

    // Calculate MOT days remaining
    let motDaysRemaining = null
    let motExpired = false
    if (data.motExpiryDate) {
      const today = new Date()
      const motExpiry = new Date(data.motExpiryDate)
      motDaysRemaining = Math.ceil((motExpiry - today) / (1000 * 60 * 60 * 24))
      motExpired = motDaysRemaining < 0
    }

    return res.status(200).json({
      // For form auto-fill
      fuelType: fuelMap[data.fuelType?.toUpperCase()] || null,

      // Display fields
      make: data.make || null,
      year: data.yearOfManufacture || null,
      colour: data.colour || null,
      engineCapacity: data.engineCapacity || null,
      co2Emissions: data.co2Emissions || null,
      euroStatus: data.euroStatus || null,
      fuelTypeRaw: data.fuelType || null,

      // MOT
      motStatus: data.motStatus || null,
      motExpiryDate: data.motExpiryDate || null,
      motDaysRemaining,
      motExpired,

      // Tax
      taxStatus: data.taxStatus || null,
      taxDueDate: data.taxDueDate || null,

      // Other
      monthOfFirstRegistration: data.monthOfFirstRegistration || null,
      typeApproval: data.typeApproval || null,
      wheelplan: data.wheelplan || null,
      revenueWeight: data.revenueWeight || null,
      markedForExport: data.markedForExport || false,
    })
  } catch (err) {
    console.error('DVLA lookup error:', err)
    return res.status(500).json({ error: 'Failed to look up vehicle' })
  }
}
