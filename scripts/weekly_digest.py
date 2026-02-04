
DEBUG_DUMP_ONLY = True

#Imports

import os
import math
import requests
from datetime import datetime, timezone
 
 #Constants 
 
FUEL_TOKEN_URL = "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token"
PFS_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs"
PRICES_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices"

IMP_GALLON_LITRES = 4.54609

access_token = None  # global for script simplicity

def fetch_pfs_batch(batch: int):
    r = requests.get(
        PFS_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        params={"batch-number": batch},
        timeout=30,
    )

    if r.status_code == 400:
        return None  # signal "no more batches"

    r.raise_for_status()
    data = r.json()

    if isinstance(data, dict):
        return data.get("data", [])
    return data



def fetch_prices_batch(batch: int):
    r = requests.get(
        PRICES_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        params={"batch-number": batch},
        timeout=30,
    )

    if r.status_code == 400:
        return None

    r.raise_for_status()
    data = r.json()

    if isinstance(data, dict):
        return data.get("data", [])
    return data




def fetch_all_pfs(get_batch_fn):
    batch = 1
    all_items = []

    while True:
        items = get_batch_fn(batch)
        if items is None:
            break
        if not items:
            break
        all_items.extend(items)
        batch += 1

    print(f"Loaded {len(all_items)} PFS records across {batch-1} batches")
    return all_items
    
def fetch_all_prices(get_batch_fn):
    batch = 1
    all_items = []

    while True:
        items = get_batch_fn(batch)
        if not items:
            break
           
        if not items:
            break
        all_items.extend(items)
        batch += 1

    print(f"Loaded {len(all_items)} price records across {batch-1} batches")
    return all_items
    



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
    
    import csv

def dump_crewe_table(stations, price_index, centre_lat, centre_lon, radius):
    rows = []

    for st in stations.values():
        dist = haversine_miles(centre_lat, centre_lon, st["lat"], st["lon"])
        if dist > radius:
            continue

        prices = price_index.get(st["node_id"], {})

        rows.append({
            "node_id": st["node_id"],
            "name": st.get("trading_name") or st.get("brand_name"),
            "brand": st.get("brand_name"),
            "postcode": st.get("postcode"),
            "distance_miles": round(dist, 2),
            "E10": prices.get("E10", {}).get("price"),
            "E5": prices.get("E5", {}).get("price"),
            "B7_STANDARD": prices.get("B7_STANDARD", {}).get("price"),
            "B7_PREMIUM": prices.get("B7_PREMIUM", {}).get("price"),
            "HVO": prices.get("HVO", {}).get("price"),
        })

    with open("crewe_debug.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to crewe_debug.csv")

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

