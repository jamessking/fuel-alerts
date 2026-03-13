from dotenv import load_dotenv
load_dotenv()

import os
import math
import requests
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from urllib.parse import quote as _qurlq

# -----------------------------
# CONSTANTS
# -----------------------------
IMP_GALLON_LITRES = 4.54609
DEFAULT_ALERT_THRESHOLD_PPL = 3.0   # pence per litre
ALERT_COOLDOWN_DAYS = 7             # min days between price alerts per subscriber
DIGEST_BUFFER_HOURS = 48            # don't send within this window of weekly digest

# -----------------------------
# HELPERS  (shared with weekly_digest.py)
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

def esc(s) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def town_slug(town: str) -> str:
    import re as _re
    s = (town or "").lower().strip()
    s = _re.sub(r"[^a-z0-9\s-]", "", s)
    s = _re.sub(r"\s+", "-", s)
    s = _re.sub(r"-+", "-", s)
    return s

FUEL_DISPLAY = {
    "E10": "Unleaded (E10)",
    "E5":  "Super Unleaded",
    "B7":  "Diesel",
    "SDV": "Super Diesel",
}

def fuel_label(ft: str) -> str:
    return FUEL_DISPLAY.get((ft or "").upper(), ft or "Fuel")

FUEL_NORMALISE = {
    "PETROL": "E10", "UNLEADED": "E10", "E10": "E10",
    "E5": "E5", "SUPER UNLEADED": "E5", "SUPER": "E5",
    "DIESEL": "B7", "B7": "B7",
    "SUPER DIESEL": "SDV", "SDV": "SDV", "PREMIUM DIESEL": "SDV",
}

def normalise_fuel(ft: str) -> str:
    return FUEL_NORMALISE.get((ft or "").strip().upper(), "E10")

def station_display_name(st: dict) -> str:
    clean = (st.get("brand_clean") or "").strip()
    if clean:
        return clean
    brand   = (st.get("brand_name")   or "").strip()
    trading = (st.get("trading_name") or "").strip()
    if brand and brand.upper() not in ("", "OTHER", "INDEPENDENT", "NULL", "N/A"):
        return brand if len(brand) <= 3 else brand.title()
    return trading.title() if trading else "Independent"

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
    "COSTCO":         "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/Costco-1.png",
    "HARVEST ENERGY": "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/HARVEST_ENERGY.png",
    "MURCO":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/MURCO.png",
    "TOTAL":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/TOTAL.png",
    "MAXOL":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/Maxol.png",
    "CO-OP":          "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/co-op.png",
    "VALERO":         "https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/valero.png",
}

def brand_logo_url(st: dict) -> str:
    db_logo = (st.get("logo_url") or "").strip()
    if db_logo:
        return db_logo
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

def logo_pill(logo_url: str, alt: str, size: int = 48) -> str:
    safe_alt = (alt or "").replace('"', '&quot;')
    radius   = int(size * 0.22)
    img_size = int(size * 0.75)
    pad      = (size - img_size) // 2
    if logo_url:
        inner = (
            f'<table role="presentation" width="{size}" height="{size}" '
            f'cellspacing="0" cellpadding="0" border="0">'
            f'<tr><td align="center" valign="middle" style="padding:{pad}px;">'
            f'<img src="{logo_url}" width="{img_size}" height="{img_size}" '
            f'alt="{safe_alt}" border="0" '
            f'style="display:block;width:{img_size}px;height:{img_size}px;" />'
            f'</td></tr></table>'
        )
    else:
        fsize = int(size * 0.48)
        inner = (
            f'<table role="presentation" width="{size}" height="{size}" '
            f'cellspacing="0" cellpadding="0" border="0">'
            f'<tr><td align="center" valign="middle">'
            f'<span style="font-size:{fsize}px;line-height:1;color:#999999;">&#9981;</span>'
            f'</td></tr></table>'
        )
    return (
        f'<table role="presentation" cellspacing="0" cellpadding="0" border="0" '
        f'style="margin-bottom:10px;">'
        f'<tr><td style="background:#ffffff;border-radius:{radius}px;'
        f'width:{size}px;height:{size}px;overflow:hidden;">'
        f'{inner}'
        f'</td></tr></table>'
    )

