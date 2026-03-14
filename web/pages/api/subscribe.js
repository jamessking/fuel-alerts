import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const BASE_URL = 'https://fuelalert.co.uk'

async function sendConfirmationEmail(email, confirmToken, unsubscribeToken) {
  const confirmUrl = `${BASE_URL}/confirm?token=${confirmToken}`

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
</head>
<body style="background:#0a0f1e; padding:40px 20px; font-family:Arial,sans-serif; color:#f0f4ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto;">
    <tr>
      <td style="padding-bottom:32px;">
        <span style="font-size:24px;">⛽</span>
        <span style="font-weight:800; font-size:20px; color:#f0f4ff; margin-left:8px;">FuelAlerts</span>
      </td>
    </tr>
    <tr>
      <td style="background:#111827; border:1px solid #1e2d4a; border-radius:20px; padding:40px 36px;">
        <p style="font-size:36px; margin-bottom:20px;">✓</p>
        <h1 style="font-weight:800; font-size:26px; color:#f0f4ff; letter-spacing:-0.03em; margin-bottom:12px;">Confirm your FuelAlerts signup</h1>
        <p style="font-size:15px; color:#8899bb; line-height:1.7; margin-bottom:32px; font-weight:300;">
          Confirm your email and we'll start watching fuel prices near you.
          You'll get a weekly digest showing the cheapest stations in your area — no app needed.
        </p>
        <p style="font-size:14px; color:#4ade80; margin-bottom:28px;">
          Drivers typically save £100+ per year just by filling up at the cheapest station nearby.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td style="background:#00e676; border-radius:10px;">
              <a href="${confirmUrl}" style="display:inline-block; padding:14px 32px; font-weight:700; font-size:15px; color:#0a0f1e; text-decoration:none;">
                Confirm my email →
              </a>
            </td>
          </tr>
        </table>
        <div style="border-top:1px solid #1e2d4a; margin-bottom:24px;"></div>
        <p style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#4a5a7a; margin-bottom:16px;">What happens next</p>
        <p style="color:#8899bb; font-size:14px; line-height:1.8;">
          ✓ &nbsp;Confirm this email to activate your alerts<br>
          ✓ &nbsp;We check 7,150+ UK stations daily from official government data<br>
          ✓ &nbsp;Your weekly FuelAlert arrives every Monday morning
        </p>
        <div style="margin-top:28px; padding:16px; background:#0a0f1e; border-radius:8px; border:1px solid #1e2d4a;">
          <p style="font-size:11px; color:#4a5a7a; margin-bottom:6px;">Button not working? Copy this link:</p>
          <p style="font-size:11px; color:#8899bb; word-break:break-all;">${confirmUrl}</p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="text-align:center; padding-top:16px;">
        <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}"
           style="font-size:11px; color:#4a5a7a;">
           Unsubscribe
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding-top:28px; text-align:center;">
        <p style="font-size:12px; color:#4a5a7a; line-height:1.6;">
          You signed up at fuelalert.co.uk. If that wasn't you, ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'FuelAlerts', email: 'update@fuelalert.co.uk' },
      to: [{ email }],
      subject: 'Please confirm your email address — FuelAlerts',
      htmlContent,
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Brevo error: ${JSON.stringify(err)}`)
  }
}

// Generate a short unique referral code — 8 chars, uppercase alphanumeric
function generateReferralCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase().slice(0, 8)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    email, postcode, lat, lon, fuel_type, radius_miles,
    annual_miles, mpg, tank_litres, vehicle,
    // UTM tracking — passed from frontend query params
    utm_source, utm_medium, utm_campaign, utm_content,
    // Referral code from ?ref=XXXXXX
    ref,
  } = req.body

  if (!email || !postcode || !lat || !lon || !fuel_type) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const confirmToken = crypto.randomBytes(32).toString('hex')
  const unsubscribeToken = crypto.randomBytes(32).toString('hex')
  const confirmTokenHash = crypto.createHash('sha256').update(confirmToken).digest('hex')
  const unsubscribeTokenHash = crypto.createHash('sha256').update(unsubscribeToken).digest('hex')

  // Check if already subscribed
  const { data: existing } = await supabase
    .from('subscribers')
    .select('id, status')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existing) {
    if (existing.status === 'active') {
      return res.status(409).json({ error: 'This email is already subscribed.' })
    }
    // Resend confirmation for pending subscribers
    await supabase
      .from('subscribers')
      .update({
        confirm_token_hash: confirmTokenHash,
        unsubscribe_token_hash: unsubscribeTokenHash,
        unsubscribe_token: unsubscribeToken,
      })
      .eq('id', existing.id)

    try {
      await sendConfirmationEmail(email.toLowerCase().trim(), confirmToken, unsubscribeToken)
    } catch (err) {
      console.error('Brevo resend error:', err)
    }
    return res.status(200).json({ message: 'Confirmation email resent.' })
  }

  // Resolve referred_by — look up the referrer's subscriber id from their referral code
  let referred_by = null
  if (ref) {
    const { data: referrer } = await supabase
      .from('subscribers')
      .select('id')
      .eq('referral_code', ref.toUpperCase())
      .single()
    if (referrer) referred_by = referrer.id
  }

  // Generate a unique referral code for this new subscriber
  // Retry up to 5 times on the unlikely event of a collision
  let referral_code = null
  for (let i = 0; i < 5; i++) {
    const candidate = generateReferralCode()
    const { data: clash } = await supabase
      .from('subscribers')
      .select('id')
      .eq('referral_code', candidate)
      .single()
    if (!clash) { referral_code = candidate; break }
  }

  // Insert new subscriber
  const { data: newSub, error } = await supabase
    .from('subscribers')
    .insert({
      email: email.toLowerCase().trim(),
      postcode: postcode.toUpperCase(),
      lat,
      lon,
      fuel_type,
      radius_miles: radius_miles || 5,
      status: 'pending',
      confirm_token_hash: confirmTokenHash,
      unsubscribe_token_hash: unsubscribeTokenHash,
      unsubscribe_token: unsubscribeToken,
      annual_miles: annual_miles || null,
      mpg: mpg || null,
      tank_litres: tank_litres || null,
      // Vehicle summary
      vehicle_reg:  vehicle?.reg  || null,
      vehicle_make: vehicle?.make || null,
      vehicle_year: vehicle?.year || null,
      // Source tracking
      utm_source:   utm_source  || null,
      utm_medium:   utm_medium  || null,
      utm_campaign: utm_campaign || null,
      utm_content:  utm_content  || null,
      // Referral
      referral_code,
      referred_by,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Subscriber insert error:', error)
    return res.status(500).json({ error: 'Failed to save subscription. Please try again.' })
  }

  // Write full DVLA vehicle record to subscriber_vehicles
  if (newSub?.id && vehicle?.reg) {
    await supabase
      .from('subscriber_vehicles')
      .insert({
        subscriber_id:             newSub.id,
        vehicle_reg:               vehicle.reg,
        make:                      vehicle.make               || null,
        year:                      vehicle.year               || null,
        month_of_first_regis:      vehicle.monthOfFirstRegistration || null,
        fuel_type:                 vehicle.fuelType           || null,
        colour:                    vehicle.colour             || null,
        engine_capacity:           vehicle.engineCapacity     || null,
        co2_emissions:             vehicle.co2Emissions       || null,
        euro_status:               vehicle.euroStatus         || null,
        tax_status:                vehicle.taxStatus          || null,
        tax_due_date:              vehicle.taxDueDate         || null,
        mot_status:                vehicle.motStatus          || null,
        mot_expiry_date:           vehicle.motExpiryDate      || null,
        type_approval:             vehicle.typeApproval       || null,
        wheelplan:                 vehicle.wheelplan          || null,
        revenue_weight:            vehicle.revenueWeight      || null,
        marked_for_export:         vehicle.markedForExport    || false,
      })
      .then(({ error: vErr }) => {
        if (vErr) console.error('subscriber_vehicles insert error:', vErr)
      })
  }

  try {
    await sendConfirmationEmail(email.toLowerCase().trim(), confirmToken, unsubscribeToken)
  } catch (err) {
    console.error('Brevo send error:', err)
  }

  return res.status(200).json({
    message: 'Subscribed successfully. Please check your email to confirm.',
    referral_code,
  })
}
