"use client";

import { useMemo, useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [postcode, setPostcode] = useState("");
  const [radius, setRadius] = useState(10);
  const [fuel, setFuel] = useState("E10");
  const [annualMiles, setAnnualMiles] = useState<number>(12000);
  const [mpg, setMpg] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const mpgHint = useMemo(() => {
    if (mpg !== "") return null;
    if (fuel === "B7_STANDARD") return "Default used if blank (e.g. 55 mpg diesel).";
    return "Default used if blank (e.g. 45 mpg petrol).";
  }, [fuel, mpg]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        postcode,
        radius_miles: radius,
        fuel_type: fuel,
        annual_miles: annualMiles,
        mpg,
      }),
    });

    const j = await res.json();
    setLoading(false);

    if (res.ok) {
      setMessage("✅ Check your email to confirm your subscription.");
    } else {
      setMessage(j.error || "Something went wrong.");
    }
  }

  return (
    <main style={styles.page}>
      {/* Background glow */}
      <div style={styles.glowA} />
      <div style={styles.glowB} />

      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logoMark} aria-hidden>
              ⛽
            </div>
            <div>
              <div style={styles.brandName}>Fuel Alerts</div>
              <div style={styles.brandTag}>Weekly local prices • simple £ impact</div>
            </div>
          </div>

          <div style={styles.badges}>
            <span style={styles.badge}>Mobile-friendly</span>
            <span style={styles.badge}>UK Fuel Finder</span>
          </div>
        </header>

        <section style={styles.grid}>
          {/* HERO */}
          <div style={styles.hero}>
            <h1 style={styles.h1}>Know if prices are going up — before you fill up.</h1>
            <p style={styles.lead}>
              Get a weekly email with the <b>top 5 cheapest stations</b> near your postcode,
              plus <b>last week’s price</b> and an estimated <b>£/week impact</b>.
            </p>

            <div style={styles.featureList}>
              <Feature
                title="Top 5 cheapest nearby"
                desc="Sorted by price, then distance — with map links."
                icon="📍"
              />
              <Feature
                title="Price trend vs last week"
                desc="Shows whether your best option moved up or down."
                icon="📈"
              />
              <Feature
                title="Estimated £ impact"
                desc="Based on your annual miles + MPG (optional)."
                icon="💷"
              />
            </div>

            <div style={styles.smallPrint}>
              <span style={styles.dot} /> No spam. Unsubscribe anytime.
            </div>
          </div>

          {/* FORM */}
          <form onSubmit={submit} style={styles.card} autoComplete="on">
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>Start your weekly alerts</div>
              <div style={styles.cardSub}>Takes 20 seconds.</div>
            </div>

            <label style={styles.label}>Email</label>
				<input autoFocus
				  type="email"
				  name="email"
				  autoComplete="email"
				  inputMode="email"
				  enterKeyHint="next"
				  required
				  value={email}
				  onChange={(e) => setEmail(e.target.value)}
				  placeholder="you@example.com"
				  style={styles.input}
				/>

            <label style={styles.label}>Postcode</label>
            <input
				  type="text"
				  name="postal-code"
				  autoComplete="postal-code"
				  inputMode="text"
				  enterKeyHint="next"
				  required
				  value={postcode}
				  onChange={(e) => setPostcode(e.target.value.toUpperCase())}
				  placeholder="SW41 8AR"
				  style={styles.input}
				/>

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Radius (miles)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={styles.input}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label style={styles.label}>Fuel type</label>
                <select value={fuel} onChange={(e) => setFuel(e.target.value)} style={styles.input}>
                  <option value="E10">Petrol (E10)</option>
                  <option value="E5">Petrol (E5)</option>
                  <option value="B7_STANDARD">Diesel</option>
                </select>
              </div>
            </div>

            <label style={styles.label}>Estimated annual mileage</label>
            <input
              type="number"
              min={0}
              value={annualMiles}
              onChange={(e) => setAnnualMiles(Number(e.target.value))}
              style={styles.input}
            />
            <div style={styles.help}>Used for the £/week estimate.</div>

            <label style={styles.label}>Average MPG (optional)</label>
            <input
              type="number"
              min={5}
              step={0.1}
              value={mpg}
              onChange={(e) => setMpg(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 45"
              style={styles.input}
            />
            <div style={styles.help}>
              {mpgHint || "If blank, we’ll use a sensible default and label it clearly."}
            </div>

            <button type="submit" disabled={loading} style={loading ? styles.buttonDisabled : styles.button}>
              {loading ? "Submitting…" : "Get weekly fuel alerts"}
            </button>

            {message && <div style={styles.message}>{message}</div>}

            <div style={styles.footerNote}>
              By subscribing you agree to receive weekly emails. You can unsubscribe with one click.
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={styles.feature}>
      <div style={styles.featureIcon} aria-hidden>
        {icon}
      </div>
      <div>
        <div style={styles.featureTitle}>{title}</div>
        <div style={styles.featureDesc}>{desc}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 16,
    color: "#0b1324",
    background:
      "radial-gradient(1200px 600px at 15% 10%, rgba(0, 200, 255, 0.18), transparent 60%)," +
      "radial-gradient(900px 500px at 85% 20%, rgba(0, 255, 170, 0.14), transparent 55%)," +
      "linear-gradient(180deg, #061021 0%, #0a1630 45%, #07101f 100%)",
    position: "relative",
    overflow: "hidden",
  },
  glowA: {
    position: "absolute",
    inset: "-200px auto auto -200px",
    width: 520,
    height: 520,
    borderRadius: 999,
    background: "rgba(0, 200, 255, 0.18)",
    filter: "blur(60px)",
  },
  glowB: {
    position: "absolute",
    inset: "auto -240px -240px auto",
    width: 560,
    height: 560,
    borderRadius: 999,
    background: "rgba(0, 255, 170, 0.14)",
    filter: "blur(70px)",
  },
  shell: {
    maxWidth: 1060,
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  header: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "22px 8px 10px",
    flexWrap: "wrap",
  },
  brand: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, rgba(0,200,255,0.25), rgba(0,255,170,0.18))",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#e6fbff",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  brandName: {
    fontSize: 18,
    fontWeight: 800,
    color: "#eaf2ff",
    letterSpacing: 0.2,
  },
  brandTag: {
    fontSize: 12,
    color: "rgba(234,242,255,0.72)",
  },
  badges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    color: "rgba(234,242,255,0.85)",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 18,
    padding: 8,
  },
  hero: {
    padding: "10px 6px",
  },
  h1: {
    margin: "10px 0 10px",
    fontSize: 34,
    lineHeight: 1.05,
    fontWeight: 900,
    color: "#eaf2ff",
    letterSpacing: -0.4,
  },
  lead: {
    margin: "0 0 16px",
    fontSize: 15,
    lineHeight: 1.6,
    color: "rgba(234,242,255,0.78)",
    maxWidth: 560,
  },
  featureList: {
    display: "grid",
    gap: 10,
    maxWidth: 560,
  },
  feature: {
    display: "flex",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.08)",
  },
  featureTitle: {
    fontWeight: 800,
    color: "#eaf2ff",
    fontSize: 14,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: "rgba(234,242,255,0.72)",
    lineHeight: 1.35,
  },
  smallPrint: {
    marginTop: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "rgba(234,242,255,0.65)",
    fontSize: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(0,255,170,0.75)",
    boxShadow: "0 0 0 4px rgba(0,255,170,0.12)",
  },
  card: {
    background: "rgba(255,255,255,0.95)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.18)",
    backdropFilter: "blur(6px)",
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 900,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    opacity: 0.7,
  },
  label: {
    fontSize: 12,
    fontWeight: 800,
    display: "block",
    marginTop: 10,
    marginBottom: 6,
    color: "#0b1324",
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(10, 22, 48, 0.16)",
    outline: "none",
    fontSize: 14,
    background: "white",
  },
  row: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  help: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.65,
  },
  button: {
    marginTop: 14,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 15,
    color: "white",
    background: "linear-gradient(135deg, #00c8ff, #00ffae)",
    boxShadow: "0 12px 22px rgba(0, 200, 255, 0.25)",
  },
  buttonDisabled: {
    marginTop: 14,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "not-allowed",
    fontWeight: 900,
    fontSize: 15,
    color: "white",
    background: "linear-gradient(135deg, rgba(0,200,255,0.6), rgba(0,255,170,0.55))",
    opacity: 0.8,
  },
  message: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    background: "rgba(0, 200, 255, 0.10)",
    border: "1px solid rgba(0, 200, 255, 0.18)",
    fontSize: 13,
  },
  footerNote: {
    marginTop: 12,
    fontSize: 11,
    opacity: 0.55,
    lineHeight: 1.4,
  },
};

// Responsive tweak (simple): two columns on wider screens
if (typeof window !== "undefined") {
  // no-op; actual responsiveness is handled by CSS below if you prefer.
}
// If you want true CSS responsiveness, put this in globals.css instead:
// @media (min-width: 900px) { .grid { grid-template-columns: 1.1fr 0.9fr; align-items: start; } }
