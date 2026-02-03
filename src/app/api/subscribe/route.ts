import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodePostcode } from "@/lib/geocode";
import { makeToken, hashToken } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const postcode = String(body.postcode ?? "").trim().toUpperCase();
    const radius_miles = Number(body.radius_miles ?? 10);
    const fuel_type = String(body.fuel_type ?? "E10").trim().toUpperCase();
	const annual_miles = Number(body.annual_miles ?? 0);
	const mpg = body.mpg === "" || body.mpg == null ? null : Number(body.mpg);

	if (!Number.isFinite(annual_miles) || annual_miles < 0 || annual_miles > 100000)
		return NextResponse.json({ error: "Annual miles must be 0–100000" }, { status: 400 });

	if (mpg != null && (!Number.isFinite(mpg) || mpg < 5 || mpg > 150))
		return NextResponse.json({ error: "MPG must be 5–150" }, { status: 400 });

    if (!email.includes("@")) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    if (!postcode) return NextResponse.json({ error: "Postcode required" }, { status: 400 });
    if (!Number.isFinite(radius_miles) || radius_miles < 1 || radius_miles > 50)
      return NextResponse.json({ error: "Radius must be 1–50 miles" }, { status: 400 });

    const { lat, lon } = await geocodePostcode(postcode);

    const confirmToken = makeToken(24);
    const unsubToken = makeToken(24);

    const confirmHash = hashToken(confirmToken);
    const unsubHash = hashToken(unsubToken);

    const { error } = await supabaseAdmin
      .from("subscribers")
      .upsert(
        {
          annual_miles,
		  mpg,
		  email,
          postcode,
          lat,
          lon,
          radius_miles,
          fuel_type,
          status: "pending",
          confirm_token_hash: confirmHash,
          unsubscribe_token_hash: unsubHash,
          confirmed_at: null,
          unsubscribed_at: null,
        },
        { onConflict: "email" }
      );

    if (error) throw error;

    const site = process.env.NEXT_PUBLIC_SITE_URL!;
    const confirmUrl = `${site}/confirm?token=${confirmToken}`;

    await sendEmail({
      to: email,
      subject: "Confirm your Fuel Alerts subscription",
      html: `
        <p>Confirm your subscription by clicking the link below:</p>
        <p><a href="${confirmUrl}">Confirm subscription</a></p>
        <p>If you didn’t request this, you can ignore this email.</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
