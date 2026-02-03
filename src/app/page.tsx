"use client";
import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [postcode, setPostcode] = useState("");
  const [radius, setRadius] = useState(10);
  const [fuel, setFuel] = useState("E10");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setMsg(null);
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, postcode, radius_miles: radius, fuel_type: fuel, annual_miles: annualMiles, mpg }),

    });
    const data = await res.json();
    setMsg(res.ok ? "Check your email to confirm ✅" : (data.error ?? "Error"));
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Fuel Alerts</h1>
      <p>Weekly email with the cheapest fuel near you.</p>

      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 12 }} />

      <label>Postcode</label>
      <input value={postcode} onChange={(e) => setPostcode(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 12 }} />

      <label>Radius (miles)</label>
      <input type="number" value={radius} min={1} max={50} onChange={(e) => setRadius(Number(e.target.value))}
        style={{ width: "100%", padding: 10, marginBottom: 12 }} />

      <label>Fuel type</label>
      <select value={fuel} onChange={(e) => setFuel(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 12 }}>
        <option value="E10">Petrol (E10)</option>
        <option value="E5">Petrol (E5)</option>
        <option value="B7_STANDARD">Diesel (B7)</option>
        <option value="B7_PREMIUM">Diesel Premium</option>
      </select>
	 <label>Estimated annual mileage</label>
		<input
		  type="number"
		  value={annualMiles}
		  min={0}
		  onChange={(e) => setAnnualMiles(Number(e.target.value))}
		  style={{ width: "100%", padding: 10, marginBottom: 12 }}
		/>

		<label>Average MPG (optional)</label>
		<input
		  type="number"
		  value={mpg}
		  min={0}
		  step="0.1"
		  onChange={(e) => setMpg(e.target.value === "" ? "" : Number(e.target.value))}
		  style={{ width: "100%", padding: 10, marginBottom: 12 }}
		/>


      <button onClick={submit} style={{ padding: "10px 16px" }}>Sign up</button>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      <p style={{ marginTop: 24, fontSize: 12, opacity: 0.8 }}>
        You’ll receive a confirmation email. Unsubscribe any time.
      </p>
    </main>
  );
}
