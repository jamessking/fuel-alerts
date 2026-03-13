import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const BASE_URL = 'https://fuelalert.co.uk'

async function sendMagicLink(email, token) {
  const url = `${BASE_URL}/account?token=${token}`
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#0a0f1e; padding:40px 20px; font-family:Arial,sans-serif; color:#f0f4ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto;">
    <tr><td style="padding-bottom:32px;">
      <span style="font-size:24px;">⛽</span>
      <span style="font-weight:800; font-size:20px; color:#f0f4ff; margin-left:8px;">FuelAlerts</span>
    </td></tr>
    <tr><td style="background:#111827; border:1px solid #1e2d4a; border-radius:20px; padding:40px 36px;">
      <h1 style="font-weight:800; font-size:26px; color:#f0f4ff; margin-bottom:12px;">Sign in to FuelAlerts</h1>
      <p style="font-size:15px; color:#8899bb; line-height:1.7; margin-bottom:32px;">
        Click the button below to sign in. This link expires in 15 minutes and can only be used once.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr><td style="background:#00e676; border-radius:10px;">
          <a href="${url}" style="display:inline-block; padding:14px 32px; font-weight:700; font-size:15px; color:#0a0f1e; text-decoration:none;">
            Sign in to my account →
          </a>
        </td></tr>
      </table>
      <div style="margin-top:28px; padding:16px; background:#0a0f1e; border-radius:8px; border:1px solid #1e2d4a;">
        <p style="font-size:11px; color:#4a5a7a; margin-bottom:6px;">Button not working? Copy this link:</p>
        <p style="font-size:11px; color:#8899bb; word-break:break-all;">${url}</p>
      </div>
      <p style="font-size:12px; color:#4a5a7a; margin-top:24px;">If you didn't request this, ignore it — your account is safe.</p>
    </td></tr>
  </table>
</body>
</html>`

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'FuelAlerts', email: 'update@fuelalert.co.uk' },
      to: [{ email }],
      subject: 'Sign in to FuelAlerts',
      htmlContent: html,
    }),
  })
  if (!res.ok) throw new Error(`Brevo error: ${await res.text()}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  const { data: subscriber } = await supabase
    .from('subscribers')
    .select('id, status')
    .eq('email', email.toLowerCase().trim())
    .eq('status', 'active')
    .single()

  // Always return success — don't reveal if email exists
  if (!subscriber) {
    return res.status(200).json({ message: 'If that email is registered, a sign-in link is on its way.' })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('subscribers')
    .update({ magic_token_hash: tokenHash, magic_token_expiry: expiry })
    .eq('id', subscriber.id)

  try {
    await sendMagicLink(email.toLowerCase().trim(), token)
  } catch (err) {
    console.error('Magic link email error:', err)
  }

  return res.status(200).json({ message: 'If that email is registered, a sign-in link is on its way.' })
}
