import os
import math
import requests
from datetime import datetime, timezone

FUEL_TOKEN_URL = "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token"
PFS_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs?batch-number=1"
PRICES_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices?batch-number=1"

IMP_GALLON_LITRES = 4.54609

def default_mpg_for_fuel(fuel_type: str) -> float:
    ft = (fuel_type or "").upper()
    if ft.startswith("E"):  # E10, E5
        return 45.0
    # diesel-ish
    return 55.0

def litres_per_week(annual_miles: float, mpg: float) -> float:
    if annual_miles <= 0 or mpg <= 0:
        return 0.0
    miles_week = annual_miles / 52.0
    gallons_week = miles_week / mpg
    return gallons_week * IMP_GALLON_LITRES

def pounds_from_pence_per_litre(ppl_pence: float) -> float:
    return ppl_pence / 100.0

def supabase_get_last_send(supabase_url: str, service_role_key: str, subscriber_id: str, fuel_type: str):
    url = f"{supabase_url}/rest/v1/weekly_sends"
    params = {
        "select": "sent_at,cheapest_price,cheapest_node_id",
        "subscriber_id": f"eq.{subscriber_id}",
        "fuel_type": f"eq.{fuel_type}",
        "order": "sent_at.desc",
        "limit": "1",
    }
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    r = requests.get(url, params=params, headers=headers, timeout=30)
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None

def supabase_insert_weekly_send(supabase_url: str, service_role_key: str, payload: dict):
    url = f"{supabase_url}/rest/v1/weekly_sends"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    r = requests.post(url, headers=headers, json=payload, timeout=30)
    r.raise_for_status()


def price_to_float(price_str: str):
    try:
        return float(price_str)
    except:
        return None

def format_price_ppl(v: float) -> str:
    return f"{v:.1f}p/L"


def format_price(price_str: str) -> str:
    try:
        v = float(price_str)
        # Most feeds come as pence-per-litre with leading zeros
        return f"{v:.1f}p/L"
    except:
        return price_str

def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v

def haversine_miles(lat1, lon1, lat2, lon2) -> float:
    # Earth radius in miles
    R = 3958.7613
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def get_access_token(client_id: str, client_secret: str) -> str:
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "fuelfinder.read",
    }
    r = requests.post(FUEL_TOKEN_URL, data=data, headers={"Accept": "application/json"}, timeout=30)
    r.raise_for_status()
    j = r.json()

    # Fuel Finder wraps the token
    token = None
    if isinstance(j, dict):
        token = j.get("access_token")
        if not token and isinstance(j.get("data"), dict):
            token = j["data"].get("access_token")

    if not token:
        raise RuntimeError(f"No access_token in response: {j}")
    return token

def fetch_json(url: str, token: str):
    r = requests.get(url, headers={"Accept": "application/json", "Authorization": f"Bearer {token}"}, timeout=60)
    r.raise_for_status()
    return r.json()

def supabase_select_active_subscribers(supabase_url: str, service_role_key: str):
    # Using PostgREST directly
    url = f"{supabase_url}/rest/v1/subscribers"
    params = {
    "select": "id,email,postcode,lat,lon,radius_miles,fuel_type,annual_miles,mpg,tank_litres,unsubscribe_token_hash",
    "status": "eq.active",
    }
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    r = requests.get(url, params=params, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()

def brevo_send_email(api_key: str, sender_email: str, to_email: str, subject: str, html: str):
    r = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={
            "sender": {"name": "Fuel Alerts", "email": sender_email},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html,
        },
        timeout=30,
    )
    r.raise_for_status()

