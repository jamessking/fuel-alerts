from dotenv import load_dotenv
load_dotenv()

import os
import math
import requests
from datetime import datetime, timezone, date, timedelta
from typing import List, Optional

# -----------------------------
# CONSTANTS
# -----------------------------
IMP_GALLON_LITRES = 4.54609

# -----------------------------
# HELPERS
# -----------------------------

def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v

def haversine_miles(lat1, lon1, lat2, lon2) -> float:
    R = 3958.7613
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def default_mpg_for_fuel(fuel_type: str) -> float:
    return 45.0 if (fuel_type or "").upper().startswith("E") else 55.0

def litres_per_week(annual_miles: float, mpg: float) -> float:
    if annual_miles <= 0 or mpg <= 0:
        return 0.0
    return (annual_miles / 52.0 / mpg) * IMP_GALLON_LITRES

def pounds_from_ppl(ppl: float) -> float:
    return ppl / 100.0

def price_to_float(p) -> Optional[float]:
    try:
        return float(p)
    except:
        return None

def esc(s) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def format_ppl(v: float) -> str:
    return f"{v:.1f}p/L"

def station_display_name(st: dict) -> str:
    """Use brand_clean first (already normalised), fall back to trading name"""
    clean = (st.get("brand_clean") or "").strip()
    if clean:
        return clean
    # Fallback to raw brand_name with basic cleanup
    brand = (st.get("brand_name") or "").strip()
    trading = (st.get("trading_name") or "").strip()
    if brand and brand.upper() not in ("", "OTHER", "INDEPENDENT", "NULL", "N/A"):
        return brand if len(brand) <= 3 else brand.title()
    return trading.title() if trading else "Independent"

def logo_pill(logo_url: str, alt: str, width: int = 64, height: int = 36) -> str:
    """Wrap logo in white pill for dark backgrounds"""
    if not logo_url:
        return ""
    safe_alt = (alt or "").replace('"', '&quot;')
    return (
        f'<div style="display:inline-block;background:#ffffff;border-radius:8px;'
        f'padding:5px 10px;margin-bottom:8px;">'
        f'<img src="{logo_url}" width="{width}" height="{height}" '
        f'style="display:block;object-fit:contain;vertical-align:middle;" alt="{safe_alt}" />'
        f'</div>'
    )

# -----------------------------
# SUPABASE QUERIES
# -----------------------------

def sb_headers(key: str) -> dict:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }

