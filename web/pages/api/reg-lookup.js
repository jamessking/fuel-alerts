export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { reg } = req.body
  if (!reg) return res.status(400).json({ error: 'No registration provided' })

  const apiKey = process.env.DVLA_API_KEY

  if (!apiKey) {
    return res.status(500).json({ error: 'DVLA API not configured' })
  }

  try {
    const response = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ registrationNumber: reg }),
    })

    if (!response.ok) {
      return res.status(404).json({ error: 'Vehicle not found. Check the registration and try again.' })
    }

    const data = await response.json()

    // Map DVLA fuel type to API fuel codes
    const fuelMap = {
      'PETROL':            'E10',
      'DIESEL':            'B7',
      'ELECTRIC':          null,
      'HYBRID ELECTRIC':   'E10',
      'PETROL/ELECTRIC':   'E10',
      'DIESEL/ELECTRIC':   'B7',
      'GAS/PETROL':        'E10',
    }

    const fuelType = fuelMap[data.fuelType?.toUpperCase()] || null

    return res.status(200).json({
      make: data.make,
      model: null, // DVLA doesn't return model
      year: data.yearOfManufacture,
      fuelType,
      colour: data.colour,
      engineSize: data.engineCapacity,
      mpg: null, // DVLA doesn't return MPG - would need a third-party API
    })
  } catch (err) {
    console.error('DVLA lookup error:', err)
    return res.status(500).json({ error: 'Failed to look up vehicle' })
  }
}