def build_email_html(site_url: str, subscriber, results, fuel_type: str, delta_html: str = ""):

    # results: list of dicts with station + price + distance
    if not results:
        body = f"""
        <p>We couldn't find any <b>{fuel_type}</b> prices within {subscriber['radius_miles']} miles of {subscriber['postcode']}.</p>
        """
    else:
        rows = []
        for r in results:
            # price is typically string like "0120.0000" (pence per litre * 1?) depends; we’ll display as-is for now.
            price = format_price(r["price"])
            miles = f"{r['distance_miles']:.1f}"
            name = r.get("trading_name") or r.get("brand_name") or "Fuel station"
            addr = r.get("address_line_1") or ""
            updated = r.get("price_last_updated") or ""
            lat = r["lat"]
            lon = r["lon"]
            maps = f"https://www.google.com/maps?q={lat},{lon}"
            rows.append(
                f"<li><b>{name}</b> — {price} — {miles} miles<br/>{addr}<br/>Updated: {updated}<br/>"
                f"<a href='{maps}'>View on map</a></li>"
            )
        body = "<p>Cheapest nearby:</p><ol>" + "".join(rows) + "</ol>"

    # unsubscribe link uses token hash? For MVP, we’ll include a simple unsubscribe page token later.
    # For now, include your website’s unsubscribe page placeholder.
    unsub = f"{site_url}/"  # replace later when unsubscribe link is in the weekly emails

    return f"""
    <div style="font-family:system-ui;line-height:1.4">
    <h2>Fuel Alerts</h2>
    <p>Area: <b>{subscriber['postcode']}</b> — Radius: <b>{subscriber['radius_miles']} miles</b> — Fuel: <b>{fuel_type}</b></p>
    {delta_html}
    {body}
    <hr/>
    <p style="font-size:12px;opacity:0.8">You’re receiving this because you subscribed to Fuel Alerts.</p>
    <p style="font-size:12px;opacity:0.8"><a href="{unsub}">Manage subscription</a></p>
</div>
"""