def build_email_html(site_url: str, subscriber, results, fuel_type: str, delta_html: str):
    """
    results: list of dicts with station + price + distance_miles + lat/lon etc.
    delta_html: already includes 'Since last week...' AND the 'Estimated impact...' line.
    """

    def esc(s):
        return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    # --- body list ---
    if not results:
        list_html = f"""
          <div style="padding:14px 16px;background:#0b2140;border:1px solid rgba(255,255,255,0.10);border-radius:14px;color:rgba(255,255,255,0.88);">
            We couldn't find any <b>{esc(fuel_type)}</b> prices within {subscriber['radius_miles']} miles of <b>{esc(subscriber['postcode'])}</b>.
          </div>
        """
    else:
        items = []
        for r in results:
            price = format_price(r["price"])  # e.g. "134.9p/L"
            miles = f"{r['distance_miles']:.1f}"
            name = r.get("trading_name") or r.get("brand_name") or "Fuel station"
            brand = r.get("brand_name") or ""
            addr = r.get("address_line_1") or ""
            updated = r.get("price_last_updated") or ""
            lat = r["lat"]
            lon = r["lon"]
            maps = f"https://www.google.com/maps?q={lat},{lon}"

            # Nice little “pill” for distance
            items.append(f"""
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);">
                  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                    <div>
                      <div style="font-size:15px;font-weight:800;color:#ffffff;line-height:1.2;">
                        {esc(name)}
                      </div>
                      <div style="font-size:12px;color:rgba(255,255,255,0.70);margin-top:4px;">
                        {esc(brand)}
                      </div>
                      <div style="font-size:12px;color:rgba(255,255,255,0.70);margin-top:6px;line-height:1.35;">
                        {esc(addr)}
                      </div>
                      <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:8px;">
                        Updated: {esc(updated)}
                      </div>
                    </div>

                    <div style="text-align:right;min-width:120px;">
                      <div style="font-size:16px;font-weight:900;color:#ffffff;">
                        {esc(price)}
                      </div>
                      <div style="display:inline-block;margin-top:6px;padding:6px 10px;border-radius:999px;
                                  background:rgba(0,255,174,0.14);border:1px solid rgba(0,255,174,0.25);
                                  color:rgba(255,255,255,0.85);font-size:12px;font-weight:700;">
                        {miles} mi
                      </div>
                      <div style="margin-top:10px;">
                        <a href="{maps}" style="font-size:12px;color:#7fe7ff;text-decoration:none;font-weight:700;">
                          View on map →
                        </a>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            """)

        list_html = f"""
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                 style="background:#0b2140;border:1px solid rgba(255,255,255,0.10);border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="font-size:13px;font-weight:900;color:#ffffff;">Cheapest nearby</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.70);margin-top:4px;">
                  Top {min(5, len(results))} within {subscriber['radius_miles']} miles
                </div>
              </td>
            </tr>
            {''.join(items)}
          </table>
        """

    unsub = f"{site_url}/unsubscribe"  # adjust if you have a tokenised unsubscribe url

    # --- Email wrapper (table-based for compatibility) ---
    return f"""
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Fuel Alerts</title>
  </head>
  <body style="margin:0;padding:0;background:#07101f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07101f;">
      <tr>
        <td align="center" style="padding:24px 12px;">

          <!-- Container -->
          <table role="presentation" width="600" cellspacing="0" cellpadding="0"
                 style="max-width:600px;width:100%;border-collapse:separate;border-spacing:0;">
            <!-- Header -->
            <tr>
              <td style="border-radius:18px 18px 0 0;
                         background:linear-gradient(135deg, rgba(0,200,255,0.22), rgba(0,255,174,0.16));
                         border:1px solid rgba(255,255,255,0.12);
                         padding:18px 18px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:40px;height:40px;border-radius:14px;
                              background:rgba(255,255,255,0.10);
                              border:1px solid rgba(255,255,255,0.18);
                              display:flex;align-items:center;justify-content:center;
                              color:#e6fbff;font-size:18px;font-weight:900;">
                    ⛽
                  </div>
                  <div>
                    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
                                font-size:18px;font-weight:900;color:#eaf2ff;">
                      Fuel Alerts
                    </div>
                    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
                                font-size:12px;color:rgba(234,242,255,0.78);margin-top:2px;">
                      Weekly local fuel prices • simple £ impact
                    </div>
                  </div>
                </div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="background:#0a1630;border-left:1px solid rgba(255,255,255,0.12);
                         border-right:1px solid rgba(255,255,255,0.12);padding:18px;">
                <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:rgba(255,255,255,0.88);font-size:13px;">
                  Area: <b style="color:#ffffff;">{esc(subscriber['postcode'])}</b>
                  &nbsp;•&nbsp; Radius: <b style="color:#ffffff;">{subscriber['radius_miles']} miles</b>
                  &nbsp;•&nbsp; Fuel: <b style="color:#ffffff;">{esc(fuel_type)}</b>
                </div>

                <!-- Summary card -->
                <div style="margin-top:14px;padding:14px 16px;border-radius:16px;
                            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);">
                  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
                              font-size:12px;color:rgba(255,255,255,0.72);margin-bottom:6px;">
                    This week’s movement
                  </div>
                  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
                              font-size:13px;color:rgba(255,255,255,0.92);line-height:1.45;">
                    {delta_html}
                  </div>
                </div>

                <div style="margin-top:14px;">
                  {list_html}
                </div>

                <div style="margin-top:18px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
                            font-size:12px;color:rgba(255,255,255,0.62);line-height:1.5;">
                  You’re receiving this because you subscribed to Fuel Alerts.
                  <br/>
                  <a href="{unsub}" style="color:#7fe7ff;text-decoration:none;font-weight:700;">Manage subscription →</a>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="border-radius:0 0 18px 18px;background:#061021;
                         border:1px solid rgba(255,255,255,0.12);border-top:none;
                         padding:14px 18px;">
                <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
                            font-size:11px;color:rgba(255,255,255,0.55);line-height:1.4;">
                  Tip: add your MPG for a more accurate £/week estimate. Defaults are labelled clearly when used.
                </div>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
    """
def dump_all_stations(stations, price_index):
    rows = []

    for st in stations.values():
        prices = price_index.get(st["node_id"], {})
        rows.append({
            "node_id": st["node_id"],
            "name": st.get("trading_name") or st.get("brand_name"),
            "brand": st.get("brand_name"),
            "postcode": st.get("postcode"),
            "E10": prices.get("E10", {}).get("price"),
            "E5": prices.get("E5", {}).get("price"),
            "B7_STANDARD": prices.get("B7_STANDARD", {}).get("price"),
            "B7_PREMIUM": prices.get("B7_PREMIUM", {}).get("price"),
            "HVO": prices.get("HVO", {}).get("price"),
        })

    with open("all_stations_debug.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to all_stations_debug.csv")

def main():
    
    global access_token

    client_id = os.getenv("FUEL_CLIENT_ID")
    client_secret = os.getenv("FUEL_CLIENT_SECRET")

    access_token = get_access_token(client_id, client_secret)

    stations_raw = fetch_all_pfs(fetch_pfs_batch)
    prices_raw   = fetch_all_prices(fetch_prices_batch)
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