# -----------------------------
# COLOUR PALETTE
# -----------------------------
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

# -----------------------------
# SUPABASE
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
            "select": "id,email,postcode,lat,lon,fuel_type,radius_miles,status,"
                      "unsubscribe_token_hash,annual_miles,mpg,tank_litres,price_alert_threshold",
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
    limit  = 1000
    while True:
        r = requests.get(
            f"{url}/rest/v1/pfs_stations",
            params={
                "select": "node_id,trading_name,brand_name,brand_clean,logo_url,"
                          "postcode,latitude,longitude",
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
    limit  = 1000
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

def supabase_get_last_price_alerts(url: str, key: str, subscriber_ids: list) -> dict:
    """
    Fetch the most recent price_alert record per subscriber.
    Returns dict: subscriber_id -> latest alert row
    """
    if not subscriber_ids:
        return {}
    ids_str = ",".join(f'"{sid}"' for sid in subscriber_ids)
    r = requests.get(
        f"{url}/rest/v1/price_alerts",
        params={
            "select": "subscriber_id,sent_at,price_at_send,direction",
            "subscriber_id": f"in.({ids_str})",
            "order": "sent_at.desc",
        },
        headers={
            **sb_headers(key),
            "Range": "0-999",
            "Range-Unit": "items",
        },
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    # Keep only the most recent per subscriber
    result = {}
    for row in rows:
        sid = row["subscriber_id"]
        if sid not in result:
            result[sid] = row
    return result

def supabase_get_last_weekly_sends(url: str, key: str, subscriber_ids: list) -> dict:
    """
    Fetch the most recent weekly_send per subscriber.
    Returns dict: subscriber_id -> sent_at (datetime str)
    """
    if not subscriber_ids:
        return {}
    ids_str = ",".join(f'"{sid}"' for sid in subscriber_ids)
    r = requests.get(
        f"{url}/rest/v1/weekly_sends",
        params={
            "select": "subscriber_id,sent_at",
            "subscriber_id": f"in.({ids_str})",
            "order": "sent_at.desc",
        },
        headers={
            **sb_headers(key),
            "Range": "0-999",
            "Range-Unit": "items",
        },
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    result = {}
    for row in rows:
        sid = row["subscriber_id"]
        if sid not in result:
            result[sid] = row["sent_at"]
    return result

def supabase_insert_price_alert(url: str, key: str, payload: dict):
    r = requests.post(
        f"{url}/rest/v1/price_alerts",
        headers={
            **sb_headers(key),
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
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
            "to":     [{"email": to_email}],
            "subject": subject,
            "htmlContent": html,
        },
        timeout=30,
    )
    r.raise_for_status()

# -----------------------------
# ELIGIBILITY CHECK
# -----------------------------

def is_eligible(
    sub_id: str,
    current_price: float,
    threshold: float,
    last_alert: Optional[dict],
    last_digest_at: Optional[str],
    now: datetime,
) -> tuple[bool, Optional[float], Optional[str]]:
    """
    Returns (eligible, price_at_last_alert, direction)
    direction: 'drop' | 'rise' | None
    """
    # No previous alert — check cooldown against weekly digest only
    if last_alert is None:
        if last_digest_at:
            digest_dt = datetime.fromisoformat(last_digest_at.replace("Z", "+00:00"))
            if (now - digest_dt).total_seconds() < DIGEST_BUFFER_HOURS * 3600:
                return False, None, None
        # No baseline — can't measure movement, skip
        return False, None, None

    # Parse last alert time
    alert_dt = datetime.fromisoformat(last_alert["sent_at"].replace("Z", "+00:00"))

    # Cooldown: must be at least ALERT_COOLDOWN_DAYS since last alert
    if (now - alert_dt).total_seconds() < ALERT_COOLDOWN_DAYS * 86400:
        return False, None, None

    # Also check not within DIGEST_BUFFER_HOURS of last digest
    if last_digest_at:
        digest_dt = datetime.fromisoformat(last_digest_at.replace("Z", "+00:00"))
        if (now - digest_dt).total_seconds() < DIGEST_BUFFER_HOURS * 3600:
            return False, None, None

    last_price = float(last_alert["price_at_send"])
    diff = current_price - last_price  # positive = rise, negative = drop

    if diff <= -threshold:
        return True, last_price, "drop"
    elif diff >= threshold:
        return True, last_price, "rise"
    else:
        return False, None, None

# -----------------------------
# EMAIL BUILDER
# -----------------------------

def build_alert_email(
    site_url: str,
    subscriber: dict,
    cheapest: dict,
    fuel_type: str,
    current_price: float,
    last_price: float,
    direction: str,           # 'drop' | 'rise'
    threshold: float,
    tank_litres: float,
) -> str:

    diff        = abs(current_price - last_price)
    postcode    = esc(subscriber.get("postcode", ""))
    unsub_token = subscriber.get("unsubscribe_token_hash", "")
    unsub_url   = f"{site_url}/unsubscribe?token={esc(unsub_token)}"
    today_str   = datetime.now().strftime("%-d %B %Y")

    name     = esc(station_display_name(cheapest))
    st_pc    = esc(cheapest.get("postcode") or "")
    dist     = cheapest.get("distance_miles", 0)
    lat      = cheapest.get("lat") or cheapest.get("latitude", 0)
    lon      = cheapest.get("lon") or cheapest.get("longitude", 0)
    maps_url = f"https://www.google.com/maps?q={lat},{lon}" if lat and lon else "#"
    logo_url = brand_logo_url(cheapest)
    logo_html = logo_pill(logo_url, name, size=52)

    # Town page link
    town = cheapest.get("town", "")
    town_link_html = ""
    if town:
        town_link_html = (
            f'<a href="{site_url}/town/{town_slug(town)}" '
            f'style="font-size:12px;font-weight:700;color:{C_MUTED};text-decoration:none;">'
            f'See all prices in {esc(town)} &rarr;</a>'
        )

    # Tank cost saving/extra
    tank_impact = diff * tank_litres / 100
    tank_litres_display = int(tank_litres)

    # Direction-specific copy and colours
    if direction == "drop":
        banner_bg     = C_GREEN_DIM
        banner_border = C_GREEN
        headline_pre  = f"DOWN {diff:.1f}p"
        headline_pre_color = C_GREEN
        subhead       = f"{fuel_label(fuel_type)} has fallen near {postcode} — good time to fill up."
        movement_label = f"Down {diff:.1f}p from {last_price:.1f}p"
        tank_msg      = f"That's <strong>£{tank_impact:.2f} cheaper</strong> to fill a {tank_litres_display}L tank than last alert"
        share_cta     = "Pass it on"
        share_msg     = (
            f"{fuel_label(fuel_type)} prices have dropped near {postcode} — "
            f"now {current_price:.1f}p/L at {station_display_name(cheapest)}, "
            f"down {diff:.1f}p. Check FuelAlerts for prices near you: {site_url}"
        )
        subject = f"Fuel prices are down near {postcode} — {diff:.1f}p cheaper"
    else:
        banner_bg     = "#2a1500"
        banner_border = C_AMBER
        headline_pre  = f"UP {diff:.1f}p"
        headline_pre_color = C_AMBER
        subhead       = f"{fuel_label(fuel_type)} has risen near {postcode} — worth knowing before your next fill-up."
        movement_label = f"Up {diff:.1f}p from {last_price:.1f}p"
        tank_msg      = f"That's <strong>£{tank_impact:.2f} more</strong> to fill a {tank_litres_display}L tank than last alert"
        share_cta     = "Share the heads up"
        share_msg     = (
            f"Heads up — {fuel_label(fuel_type)} prices have risen near {postcode}. "
            f"Now {current_price:.1f}p/L, up {diff:.1f}p. "
            f"Check FuelAlerts for the cheapest near you: {site_url}"
        )
        subject = f"Fuel prices are up near {postcode} — {diff:.1f}p more expensive"

    whatsapp_url = f"https://wa.me/?text={_qurlq(share_msg)}"
    sms_url      = f"sms:?body={_qurlq(share_msg)}"

    threshold_int = int(threshold) if threshold == int(threshold) else threshold

    return f"""<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Type" content="text/html;charset=UTF-8"/>
  <title>FuelAlerts Price Alert</title>
</head>
<body style="margin:0;padding:0;background:{C_NAVY};font-family:Arial,'Helvetica Neue',sans-serif;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
       style="background:{C_NAVY};">
  <tr>
    <td align="center" style="padding:32px 16px 48px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0"
             style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:{C_NAVY_MID};border:1px solid {C_BORDER};
                     border-radius:20px 20px 0 0;padding:28px 32px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:22px;font-weight:900;color:{C_TEXT};letter-spacing:-0.03em;">
                    Fuel<span style="color:{C_GREEN};">Alerts</span>
                  </div>
                  <div style="font-size:10px;color:{C_FAINT};margin-top:3px;
                              letter-spacing:0.08em;text-transform:uppercase;">
                    Price alert
                  </div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <div style="background:rgba(136,153,187,0.1);border:1px solid rgba(136,153,187,0.2);
                              border-radius:999px;padding:5px 14px;display:inline-block;">
                    <span style="font-size:11px;font-weight:700;color:{C_MUTED};">
                      {esc(fuel_label(fuel_type))} &nbsp;&#183;&nbsp; {postcode}
                    </span>
                  </div>
                  <div style="font-size:11px;color:{C_FAINT};margin-top:6px;text-align:right;">
                    {today_str}
                  </div>
                </td>
              </tr>
            </table>

            <!-- BANNER STRIP -->
            <div style="background:{banner_bg};border:1px solid {banner_border};
                        border-radius:14px;padding:24px 28px;margin-top:24px;margin-bottom:0;">
              <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;
                          color:{banner_border};letter-spacing:0.1em;text-transform:uppercase;
                          margin-bottom:10px;">
                {fuel_label(fuel_type)} near {postcode}
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-family:Arial,sans-serif;font-size:52px;font-weight:900;
                                color:{headline_pre_color};letter-spacing:-2px;line-height:1;">
                      {headline_pre}
                    </div>
                    <div style="font-size:14px;color:{C_TEXT};font-weight:600;margin-top:8px;">
                      {subhead}
                    </div>
                  </td>
                  <td align="right" style="vertical-align:middle;padding-left:16px;white-space:nowrap;">
                    <div style="font-family:Arial,sans-serif;font-size:42px;font-weight:900;
                                color:{C_TEXT};letter-spacing:-1.5px;line-height:1;">
                      {current_price:.1f}<span style="font-size:18px;font-weight:600;
                      color:{C_MUTED};">p/L</span>
                    </div>
                    <div style="font-size:12px;color:{C_MUTED};text-align:right;margin-top:4px;">
                      {movement_label}
                    </div>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- TANK SAVING / COST -->
        <tr>
          <td style="background:{C_NAVY_LIGHT};border-left:1px solid {C_BORDER};
                     border-right:1px solid {C_BORDER};padding:14px 32px;text-align:center;">
            <div style="font-size:13px;color:{C_TEXT};">
              {tank_msg}
            </div>
          </td>
        </tr>

        <!-- CHEAPEST STATION -->
        <tr>
          <td style="background:{C_NAVY_MID};border-left:1px solid {C_BORDER};
                     border-right:1px solid {C_BORDER};padding:28px 32px;">

            <div style="font-size:10px;font-weight:700;color:{C_FAINT};
                        letter-spacing:0.08em;text-transform:uppercase;margin-bottom:16px;">
              Cheapest nearby
            </div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                   style="border-radius:14px;overflow:hidden;border:2px solid {banner_border};
                          background:{C_NAVY_LIGHT};">
              <tr>
                <td style="padding:18px 20px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;width:64px;padding-right:16px;">
                        {logo_html}
                      </td>
                      <td style="vertical-align:middle;">
                        <div style="font-size:16px;font-weight:800;color:{C_TEXT};">{name}</div>
                        <div style="font-size:12px;color:{C_MUTED};margin-top:4px;">
                          {st_pc} &nbsp;&#183;&nbsp; {dist:.1f} miles away
                        </div>
                        {f'<div style="margin-top:6px;">{town_link_html}</div>' if town_link_html else ""}
                        <div style="margin-top:12px;">
                          <a href="{maps_url}"
                             style="display:inline-block;background:{banner_border};
                                    border-radius:8px;padding:9px 18px;text-decoration:none;
                                    font-size:13px;font-weight:800;color:{C_NAVY};">
                            Get directions
                          </a>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;padding-left:12px;white-space:nowrap;">
                        <div style="font-family:Arial,sans-serif;font-size:38px;font-weight:900;
                                    color:{banner_border};letter-spacing:-1px;line-height:1;">
                          {current_price:.1f}p
                        </div>
                        <div style="font-size:11px;color:{C_FAINT};text-align:right;margin-top:3px;">
                          per litre
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- SHARE CTA -->
        <tr>
          <td style="background:{C_NAVY_LIGHT};border-left:1px solid {C_BORDER};
                     border-right:1px solid {C_BORDER};padding:20px 32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:15px;font-weight:800;color:{C_TEXT};margin-bottom:4px;">
                    {share_cta}
                  </div>
                  <div style="font-size:12px;color:{C_MUTED};line-height:1.5;">
                    Know someone who drives near {postcode}? Send them this.
                  </div>
                </td>
                <td align="right" style="vertical-align:middle;padding-left:20px;white-space:nowrap;">
                  <a href="{whatsapp_url}"
                     style="display:inline-block;background:#25D366;border-radius:8px;
                            padding:10px 18px;text-decoration:none;font-size:13px;
                            font-weight:800;color:#ffffff;margin-bottom:8px;">
                    WhatsApp
                  </a>
                  <br/>
                  <a href="{sms_url}"
                     style="display:inline-block;background:{C_NAVY_MID};
                            border:1px solid {C_BORDER};border-radius:8px;
                            padding:8px 18px;text-decoration:none;font-size:12px;
                            font-weight:700;color:{C_TEXT};">
                    SMS
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- VIEW MORE -->
        <tr>
          <td style="background:{C_NAVY_LIGHT};border:1px solid {C_BORDER};
                     border-top:none;padding:16px 32px;text-align:center;">
            <a href="{site_url}"
               style="font-size:13px;font-weight:700;color:{C_GREEN};text-decoration:none;">
              See all stations and prices at fuelalerts.co.uk &rarr;
            </a>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:{C_NAVY};border:1px solid {C_BORDER};border-top:none;
                     border-radius:0 0 20px 20px;padding:20px 32px;">
            <div style="font-size:11px;color:{C_FAINT};line-height:1.7;text-align:center;">
              You're receiving this because {fuel_label(fuel_type)} prices near {postcode}
              moved by more than {threshold_int}p since your last alert.
              Your alert threshold is currently <strong style="color:{C_MUTED};">{threshold_int}p</strong>
              — you can change this in your account settings.
            </div>
            <div style="text-align:center;margin-top:12px;">
              <a href="{site_url}/signin"
                 style="font-size:12px;color:{C_MUTED};text-decoration:none;font-weight:700;">
                Update my details
              </a>
              &nbsp;&nbsp;&#183;&nbsp;&nbsp;
              <a href="{unsub_url}"
                 style="font-size:12px;color:{C_FAINT};text-decoration:none;">
                Unsubscribe
              </a>
              &nbsp;&nbsp;&#183;&nbsp;&nbsp;
              <a href="{site_url}/privacy"
                 style="font-size:12px;color:{C_FAINT};text-decoration:none;">
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
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting price alert run...")

    supabase_url = require_env("SUPABASE_URL").rstrip("/")
    supabase_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    brevo_key    = require_env("BREVO_API_KEY")
    email_from   = require_env("EMAIL_FROM")
    site_url     = require_env("SITE_URL").rstrip("/")

    test_mode  = os.getenv("TEST_MODE", "false").lower() == "true"
    test_email = os.getenv("TEST_EMAIL", "")
    if test_mode:
        if not test_email:
            raise RuntimeError("TEST_MODE is true but TEST_EMAIL is not set!")
        print(f"TEST MODE — will only send to {test_email}")

    sender_email = email_from
    if "<" in email_from and ">" in email_from:
        sender_email = email_from.split("<", 1)[1].split(">", 1)[0].strip()

    now = datetime.now(timezone.utc)

    # ── Fetch all data ──
    print("Fetching subscribers...")
    subscribers = supabase_get_active_subscribers(supabase_url, supabase_key)
    print(f"Active subscribers: {len(subscribers)}")
    if not subscribers:
        print("No active subscribers. Exiting.")
        return

    if test_mode:
        real_sub = next((s for s in subscribers if s.get("postcode") == "AB41 8AR"), subscribers[0])
        subscribers = [{**real_sub, "email": test_email}]
        print(f"TEST MODE — 1 email to {test_email} using settings from {real_sub.get('postcode')}")

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
            if s.get("temporary_closure") is True or s.get("permanent_closure") is True:
                continue
            stations[s["node_id"]] = {
                **s,
                "lat": float(s["latitude"]),
                "lon": float(s["longitude"]),
            }

    # Index prices
    price_index = {}
    for p in prices_raw:
        nid = p.get("node_id")
        ft  = p.get("fuel_type")
        if nid and ft and p.get("price"):
            price_index.setdefault(nid, {})[ft] = p

    # Bulk fetch alert history and digest history
    subscriber_ids = [s["id"] for s in subscribers]

    print("Fetching last price alerts (bulk)...")
    last_alerts = supabase_get_last_price_alerts(supabase_url, supabase_key, subscriber_ids)

    print("Fetching last weekly sends (bulk)...")
    last_digests = supabase_get_last_weekly_sends(supabase_url, supabase_key, subscriber_ids)

    sent_count = skipped_count = error_count = 0

    for sub in subscribers:
        try:
            sub_lat   = float(sub["lat"])
            sub_lon   = float(sub["lon"])
            radius    = int(sub["radius_miles"])
            fuel_type = normalise_fuel(sub.get("fuel_type") or "E10")
            threshold = float(sub.get("price_alert_threshold") or DEFAULT_ALERT_THRESHOLD_PPL)
            tank_litres = float(sub.get("tank_litres") or 50.0)

            # Find cheapest nearby station
            candidates = []
            for nid, st in stations.items():
                fp = price_index.get(nid, {}).get(fuel_type)
                if not fp:
                    continue
                dist = haversine_miles(sub_lat, sub_lon, st["lat"], st["lon"])
                if dist <= radius:
                    candidates.append({**st, **fp, "distance_miles": dist})

            if not candidates:
                skipped_count += 1
                continue

            candidates.sort(key=lambda x: (float(x["price"]), x["distance_miles"]))
            cheapest       = candidates[0]
            current_price  = float(cheapest["price"])

            last_alert  = last_alerts.get(sub["id"])
            last_digest = last_digests.get(sub["id"])

            eligible, last_price, direction = is_eligible(
                sub_id=sub["id"],
                current_price=current_price,
                threshold=threshold,
                last_alert=last_alert,
                last_digest_at=last_digest,
                now=now,
            )

            if not eligible:
                skipped_count += 1
                continue

            to_email = sub["email"]
            subject  = (
                f"Fuel prices are down near {sub.get('postcode','')} — {abs(current_price - last_price):.1f}p cheaper"
                if direction == "drop" else
                f"Fuel prices are up near {sub.get('postcode','')} — {abs(current_price - last_price):.1f}p more expensive"
            )

            html = build_alert_email(
                site_url      = site_url,
                subscriber    = sub,
                cheapest      = cheapest,
                fuel_type     = fuel_type,
                current_price = current_price,
                last_price    = last_price,
                direction     = direction,
                threshold     = threshold,
                tank_litres   = tank_litres,
            )

            brevo_send_email(brevo_key, sender_email, to_email, subject, html)
            print(f"  Sent ({direction}) to {to_email} — {last_price:.1f}p -> {current_price:.1f}p")

            # Record the alert
            supabase_insert_price_alert(supabase_url, supabase_key, {
                "subscriber_id":   sub["id"],
                "fuel_type":       fuel_type,
                "direction":       direction,
                "price_at_send":   current_price,
                "cheapest_node_id": cheapest["node_id"],
                "postcode":        sub.get("postcode"),
                "threshold_used":  threshold,
            })
            sent_count += 1

        except Exception as e:
            print(f"  ERROR for {sub.get('email')}: {e}")
            error_count += 1

    print(
        f"\n[{datetime.now(timezone.utc).isoformat()}] Done! "
        f"Sent: {sent_count} | Skipped: {skipped_count} | Errors: {error_count}"
    )


if __name__ == "__main__":
    main()