def supabase_get_active_subscribers(url: str, key: str) -> list:
    r = requests.get(
        f"{url}/rest/v1/subscribers",
        params={
            "select": "id,email,postcode,lat,lon,fuel_type,radius_miles,status,unsubscribe_token_hash,annual_miles,mpg,tank_litres",
            "status": "eq.active",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def supabase_get_stations(url: str, key: str) -> list:
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        r = requests.get(
            f"{url}/rest/v1/pfs_stations",
            params={
                "select": "node_id,trading_name,brand_name,brand_clean,postcode,latitude,longitude",
                # Don't filter on closure - handle it in Python instead
            },
            headers={
                **sb_headers(key),
                "Range": f"{offset}-{offset+limit-1}",
                "Range-Unit": "items",
            },
            timeout=30,
        )
        data = r.json()
        if not data:
            break
        all_rows.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return all_rows


def supabase_get_latest_prices(url: str, key: str) -> list:
    today = date.today().isoformat()
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        r = requests.get(
            f"{url}/rest/v1/fuel_prices_daily",
            params={
                "select": "node_id,fuel_type,price,price_last_updated",
                "snapshot_date": f"eq.{today}",
            },
            headers={
                **sb_headers(key),
                "Range": f"{offset}-{offset+limit-1}",
                "Range-Unit": "items",
            },
            timeout=30,
        )
        data = r.json()
        if not data:
            break
        all_rows.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return all_rows

def supabase_get_all_weekly_sends(url: str, key: str, subscriber_ids: list) -> dict:
    """Bulk fetch last 12 weekly sends for ALL subscribers in one query.
    Returns dict: subscriber_id -> list of sends (newest first)
    """
    if not subscriber_ids:
        return {}

    # Supabase in() filter
    ids_str = ",".join(f'"{sid}"' for sid in subscriber_ids)
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        r = requests.get(
            f"{url}/rest/v1/weekly_sends",
            params={
                "select": "subscriber_id,fuel_type,sent_at,cheapest_price,cheapest_node_id",
                "subscriber_id": f"in.({ids_str})",
                "order": "sent_at.desc",
            },
            headers={
                **sb_headers(key),
                "Range": f"{offset}-{offset+limit-1}",
                "Range-Unit": "items",
            },
            timeout=60,
        )
        data = r.json()
        if not data:
            break
        all_rows.extend(data)
        if len(data) < limit:
            break
        offset += limit

    # Group by subscriber_id, keep newest 12
    result = {}
    for row in all_rows:
        sid = row["subscriber_id"]
        result.setdefault(sid, []).append(row)
    for sid in result:
        result[sid] = result[sid][:12]  # already sorted desc by query
    return result


def supabase_get_bulk_7day_prices(url: str, key: str, node_ids: list) -> dict:
    """Bulk fetch 7-day price history for a set of station node_ids.
    Returns dict: node_id -> fuel_type -> list of {snapshot_date, price} asc
    """
    if not node_ids:
        return {}

    since = (date.today() - timedelta(days=7)).isoformat()
    ids_str = ",".join(f'"{nid}"' for nid in node_ids)
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        r = requests.get(
            f"{url}/rest/v1/fuel_prices_daily",
            params={
                "select": "node_id,fuel_type,snapshot_date,price",
                "node_id": f"in.({ids_str})",
                "snapshot_date": f"gte.{since}",
                "order": "snapshot_date.asc",
            },
            headers={
                **sb_headers(key),
                "Range": f"{offset}-{offset+limit-1}",
                "Range-Unit": "items",
            },
            timeout=60,
        )
        data = r.json()
        if not data:
            break
        all_rows.extend(data)
        if len(data) < limit:
            break
        offset += limit

    # Index: node_id -> fuel_type -> [rows]
    result = {}
    for row in all_rows:
        nid = row["node_id"]
        ft  = row["fuel_type"]
        result.setdefault(nid, {}).setdefault(ft, []).append({
            "snapshot_date": row["snapshot_date"],
            "price": row["price"],
        })
    return result


def get_last_send_from_cache(sends_cache: dict, subscriber_id: str, fuel_type: str) -> Optional[dict]:
    """Look up last send from pre-fetched cache"""
    rows = sends_cache.get(subscriber_id, [])
    for row in rows:
        if row.get("fuel_type") == fuel_type:
            return row
    return None


def get_weeks_cheapest_from_cache(sends_cache: dict, subscriber_id: str, node_id: str, fuel_type: str) -> int:
    """Count consecutive weeks cheapest from pre-fetched cache"""
    rows = [r for r in sends_cache.get(subscriber_id, []) if r.get("fuel_type") == fuel_type]
    count = 0
    for row in rows:
        if row.get("cheapest_node_id") == node_id:
            count += 1
        else:
            break
    return count

def supabase_insert_weekly_send(url: str, key: str, payload: dict):
    r = requests.post(
        f"{url}/rest/v1/weekly_sends",
        headers={**sb_headers(key), "Content-Type": "application/json", "Prefer": "return=minimal"},
        json=payload,
        timeout=30,
    )
    r.raise_for_status()

def brevo_send_email(api_key: str, sender_email: str, to_email: str, subject: str, html: str):
    r = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": api_key, "Content-Type": "application/json"},
        json={
            "sender": {"name": "Fuel Alerts", "email": sender_email},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html,
        },
        timeout=30,
    )
    r.raise_for_status()

# -----------------------------
# EMAIL BUILDER
# -----------------------------

# Fuel type display names
FUEL_DISPLAY = {
    "E10":  "Unleaded (E10)",
    "E5":   "Super Unleaded",
    "B7":   "Diesel",
    "SDV":  "Super Diesel",
}

def fuel_label(ft: str) -> str:
    return FUEL_DISPLAY.get((ft or "").upper(), ft or "Fuel")

# Normalise whatever the subscriber signed up with -> API fuel type code
FUEL_NORMALISE = {
    # Petrol variants
    "PETROL":          "E10",
    "UNLEADED":        "E10",
    "E10":             "E10",
    "E5":              "E5",
    "SUPER UNLEADED":  "E5",
    "SUPER":           "E5",
    # Diesel variants
    "DIESEL":          "B7",
    "B7":              "B7",
    "SUPER DIESEL":    "SDV",
    "SDV":             "SDV",
    "PREMIUM DIESEL":  "SDV",
}

def normalise_fuel(ft: str) -> str:
    """Convert subscriber fuel_type to API fuel code (E10, B7, E5, SDV)"""
    return FUEL_NORMALISE.get((ft or "").strip().upper(), "E10")

# Brand logo URLs — hosted on Supabase storage or a CDN
# Keys are uppercase brand_name values from the DB
BRAND_LOGOS = {
    "BP":             "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/BP.png",
    "SHELL":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/SHELL.png",
    "ESSO":           "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/ESSO.png",
    "TEXACO":         "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/TEXACO.png",
    "TESCO":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/TESCO.png",
    "ASDA":           "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/ASDA.png",
    "SAINSBURYS":     "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/SAINSBURYS.png",
    "MORRISONS":      "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/MORRISONS.png",
    "GULF":           "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/GULF.png",
    "JET":            "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/JET.png",
    "CIRCLE K":       "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/Circle-K.png",
    "CIRCLEK":        "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/Circle-K.png",
    "COSTCO":         "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/Costco-1.png",
    "HARVEST ENERGY": "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/HARVEST_ENERGY.png",
    "MURCO":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/MURCO.png",
    "TOTAL":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/TOTAL.png",
    "MAXOL":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/Maxol.png",
    "ESSAR":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/ESSAR.png",
    "CO-OP":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/co-op.png",
    "COOP":           "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/co-op.png",
    "VALERO":         "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/valero.png",
    "APPLEGREEN":     "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/applegreen.png",
    "EG GROUP":       "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/EG_Group_UK_Logo.png",
    "EG":             "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/EG_Group_UK_Logo.png",
}

def brand_logo_url(st: dict) -> str:
    """Return logo URL — uses brand_clean first, then brand_name"""
    # brand_clean is already normalised e.g. "Tesco", "Shell", "Motor Fuel Group"
    clean = (st.get("brand_clean") or "").strip().upper()
    raw   = (st.get("brand_name")  or "").strip().upper()

    for brand in (clean, raw):
        if not brand:
            continue
        if brand in BRAND_LOGOS:
            return BRAND_LOGOS[brand]
        for key in BRAND_LOGOS:
            if key in brand or brand in key:
                return BRAND_LOGOS[key]
    return ""

# Colour palette — matches the website
C_NAVY       = "#0a0f1e"
C_NAVY_MID   = "#111827"
C_NAVY_LIGHT = "#1a2640"
C_BORDER     = "#1e2d4a"
C_GREEN      = "#00e676"
C_GREEN_DIM  = "#00c853"
C_CORAL      = "#ff6b4a"
C_AMBER      = "#ffb300"
C_TEXT       = "#f0f4ff"
C_MUTED      = "#8899bb"
C_FAINT      = "#4a5a7a"


def get_prev_price(history_cache: dict, node_id: str, fuel_type: str, current_price: float):
    """Return (prev_price, changed_date) from history, or (None, None) if unavailable"""
    if not history_cache:
        return None, None
    rows = history_cache.get(node_id, {}).get(fuel_type, [])
    # rows are asc by date — find last price different from today's
    for row in reversed(rows[:-1]):  # skip today (last entry)
        p = float(row["price"])
        if abs(p - current_price) >= 0.05:  # meaningful change
            return p, row["snapshot_date"]
    return None, None


def build_chart_html(price_history: list, fuel_type: str) -> str:
    """Build a pure HTML/CSS bar chart from price history data"""

    if not price_history:
        return f"""
        <div style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};border-radius:12px;
                    padding:18px;margin-bottom:20px;text-align:center;
                    color:{C_FAINT};font-size:12px;">
          Price history will appear after 7+ days of data collection
        </div>
        """

    prices = [float(d["price"]) for d in price_history]
    min_p = min(prices)
    max_p = max(prices)
    price_range = max(max_p - min_p, 1.0)
    max_bar_height = 52
    min_bar_height = 10

    days_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    bars = ""
    for d in price_history:
        p = float(d["price"])
        date_str = d["snapshot_date"]
        try:
            day_name = days_map[datetime.strptime(date_str, "%Y-%m-%d").weekday()]
        except:
            day_name = date_str[-5:]

        is_today   = date_str == date.today().isoformat()
        is_cheapest = p == min_p
        normalized  = 1.0 - ((p - min_p) / price_range)
        height      = int(min_bar_height + normalized * (max_bar_height - min_bar_height))

        if is_today:
            bar_bg    = f"background:{C_CORAL};"
            lbl_color = f"color:{C_CORAL};font-weight:700;"
            prc_color = f"color:{C_CORAL};font-weight:800;"
        elif is_cheapest:
            bar_bg    = f"background:{C_GREEN};"
            lbl_color = f"color:{C_GREEN};font-weight:700;"
            prc_color = f"color:{C_GREEN};font-weight:700;"
        else:
            bar_bg    = f"background:{C_BORDER};"
            lbl_color = f"color:{C_FAINT};"
            prc_color = f"color:{C_MUTED};"

        bars += f"""
        <td style="text-align:center;vertical-align:bottom;padding:0 3px;width:{int(100/len(price_history))}%;">
          <div style="{bar_bg}border-radius:4px 4px 0 0;height:{height}px;width:100%;"></div>
          <div style="font-size:10px;{lbl_color}margin-top:5px;">{esc(day_name)}</div>
          <div style="font-size:10px;{prc_color}">{p:.0f}p</div>
        </td>
        """

    return f"""
    <div style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};border-radius:12px;
                padding:18px 18px 14px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;color:{C_FAINT};letter-spacing:0.8px;
                  text-transform:uppercase;margin-bottom:14px;">
        {len(price_history)}-Day Price History &nbsp;·&nbsp; {esc(fuel_label(fuel_type))}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr style="vertical-align:bottom;">
          {bars}
        </tr>
      </table>
      <div style="font-size:10px;color:{C_FAINT};margin-top:8px;text-align:right;">
        Taller bar = lower price &nbsp;·&nbsp;
        <span style="color:{C_GREEN};">&#9632;</span> cheapest &nbsp;
        <span style="color:{C_CORAL};">&#9632;</span> today
      </div>
    </div>
    """

def build_email_html(
    site_url: str,
    subscriber: dict,
    top_stations: list,
    fuel_type: str,
    cheapest_price: float,
    last_price: Optional[float],
    area_avg: Optional[float],
    weeks_cheapest: int,
    price_history: list,
    annual_miles: float,
    mpg_val: Optional[float],
    tank_litres: float,
    used_default_mpg: bool,
    nearest_station: Optional[dict] = None,
    history_cache: Optional[dict] = None,
) -> str:

    unsub_token = subscriber.get("unsubscribe_token_hash", "")
    unsub  = f"{site_url}/unsubscribe?token={esc(unsub_token)}"
    postcode = esc(subscriber.get("postcode", ""))
    radius   = subscriber.get("radius_miles", 5)
    today_str = datetime.now().strftime("%-d %B %Y")

    # Price delta vs last week
    diff = (cheapest_price - last_price) if last_price is not None else None

    if diff is not None:
        if diff < 0:
            delta_color  = C_GREEN
            delta_bg     = "rgba(0,230,118,0.1)"
            delta_border = "rgba(0,230,118,0.25)"
            delta_icon   = "&#9660;"   # ▼
            delta_text   = f"{abs(diff):.1f}p cheaper"
        elif diff > 0:
            delta_color  = C_CORAL
            delta_bg     = "rgba(255,107,74,0.1)"
            delta_border = "rgba(255,107,74,0.25)"
            delta_icon   = "&#9650;"   # ▲
            delta_text   = f"{diff:.1f}p more expensive"
        else:
            delta_color  = C_MUTED
            delta_bg     = f"rgba(136,153,187,0.1)"
            delta_border = f"rgba(136,153,187,0.2)"
            delta_icon   = "&#8594;"
            delta_text   = "No change"

        delta_html = f"""
        <div style="display:inline-block;background:{delta_bg};border:1px solid {delta_border};
                    border-radius:999px;padding:5px 14px;margin-top:10px;">
          <span style="font-size:14px;font-weight:800;color:{delta_color};">
            {delta_icon} {delta_text} vs last week
          </span>
        </div>
        """
    else:
        delta_html = f"""
        <div style="display:inline-block;background:rgba(136,153,187,0.1);border:1px solid rgba(136,153,187,0.2);
                    border-radius:999px;padding:5px 14px;margin-top:10px;">
          <span style="font-size:13px;font-weight:700;color:{C_MUTED};">Your first report &#127881;</span>
        </div>
        """

    # Savings strip — only show when there's a meaningful price change
    if diff is not None and abs(diff) >= 0.1 and annual_miles > 0 and mpg_val:
        l_week  = litres_per_week(annual_miles, mpg_val)
        pw      = abs(l_week * pounds_from_ppl(diff))
        pf      = abs(tank_litres * pounds_from_ppl(diff))
        label   = "est. MPG" if used_default_mpg else "your MPG"
        if diff < 0:
            strip_bg = f"background:{C_GREEN_DIM};"
            strip_icon = "&#128176;"  # 💰
            strip_msg = f"Prices dropped {abs(diff):.1f}p this week — you could save <strong>£{pw:.2f}/week</strong> &nbsp;&#183;&nbsp; £{pf:.2f} per tank"
        else:
            strip_bg = f"background:{C_CORAL};"
            strip_icon = "&#9888;"  # ⚠
            strip_msg = f"Prices rose {diff:.1f}p this week — that's <strong>£{pw:.2f}/week</strong> more &nbsp;&#183;&nbsp; £{pf:.2f} extra per tank"

        savings_strip = f"""
            <tr>
              <td style="{strip_bg}padding:13px 32px;text-align:center;">
                <div style="font-size:13px;font-weight:700;color:{C_NAVY};">
                  {strip_icon} {strip_msg}
                </div>
                <div style="font-size:11px;color:rgba(10,15,30,0.6);margin-top:3px;">
                  {annual_miles:.0f} mi/yr &nbsp;&#183;&nbsp; {mpg_val:.0f} mpg ({label}) &nbsp;&#183;&nbsp; {tank_litres:.0f}L tank
                </div>
              </td>
            </tr>
        """
    else:
        savings_strip = ""

    # Nearest station block (separate from cheapest top 5)
    if nearest_station:
        n_name  = esc(station_display_name(nearest_station))
        n_price = float(nearest_station["price"])
        n_dist  = nearest_station["distance_miles"]
        n_pc    = esc(nearest_station.get("postcode") or "")
        n_lat   = nearest_station.get("lat", 0)
        n_lon   = nearest_station.get("lon", 0)
        n_maps  = f"https://www.google.com/maps?q={n_lat},{n_lon}"
        n_logo  = nearest_station.get("logo_url", "")

        # How much more expensive vs cheapest?
        n_diff  = n_price - cheapest_price
        if n_diff <= 0:
            n_diff_html = f'<span style="font-size:12px;color:{C_GREEN};font-weight:700;">&#9733; This is the cheapest station!</span>'
        else:
            n_tank_cost = n_diff * tank_litres / 100
            n_diff_html = f'<span style="font-size:12px;color:{C_CORAL};">+{n_diff:.1f}p/L vs cheapest &nbsp;&#183;&nbsp; costs £{n_tank_cost:.2f} more to fill up</span>'

        n_logo = n_logo or brand_logo_url(nearest_station)
        logo_html = logo_pill(n_logo, n_name)

        nearest_html = f"""
        <div style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};border-radius:14px;
                    padding:18px 20px;margin-bottom:20px;">
          <div style="font-size:10px;font-weight:700;color:{C_FAINT};letter-spacing:0.08em;
                      text-transform:uppercase;margin-bottom:12px;">
            Your Nearest Station
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="vertical-align:middle;">
                {logo_html}
                <div style="font-size:15px;font-weight:700;color:{C_TEXT};margin-top:8px;">{n_name}</div>
                <div style="font-size:12px;color:{C_MUTED};margin-top:3px;">{n_pc} &nbsp;&#183;&nbsp; {n_dist:.1f} miles</div>
                <div style="margin-top:8px;">{n_diff_html}</div>
                <div style="margin-top:10px;">
                  <a href="{n_maps}" style="font-size:12px;font-weight:700;color:{C_GREEN};text-decoration:none;">
                    &#128205; Get Directions &#8594;
                  </a>
                </div>
              </td>
              <td align="right" style="vertical-align:middle;padding-left:12px;">
                <div style="font-family:Arial,sans-serif;font-size:32px;font-weight:900;
                            color:{C_TEXT};letter-spacing:-1px;line-height:1;">
                  {n_price:.1f}p
                </div>
                <div style="font-size:11px;color:{C_FAINT};text-align:right;margin-top:3px;">per litre</div>
              </td>
            </tr>
          </table>
        </div>
        """
    else:
        nearest_html = ""

    # Station rows — top 5 cheapest
    station_rows = ""
    for i, st in enumerate(top_stations):
        name  = esc(station_display_name(st))
        price = float(st["price"])
        dist  = st["distance_miles"]
        pc    = esc(st.get("postcode") or "")
        lat   = st.get("lat") or st.get("latitude", 0)
        lon   = st.get("lon") or st.get("longitude", 0)
        maps_url = f"https://www.google.com/maps?q={lat},{lon}"
        logo_url = st.get("logo_url", "")
        logo_url = logo_url or brand_logo_url(st)
        logo_html = logo_pill(logo_url, name)

        # Previous price + when it changed
        prev_price, changed_date = get_prev_price(history_cache, st["node_id"], fuel_type, price)
        if prev_price is not None:
            pdiff = price - prev_price
            if pdiff < 0:
                prev_html = (f'<span style="color:{C_GREEN};font-size:11px;font-weight:700;">'
                             f'&#9660; {abs(pdiff):.1f}p</span>')
            elif pdiff > 0:
                prev_html = (f'<span style="color:{C_CORAL};font-size:11px;font-weight:700;">'
                             f'&#9650; {pdiff:.1f}p</span>')
            else:
                prev_html = f'<span style="color:{C_FAINT};font-size:11px;">No change</span>'
            # Format date nicely
            try:
                cd = datetime.strptime(changed_date, "%Y-%m-%d")
                days_ago = (date.today() - cd.date()).days
                if days_ago == 0:
                    when = "today"
                elif days_ago == 1:
                    when = "yesterday"
                else:
                    when = f"{days_ago}d ago"
            except:
                when = changed_date or ""
            price_change_html = (f'<div style="margin-top:4px;">{prev_html}'
                                 f' <span style="color:{C_FAINT};font-size:11px;">'
                                 f'from {prev_price:.1f}p &nbsp;&#183;&nbsp; changed {when}</span></div>')
        else:
            price_change_html = ""

        if i == 0:
            # Cheapest — highlighted green border
            station_rows += f"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                   style="margin-bottom:10px;border-radius:14px;overflow:hidden;
                          border:2px solid {C_GREEN};background:{C_NAVY_LIGHT};">
              <tr>
                <td style="padding:16px 18px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        {logo_html}
                        <div style="font-size:10px;font-weight:800;color:{C_GREEN};
                                    letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">
                          &#9733; Cheapest nearby
                        </div>
                        <div style="font-size:15px;font-weight:700;color:{C_TEXT};">{name}</div>
                        <div style="font-size:12px;color:{C_MUTED};margin-top:3px;">{pc} &nbsp;&#183;&nbsp; {dist:.1f} miles</div>
                        {price_change_html}
                        <div style="margin-top:10px;">
                          <a href="{maps_url}" style="font-size:12px;font-weight:700;color:{C_GREEN};text-decoration:none;">
                            &#128205; Get Directions &#8594;
                          </a>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;padding-left:12px;">
                        <div style="font-family:Arial,sans-serif;font-size:36px;font-weight:900;
                                    color:{C_GREEN};letter-spacing:-1px;line-height:1;">
                          {price:.1f}p
                        </div>
                        <div style="font-size:11px;color:{C_FAINT};text-align:right;margin-top:3px;">per litre</div>
                        {f'<div style="font-size:11px;color:{C_AMBER};text-align:right;margin-top:5px;">&#127942; {weeks_cheapest} wk{"s" if weeks_cheapest != 1 else ""} cheapest</div>' if weeks_cheapest >= 2 else ""}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            """
        else:
            station_rows += f"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                   style="margin-bottom:8px;border-radius:12px;border:1px solid {C_BORDER};background:{C_NAVY_LIGHT};">
              <tr>
                <td style="padding:14px 18px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:12px;font-weight:700;color:{C_FAINT};margin-bottom:4px;">
                          #{i+1}
                        </div>
                        <div style="font-size:14px;font-weight:700;color:{C_TEXT};">{name}</div>
                        <div style="font-size:12px;color:{C_MUTED};margin-top:2px;">{pc} &nbsp;&#183;&nbsp; {dist:.1f} miles</div>
                        {price_change_html}
                        <div style="margin-top:8px;">
                          <a href="{maps_url}" style="font-size:12px;font-weight:700;color:{C_MUTED};text-decoration:none;">
                            &#128205; Directions &#8594;
                          </a>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;padding-left:12px;">
                        <div style="font-family:Arial,sans-serif;font-size:24px;font-weight:800;
                                    color:{C_TEXT};letter-spacing:-0.5px;line-height:1;">
                          {price:.1f}p
                        </div>
                        <div style="font-size:11px;color:{C_FAINT};text-align:right;margin-top:2px;">per litre</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            """

    # Area average stat
    area_avg_html = f"""
    <td style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};border-radius:12px;
               padding:14px 16px;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:{C_FAINT};letter-spacing:0.08em;text-transform:uppercase;">
        Area Average
      </div>
      <div style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:{C_TEXT};
                  margin-top:6px;letter-spacing:-0.5px;">
        {f"{area_avg:.1f}p" if area_avg else "&#8212;"}
      </div>
      <div style="font-size:11px;color:{C_MUTED};margin-top:3px;">within {radius} miles</div>
    </td>
    """ if area_avg else ""

    vs_last_html = f"""
    <td style="background:{C_NAVY_LIGHT};border:1px solid {"rgba(0,230,118,0.3)" if diff and diff < 0 else "rgba(255,107,74,0.3)" if diff and diff > 0 else C_BORDER};
               border-radius:12px;padding:14px 16px;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:{C_FAINT};letter-spacing:0.08em;text-transform:uppercase;">
        vs Last Week
      </div>
      <div style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;
                  color:{"#00e676" if diff and diff < 0 else "#ff6b4a" if diff and diff > 0 else C_MUTED};
                  margin-top:6px;letter-spacing:-0.5px;">
        {f"&#9660; {abs(diff):.1f}p" if diff and diff < 0 else f"&#9650; {diff:.1f}p" if diff and diff > 0 else "&#8212;"}
      </div>
      <div style="font-size:11px;color:{C_MUTED};margin-top:3px;">
        {f"was {last_price:.1f}p" if last_price else "first report"}
      </div>
    </td>
    """ if diff is not None or last_price is not None else ""

    spacer = '<td style="width:12px;"></td>'

    share_msg  = f"⛽ {fuel_label(fuel_type)} is {cheapest_price:.1f}p/L near {postcode} — I found it on FuelAlerts. Check if it's cheap near you too: {site_url}"
    from urllib.parse import quote
    whatsapp_url = f"https://wa.me/?text={quote(share_msg)}"

    return f"""<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Type" content="text/html;charset=UTF-8"/>
  <title>FuelAlerts Weekly Report</title>
</head>
<body style="margin:0;padding:0;background:{C_NAVY};font-family:Arial,'Helvetica Neue',sans-serif;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:{C_NAVY};">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0"
               style="max-width:600px;width:100%;">

          <!-- ── HEADER ── -->
          <tr>
            <td style="background:{C_NAVY_MID};border:1px solid {C_BORDER};
                       border-radius:20px 20px 0 0;padding:28px 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div>
                      <div style="font-size:22px;font-weight:900;color:{C_TEXT};letter-spacing:-0.03em;">
                        Fuel<span style="color:{C_GREEN};">Alerts</span>
                      </div>
                      <div style="font-size:10px;color:{C_FAINT};margin-top:3px;
                                  letter-spacing:0.08em;text-transform:uppercase;">
                        Your weekly fuel report
                      </div>
                    </div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <div style="background:rgba(0,230,118,0.1);border:1px solid rgba(0,230,118,0.25);
                                border-radius:999px;padding:5px 14px;display:inline-block;">
                      <span style="font-size:11px;font-weight:700;color:{C_GREEN};">
                        {esc(fuel_label(fuel_type))} &nbsp;&#183;&nbsp; {postcode} &nbsp;&#183;&nbsp; {radius} mi
                      </span>
                    </div>
                    <div style="font-size:11px;color:{C_FAINT};margin-top:6px;text-align:right;">
                      {today_str}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Hero price block -->
              <div style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};border-radius:16px;
                          padding:24px;margin-top:20px;">
                <div style="font-size:10px;font-weight:700;color:{C_FAINT};letter-spacing:0.08em;
                            text-transform:uppercase;margin-bottom:10px;">
                  Best price within {radius} miles
                  {f"&nbsp;&#183;&nbsp; fills your {tank_litres:.0f}L tank for £{cheapest_price * tank_litres / 100:.2f}" if tank_litres else ""}
                </div>
                <div style="font-family:Arial,sans-serif;font-size:60px;font-weight:900;
                            color:{C_GREEN};letter-spacing:-2px;line-height:1;">
                  {cheapest_price:.1f}<span style="font-size:24px;font-weight:600;color:{C_MUTED};">p/L</span>
                </div>
                <div style="font-size:14px;font-weight:700;color:{C_TEXT};margin-top:8px;">
                  {esc(station_display_name(top_stations[0])) if top_stations else ""}
                </div>
                <div style="font-size:12px;color:{C_MUTED};margin-top:3px;">
                  {esc(top_stations[0].get('postcode') or '') if top_stations else ''} &nbsp;&#183;&nbsp;
                  {top_stations[0]['distance_miles']:.1f} miles away
                </div>
                {delta_html}
              </div>
            </td>
          </tr>

          <!-- ── SAVINGS STRIP ── -->
          {savings_strip}

          <!-- ── CTA SHARE (prominent, right after savings strip) ── -->
          <tr>
            <td style="background:{C_NAVY_LIGHT};border-left:1px solid {C_BORDER};
                       border-right:1px solid {C_BORDER};padding:20px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:15px;font-weight:800;color:{C_TEXT};margin-bottom:4px;">
                      Know someone who drives near {postcode}?
                    </div>
                    <div style="font-size:12px;color:{C_MUTED};">
                      Send them this price — if they fill a 50L tank at the cheapest station vs the area average, they'd save £{f"{(area_avg - cheapest_price) * 50 / 100:.2f}" if area_avg else "money"}
                    </div>
                  </td>
                  <td align="right" style="vertical-align:middle;padding-left:16px;white-space:nowrap;">
                    <a href="{whatsapp_url}"
                       style="display:inline-block;background:#25D366;border-radius:10px;
                              padding:11px 22px;text-decoration:none;font-size:14px;
                              font-weight:800;color:#ffffff;">
                      &#128241; Share on WhatsApp
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── BODY ── -->
          <tr>
            <td style="background:{C_NAVY_MID};border-left:1px solid {C_BORDER};
                       border-right:1px solid {C_BORDER};padding:28px 32px;">

              <!-- Stats row -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                     style="margin-bottom:24px;">
                <tr>
                  {area_avg_html}
                  {spacer if area_avg_html and vs_last_html else ""}
                  {vs_last_html}
                </tr>
              </table>

              <!-- Price history chart -->
              {build_chart_html(price_history, fuel_type)}

              <!-- Nearest station -->
              {nearest_html}

              <!-- Top 5 cheapest -->
              <div style="font-size:10px;font-weight:700;color:{C_FAINT};letter-spacing:0.08em;
                          text-transform:uppercase;margin-bottom:14px;">
                Top {len(top_stations)} cheapest stations nearby
              </div>
              {station_rows}

            </td>
          </tr>

          <!-- ── VIEW MORE ── -->
          <tr>
            <td style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};
                       border-top:none;padding:18px 32px;text-align:center;">
              <a href="{site_url}"
                 style="font-size:13px;font-weight:700;color:{C_GREEN};text-decoration:none;">
                &#128269; See all prices &amp; stations at fuelalert.co.uk &#8594;
              </a>
            </td>
          </tr>
            </td></tr></table>
          <!-- ── FOOTER ── -->
          <tr>
            <td style="background:{C_NAVY};border:1px solid {C_BORDER};border-top:none;
                       border-radius:0 0 20px 20px;padding:20px 32px;">
              <div style="font-size:11px;color:{C_FAINT};line-height:1.7;text-align:center;">
                Prices sourced from the UK Government Fuel Finder API &nbsp;&#183;&nbsp; We check daily for the latest prices
              </div>
              <div style="text-align:center;margin-top:12px;">
                <a href="{site_url}/#update-preferences"
                   style="font-size:12px;color:{C_MUTED};text-decoration:none;font-weight:700;">
                  &#9998; Update my details
                </a>
                &nbsp;&nbsp;&#183;&nbsp;&nbsp;
                <a href="{unsub}" style="font-size:12px;color:{C_FAINT};text-decoration:none;">
                  Unsubscribe
                </a>
                &nbsp;&nbsp;&#183;&nbsp;&nbsp;
                <a href="{site_url}/privacy" style="font-size:12px;color:{C_FAINT};text-decoration:none;">
                  Privacy
                </a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""


# -----------------------------
# MAIN
# -----------------------------

def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting weekly digest...")

    supabase_url = require_env("SUPABASE_URL").rstrip("/")
    supabase_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    brevo_key    = require_env("BREVO_API_KEY")
    email_from   = require_env("EMAIL_FROM")
    site_url     = require_env("SITE_URL").rstrip("/")

    # ── TEST MODE ──────────────────────────────────────────────────────────
    # When TEST_MODE=true, only sends to TEST_EMAIL — never touches real users
    test_mode  = os.getenv("TEST_MODE", "false").lower() == "true"
    test_email = os.getenv("TEST_EMAIL", "")
    if test_mode:
        if not test_email:
            raise RuntimeError("TEST_MODE is true but TEST_EMAIL is not set!")
        print(f"⚠️  TEST MODE — will only send to {test_email}")
        print(f"⚠️  Supabase: {supabase_url}")
    # ──────────────────────────────────────────────────────────────────────

    sender_email = email_from
    if "<" in email_from and ">" in email_from:
        sender_email = email_from.split("<", 1)[1].split(">", 1)[0].strip()

    # Fetch data from Supabase once
    print("Fetching subscribers...")
    subscribers = supabase_get_active_subscribers(supabase_url, supabase_key)
    print(f"Active subscribers: {len(subscribers)}")
    if not subscribers:
        print("No active subscribers. Exiting.")
        return

    # In test mode — replace list with single test entry using first sub's settings
    if test_mode:
        real_sub = next((s for s in subscribers if s.get('postcode') == 'AB41 8AR'), subscribers[0])
        subscribers = [{ **real_sub, "email": test_email }]
        print(f"⚠️  TEST MODE — 1 email to {test_email} using settings from {real_sub.get('postcode')}")

    print("Fetching stations...")
    stations_raw = supabase_get_stations(supabase_url, supabase_key)
    print(f"Stations: {len(stations_raw)}")

    print("Fetching today's prices...")
    prices_raw = supabase_get_latest_prices(supabase_url, supabase_key)
    print(f"Price records: {len(prices_raw)}")

    # Index stations
    stations = {}
    for s in stations_raw:
        if s.get("latitude") and s.get("longitude"):
            # Skip only if EXPLICITLY closed (not NULL)
            if s.get("temporary_closure") is True or s.get("permanent_closure") is True:
                continue
            stations[s["node_id"]] = {
                **s,
                "lat": float(s["latitude"]),
                "lon": float(s["longitude"]),
            }

    # Index prices: node_id -> fuel_type -> record
    price_index = {}
    for p in prices_raw:
        nid = p.get("node_id")
        ft  = p.get("fuel_type")
        if nid and ft and p.get("price"):
            price_index.setdefault(nid, {})[ft] = p

    # ── Bulk fetch historical data (1 query each, not 1 per subscriber) ──
    subscriber_ids = [s["id"] for s in subscribers]
    print("Fetching weekly send history (bulk)...")
    sends_cache = supabase_get_all_weekly_sends(supabase_url, supabase_key, subscriber_ids)
    print(f"Send history loaded for {len(sends_cache)} subscribers")

    # First pass: work out which cheapest station each subscriber will get
    # so we can bulk-fetch their 7-day histories in one query
    print("Calculating cheapest stations per subscriber...")
    cheapest_nodes = set()
    subscriber_candidates = {}
    for sub in subscribers:
        try:
            sub_lat   = float(sub["lat"])
            sub_lon   = float(sub["lon"])
            radius    = int(sub["radius_miles"])
            fuel_type = normalise_fuel(sub.get("fuel_type") or "E10")
            candidates = []
            for nid, st in stations.items():
                fp = price_index.get(nid, {}).get(fuel_type)
                if not fp:
                    continue
                dist = haversine_miles(sub_lat, sub_lon, st["lat"], st["lon"])
                if dist <= radius:
                    candidates.append({**st, **fp, "distance_miles": dist})
            candidates.sort(key=lambda x: (float(x["price"]), x["distance_miles"]))
            subscriber_candidates[sub["id"]] = candidates
            if candidates:
                # Add top 5 nodes for history fetch, not just cheapest
                for c in candidates[:5]:
                    cheapest_nodes.add(c["node_id"])
        except Exception as e:
            print(f"  Pre-calc error for {sub.get('email')}: {e}")

    print(f"Fetching 7-day history for {len(cheapest_nodes)} unique stations (bulk)...")
    history_cache = supabase_get_bulk_7day_prices(supabase_url, supabase_key, list(cheapest_nodes))
    print(f"History loaded for {len(history_cache)} stations")

    sent_count = error_count = 0

    for sub in subscribers:
        try:
            sub_lat    = float(sub["lat"])
            sub_lon    = float(sub["lon"])
            radius     = int(sub["radius_miles"])
            fuel_type  = normalise_fuel(sub.get("fuel_type") or "E10")
            to_email   = sub["email"]

            candidates = subscriber_candidates.get(sub["id"], [])

            # Nearest station (closest, regardless of price)
            nearest_station = min(candidates, key=lambda x: x["distance_miles"]) if candidates else None

            top = candidates[:5]

            if not top:
                print(f"No stations found for {to_email}, skipping...")
                continue

            cheapest_price = float(top[0]["price"])
            cheapest_node  = top[0]["node_id"]

            # Last send — from cache (no API call)
            last = get_last_send_from_cache(sends_cache, sub["id"], fuel_type)
            last_price = float(last["cheapest_price"]) if last and last.get("cheapest_price") else None

            # Weeks cheapest — from cache (no API call)
            weeks_cheapest = get_weeks_cheapest_from_cache(sends_cache, sub["id"], cheapest_node, fuel_type)

            # 7-day price history — from cache (no API call)
            price_history = history_cache.get(cheapest_node, {}).get(fuel_type, [])

            # Area average
            area_prices = [float(c["price"]) for c in candidates]
            area_avg = sum(area_prices) / len(area_prices) if area_prices else None

            # MPG / cost calc
            annual_miles   = float(sub.get("annual_miles") or 0)
            mpg_val        = float(sub["mpg"]) if sub.get("mpg") else None
            tank_litres    = float(sub.get("tank_litres") or 50.0)
            used_default   = False
            if (mpg_val is None or mpg_val <= 0) and annual_miles > 0:
                mpg_val = default_mpg_for_fuel(fuel_type)
                used_default = True

            # Build + send email
            subject = f"FuelAlerts: cheapest {fuel_label(fuel_type)} within {radius} miles of {sub.get('postcode','')}"
            html = build_email_html(
                site_url       = site_url,
                subscriber     = sub,
                top_stations   = top,
                fuel_type      = fuel_type,
                cheapest_price = cheapest_price,
                last_price     = last_price,
                area_avg       = area_avg,
                weeks_cheapest = weeks_cheapest,
                price_history  = price_history,
                annual_miles   = annual_miles,
                mpg_val        = mpg_val,
                tank_litres    = tank_litres,
                used_default_mpg = used_default,
                nearest_station  = nearest_station,
                history_cache    = history_cache,
            )

            brevo_send_email(brevo_key, sender_email, to_email, subject, html)
            print(f"✓ Sent to {to_email}")

            # Record send
            supabase_insert_weekly_send(supabase_url, supabase_key, {
                "subscriber_id":     sub["id"],
                "fuel_type":         fuel_type,
                "cheapest_node_id":  cheapest_node,
                "cheapest_price":    cheapest_price,
                "cheapest_updated_at": top[0].get("price_last_updated"),
                "radius_miles":      radius,
                "postcode":          sub.get("postcode"),
                "station_count":     len(candidates),
                "top5": [
                    {
                        "node_id":           r["node_id"],
                        "price":             price_to_float(r["price"]),
                        "distance_miles":    r["distance_miles"],
                        "trading_name":      r.get("trading_name"),
                        "brand_name":        r.get("brand_name"),
                        "postcode":          r.get("postcode"),
                        "price_last_updated": r.get("price_last_updated"),
                    }
                    for r in top
                ],
            })
            sent_count += 1

        except Exception as e:
            print(f"✗ ERROR for {sub.get('email')}: {e}")
            error_count += 1

    print(f"\n[{datetime.now(timezone.utc).isoformat()}] Done! Sent: {sent_count} | Errors: {error_count}")

if __name__ == "__main__":
    main()