def main():
    supabase_url = require_env("SUPABASE_URL").rstrip("/")
    supabase_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    brevo_key = require_env("BREVO_API_KEY")
    email_from = require_env("EMAIL_FROM")
    site_url = require_env("SITE_URL").rstrip("/")

    fuel_client_id = require_env("FUEL_CLIENT_ID")
    fuel_client_secret = require_env("FUEL_CLIENT_SECRET")

    # Pull active subscribers
    subs = supabase_select_active_subscribers(supabase_url, supabase_key)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Active subscribers: {len(subs)}")

    if not subs:
        return

    # Fetch fuel data once per run
    token = get_access_token(fuel_client_id, fuel_client_secret)
    pfs = fetch_json(PFS_URL, token)
    prices = fetch_json(PRICES_URL, token)

    # Index stations by node_id with location info
    stations = {}
    for s in pfs:
        loc = s.get("location") or {}
        try:
            lat = float(loc.get("latitude"))
            lon = float(loc.get("longitude"))
        except Exception:
            continue
        stations[s["node_id"]] = {
            "node_id": s["node_id"],
            "trading_name": s.get("trading_name"),
            "brand_name": s.get("brand_name"),
            "address_line_1": loc.get("address_line_1"),
            "postcode": loc.get("postcode"),
            "lat": lat,
            "lon": lon,
            "temporary_closure": s.get("temporary_closure"),
            "permanent_closure": s.get("permanent_closure"),
        }

    # Index prices by node_id -> fuel_type -> (price, updated)
    price_index = {}
    for p in prices:
        node_id = p.get("node_id")
        fps = p.get("fuel_prices") or []
        if not node_id:
            continue
        for fp in fps:
            ft = fp.get("fuel_type")
            price = fp.get("price")
            updated = fp.get("price_last_updated")
            if not ft or not price:
                continue
            price_index.setdefault(node_id, {})[ft] = {
                "price": price,
                "price_last_updated": updated,
            }

    # For each subscriber, filter & email
    for sub in subs:
        try:
            print("DEBUG miles/mpg/tank:", sub.get("annual_miles"), sub.get("mpg"), sub.get("tank_litres"))

            sub_lat = float(sub["lat"])
            sub_lon = float(sub["lon"])
            radius = int(sub["radius_miles"])
            fuel_type = sub.get("fuel_type") or "E10"
            to_email = sub["email"]

            candidates = []
            for node_id, st in stations.items():
                if st.get("temporary_closure") or st.get("permanent_closure"):
                    continue
                fp = price_index.get(node_id, {}).get(fuel_type)
                if not fp:
                    continue
                dist = haversine_miles(sub_lat, sub_lon, st["lat"], st["lon"])
                if dist <= radius:
                    candidates.append({
                        **st,
                        **fp,
                        "distance_miles": dist,
                    })

            candidates.sort(key=lambda x: (float(x["price"]), x["distance_miles"]))
            top = candidates[:5]

            last = supabase_get_last_send(supabase_url, supabase_key, sub["id"], fuel_type)

            cheapest_now = float(top[0]["price"]) if top else None
            cheapest_node = top[0]["node_id"] if top else None
            cheapest_updated = top[0].get("price_last_updated") if top else None

            diff = None  # <--- add this before delta logic

            delta_html = ""
            if last and cheapest_now is not None and last.get("cheapest_price") is not None:
                last_price = float(last["cheapest_price"])
                diff = cheapest_now - last_price
                arrow = "⬆️" if diff > 0 else ("⬇️" if diff < 0 else "➡️")
                delta_html = f"<p>Since last week: <b>{arrow} {diff:+.1f}p/L</b> (last: {last_price:.1f}p/L)</p>"
            elif cheapest_now is not None:
                delta_html = "<p>Since last week: <b>—</b> (first report)</p>"

            # --- MONEY IMPACT (runs for BOTH branches) ---
            annual_miles = float(sub.get("annual_miles") or 0)

            mpg_val = sub.get("mpg")
            mpg_val = float(mpg_val) if mpg_val is not None else None

            tank_litres = sub.get("tank_litres")
            tank_litres = float(tank_litres) if tank_litres is not None else 50.0  # default

            used_default = False
            if (mpg_val is None or mpg_val <= 0) and annual_miles > 0:
                mpg_val = default_mpg_for_fuel(fuel_type)
                used_default = True

            cost_html = ""
            if annual_miles > 0 and mpg_val and diff is not None:
                l_week = litres_per_week(annual_miles, mpg_val)
                pounds_change_per_week = l_week * pounds_from_pence_per_litre(diff)
                pounds_change_per_fill = tank_litres * pounds_from_pence_per_litre(diff)

                label = "default MPG" if used_default else "your MPG"
                cost_html = (
                    f"<p>Estimated impact: <b>£{pounds_change_per_week:+.2f}/week</b> "
                    f"(~£{pounds_change_per_fill:+.2f} per fill, {tank_litres:.0f}L tank; "
                    f"{annual_miles:.0f} miles/year, {mpg_val:.1f} mpg — {label})</p>"
                )
            elif annual_miles > 0:
                label = "default MPG" if used_default else "your MPG"
                cost_html = (
                    f"<p>Estimated impact: <b>—</b> (first report; will show £/week from next email). "
                    f"{annual_miles:.0f} miles/year, {mpg_val:.1f} mpg — {label}</p>"
                )

            delta_html = delta_html + cost_html
            print("DEBUG delta_html FINAL:", delta_html)


            subject = f"Fuel Alerts: cheapest {fuel_type} within {radius} miles"
            html = build_email_html(site_url, sub, top, fuel_type, delta_html)

            sender_email = email_from
            if "<" in email_from and ">" in email_from:
                sender_email = email_from.split("<", 1)[1].split(">", 1)[0].strip()

            brevo_send_email(brevo_key, sender_email, to_email, subject, html)
            print(f"Sent to {to_email}: {len(top)} results")

            payload = {
                "subscriber_id": sub["id"],
                "fuel_type": fuel_type,
                "cheapest_node_id": cheapest_node,
                "cheapest_price": cheapest_now,
                "cheapest_updated_at": cheapest_updated,
                "radius_miles": radius,
                "postcode": sub["postcode"],
                "station_count": len(candidates),
                "top5": [
                    {
                        "node_id": r["node_id"],
                        "price": price_to_float(r["price"]),
                        "distance_miles": r["distance_miles"],
                        "trading_name": r.get("trading_name"),
                        "brand_name": r.get("brand_name"),
                        "postcode": r.get("postcode"),
                        "price_last_updated": r.get("price_last_updated"),
                    }
                    for r in top
                ],
            }

            supabase_insert_weekly_send(supabase_url, supabase_key, payload)

        except Exception as e:
            print(f"ERROR sending to {sub.get('email')}: {e}")



if __name__ == "__main__":
    main()
