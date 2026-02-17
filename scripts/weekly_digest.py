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
            "select": "id,email,postcode,lat,lon,radius_miles,fuel_type,annual_miles,mpg,tank_litres,unsubscribe_token_hash",
            "status": "eq.active",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def supabase_get_stations(url: str, key: str) -> list:
    r = requests.get(
        f"{url}/rest/v1/pfs_stations",
        params={
            "select": "node_id,trading_name,brand_name,postcode,latitude,longitude",
            "temporary_closure": "is.false",
            "permanent_closure": "is.false",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def supabase_get_latest_prices(url: str, key: str) -> list:
    today = date.today().isoformat()
    r = requests.get(
        f"{url}/rest/v1/fuel_prices_daily",
        params={
            "select": "node_id,fuel_type,price,price_last_updated",
            "snapshot_date": f"eq.{today}",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def supabase_get_7day_prices(url: str, key: str, node_id: str, fuel_type: str) -> list:
    """Get last 7 days of prices for a specific station"""
    since = (date.today() - timedelta(days=7)).isoformat()
    r = requests.get(
        f"{url}/rest/v1/fuel_prices_daily",
        params={
            "select": "snapshot_date,price",
            "node_id": f"eq.{node_id}",
            "fuel_type": f"eq.{fuel_type}",
            "snapshot_date": f"gte.{since}",
            "order": "snapshot_date.asc",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def supabase_get_last_send(url: str, key: str, subscriber_id: str, fuel_type: str) -> Optional[dict]:
    r = requests.get(
        f"{url}/rest/v1/weekly_sends",
        params={
            "select": "sent_at,cheapest_price,cheapest_node_id",
            "subscriber_id": f"eq.{subscriber_id}",
            "fuel_type": f"eq.{fuel_type}",
            "order": "sent_at.desc",
            "limit": "1",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None

def supabase_get_weeks_cheapest(url: str, key: str, subscriber_id: str, node_id: str, fuel_type: str) -> int:
    """Count consecutive weeks this station was cheapest for this subscriber"""
    r = requests.get(
        f"{url}/rest/v1/weekly_sends",
        params={
            "select": "cheapest_node_id",
            "subscriber_id": f"eq.{subscriber_id}",
            "fuel_type": f"eq.{fuel_type}",
            "order": "sent_at.desc",
            "limit": "12",
        },
        headers=sb_headers(key),
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
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

def build_chart_html(price_history: list, fuel_type: str) -> str:
    """Build a pure HTML/CSS bar chart from price history data"""

    if not price_history:
        return """
        <div style="background:#f8f9fc;border-radius:14px;padding:18px;margin-bottom:24px;
                    text-align:center;color:#bbb;font-size:12px;">
          Price history will appear here once more data is collected (7+ days)
        </div>
        """

    prices = [float(d["price"]) for d in price_history]
    min_p = min(prices)
    max_p = max(prices)
    price_range = max(max_p - min_p, 1.0)  # avoid div by zero
    max_bar_height = 50  # px
    min_bar_height = 8   # px

    days_map = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    bars = ""
    for i, d in enumerate(price_history):
        p = float(d["price"])
        date_str = d["snapshot_date"]
        try:
            day_name = days_map[datetime.strptime(date_str, "%Y-%m-%d").weekday()]
        except:
            day_name = date_str[-5:]

        is_today = date_str == date.today().isoformat()
        is_cheapest = p == min_p

        # Height proportional - lower price = taller bar (inverted, since lower is better)
        normalized = 1.0 - ((p - min_p) / price_range)
        height = int(min_bar_height + normalized * (max_bar_height - min_bar_height))

        if is_today:
            bar_color = "background:linear-gradient(180deg,#ff5c8a,#ff9b3e);"
            label_color = "color:#ff5c8a;font-weight:700;"
            price_color = "color:#ff5c8a;font-weight:800;"
        elif is_cheapest:
            bar_color = "background:#00c46a;"
            label_color = "color:#00a854;"
            price_color = "color:#00a854;font-weight:700;"
        else:
            bar_color = "background:#d4b8ff;"
            label_color = "color:#aaa;"
            price_color = "color:#888;"

        bars += f"""
        <td style="text-align:center;vertical-align:bottom;padding:0 3px;width:{int(100/len(price_history))}%;">
          <div style="{bar_color}border-radius:4px 4px 0 0;height:{height}px;width:100%;"></div>
          <div style="font-size:10px;{label_color}margin-top:4px;">{esc(day_name)}</div>
          <div style="font-size:10px;{price_color}">{p:.0f}p</div>
        </td>
        """

    return f"""
    <div style="background:#f8f9fc;border-radius:14px;padding:18px 18px 14px;margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;color:#999;letter-spacing:0.8px;
                  text-transform:uppercase;margin-bottom:14px;">
        {len(price_history)}-Day Price History &nbsp;·&nbsp; {esc(fuel_type)}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr style="vertical-align:bottom;">
          {bars}
        </tr>
      </table>
      <div style="font-size:10px;color:#ccc;margin-top:8px;text-align:right;">
        ↑ Taller bar = lower price &nbsp;·&nbsp; prices in p/L
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
) -> str:

    unsub_token = subscriber.get("unsubscribe_token_hash", "")
    unsub = f"{site_url}/unsubscribe?token={esc(unsub_token)}"
    postcode = esc(subscriber.get("postcode", ""))
    radius = subscriber.get("radius_miles", 5)

    # Price change
    diff = None
    if last_price is not None:
        diff = cheapest_price - last_price

    if diff is not None:
        if diff < 0:
            change_color = "#00e676"
            change_bg = "rgba(0,230,118,0.15)"
            change_border = "rgba(0,230,118,0.3)"
            change_text = f"⬇ {abs(diff):.1f}p"
        elif diff > 0:
            change_color = "#ff6b6b"
            change_bg = "rgba(255,107,107,0.15)"
            change_border = "rgba(255,107,107,0.3)"
            change_text = f"⬆ {diff:.1f}p"
        else:
            change_color = "#aaa"
            change_bg = "rgba(255,255,255,0.07)"
            change_border = "rgba(255,255,255,0.15)"
            change_text = "➡ No change"
        change_badge = f"""
        <div style="background:{change_bg};border:1px solid {change_border};
                    border-radius:14px;padding:14px 16px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:{change_color};line-height:1;">{change_text}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.45);margin-top:5px;
                      font-weight:600;letter-spacing:0.5px;">VS LAST WEEK</div>
        </div>
        """
    else:
        change_badge = """
        <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
                    border-radius:14px;padding:14px 16px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:rgba(255,255,255,0.5);line-height:1;">First<br/>report</div>
        </div>
        """

    # Weeks cheapest badge
    if weeks_cheapest >= 2:
        weeks_badge = f"""
        <div style="margin-top:10px;text-align:center;background:rgba(255,255,255,0.07);
                    border-radius:10px;padding:8px 12px;">
          <div style="font-size:13px;font-weight:800;color:#ffd86e;">🏆 {weeks_cheapest} weeks</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;letter-spacing:0.3px;">CHEAPEST IN A ROW</div>
        </div>
        """
    else:
        weeks_badge = ""

    # Savings strip
    if diff is not None and annual_miles > 0 and mpg_val:
        l_week = litres_per_week(annual_miles, mpg_val)
        pw = l_week * pounds_from_ppl(diff)
        pf = tank_litres * pounds_from_ppl(diff)
        label = "default MPG" if used_default_mpg else "your MPG"
        direction = "down" if diff < 0 else "up"
        action = "save" if diff < 0 else "cost"
        savings_strip = f"""
        <tr>
          <td style="background:linear-gradient(90deg,{'#ff5c8a,#ff7e5f' if diff < 0 else '#ff6b35,#f7c59f'});padding:16px 32px;">
            <div style="font-size:14px;font-weight:800;color:#ffffff;text-align:center;">
              {'💰' if diff < 0 else '⚠️'} Prices {direction} — {action} approx.
              <b>£{abs(pw):.2f}/week</b>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.75);text-align:center;margin-top:3px;">
              ~£{abs(pf):.2f} per fill &nbsp;·&nbsp; {annual_miles:.0f} mi/yr &nbsp;·&nbsp;
              {mpg_val:.0f}mpg &nbsp;·&nbsp; {tank_litres:.0f}L tank ({label})
            </div>
          </td>
        </tr>
        """
    else:
        savings_strip = ""

    # Trend stats row
    area_avg_html = f"""
    <td width="32%" style="background:#f7f3ff;border-radius:12px;padding:14px 16px;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:#9b7fd4;letter-spacing:0.8px;text-transform:uppercase;">
        Area Average
      </div>
      <div style="font-size:22px;font-weight:900;color:#1a0a2e;margin-top:6px;letter-spacing:-0.5px;">
        {f"{area_avg:.1f}p" if area_avg else "—"}
      </div>
      <div style="font-size:11px;color:#888;margin-top:3px;">within {radius} miles</div>
    </td>
    """ if area_avg else ""

    vs_last_html = f"""
    <td width="32%" style="background:{'#f0fff6' if diff and diff < 0 else '#fff5f5' if diff and diff > 0 else '#f8f9fc'};
                            border-radius:12px;padding:14px 16px;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;
                  color:{'#00a854' if diff and diff < 0 else '#e05252' if diff and diff > 0 else '#999'};
                  letter-spacing:0.8px;text-transform:uppercase;">
        This vs Last Week
      </div>
      <div style="font-size:22px;font-weight:900;color:#1a0a2e;margin-top:6px;letter-spacing:-0.5px;">
        {f"⬇ {abs(diff):.1f}p" if diff and diff < 0 else f"⬆ {diff:.1f}p" if diff and diff > 0 else "—"}
      </div>
      <div style="font-size:11px;color:#888;margin-top:3px;">
        {f"was {last_price:.1f}p/L" if last_price else "first report"}
      </div>
    </td>
    """ if diff is not None or last_price is not None else ""

    weeks_html = f"""
    <td width="32%" style="background:#fff8ec;border-radius:12px;padding:14px 16px;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:#e8880a;letter-spacing:0.8px;text-transform:uppercase;">
        Cheapest For
      </div>
      <div style="font-size:22px;font-weight:900;color:#1a0a2e;margin-top:6px;letter-spacing:-0.5px;">
        {'🏆 ' + str(weeks_cheapest) + ' wk' + ('s' if weeks_cheapest != 1 else '') if weeks_cheapest >= 1 else '—'}
      </div>
      <div style="font-size:11px;color:#888;margin-top:3px;">
        {esc(top_stations[0].get('trading_name') or top_stations[0].get('brand_name') or '') if top_stations else ''}
      </div>
    </td>
    """ if weeks_cheapest >= 1 else ""

    # Build station rows
    station_rows = ""
    for i, st in enumerate(top_stations):
        name = esc(st.get("trading_name") or st.get("brand_name") or "Fuel Station")
        price = float(st["price"])
        dist = st["distance_miles"]
        pc = esc(st.get("postcode") or "")
        lat = st.get("lat") or st.get("latitude", 0)
        lon = st.get("lon") or st.get("longitude", 0)
        maps_url = f"https://www.google.com/maps?q={lat},{lon}"

        if i == 0:
            # Highlighted cheapest card
            station_rows += f"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                   style="margin-bottom:10px;border-radius:14px;overflow:hidden;
                          border:2px solid #ff5c8a;background:#fff5f8;">
              <tr>
                <td style="padding:16px 18px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:10px;font-weight:800;color:#ff5c8a;
                                    letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">
                          ★ Cheapest
                        </div>
                        <div style="font-size:15px;font-weight:800;color:#1a0a2e;">{name}</div>
                        <div style="font-size:12px;color:#888;margin-top:3px;">
                          {pc} &nbsp;·&nbsp; {dist:.1f} miles
                        </div>
                        <div style="margin-top:10px;">
                          <a href="{maps_url}" style="font-size:12px;font-weight:700;
                                                       color:#ff5c8a;text-decoration:none;">
                            📍 Get Directions →
                          </a>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;padding-left:12px;">
                        <div style="font-size:32px;font-weight:900;color:#1a0a2e;
                                    letter-spacing:-1px;line-height:1;">
                          {price:.1f}p
                        </div>
                        <div style="font-size:11px;color:#aaa;text-align:right;margin-top:2px;">
                          per litre
                        </div>
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
                   style="margin-bottom:8px;border-radius:12px;border:1px solid #eee;background:#fafafa;">
              <tr>
                <td style="padding:14px 18px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <div style="font-size:14px;font-weight:700;color:#1a0a2e;">{name}</div>
                        <div style="font-size:12px;color:#999;margin-top:2px;">
                          {pc} &nbsp;·&nbsp; {dist:.1f} miles
                        </div>
                        <div style="margin-top:8px;">
                          <a href="{maps_url}" style="font-size:12px;font-weight:700;
                                                       color:#ff5c8a;text-decoration:none;">
                            📍 Get Directions →
                          </a>
                        </div>
                      </td>
                      <td align="right" style="vertical-align:middle;padding-left:12px;">
                        <div style="font-size:24px;font-weight:800;color:#444;letter-spacing:-0.5px;">
                          {price:.1f}p
                        </div>
                        <div style="font-size:11px;color:#bbb;text-align:right;">per litre</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            """

    # Share message
    share_msg = f"Found {esc(fuel_type)} at {cheapest_price:.1f}p/L near {postcode} 🚗 Check FuelAlerts: {site_url}"
    share_url = requests.utils.quote(site_url) if hasattr(requests, 'utils') else site_url
    share_text = requests.utils.quote(share_msg) if hasattr(requests, 'utils') else share_msg

    whatsapp_url = f"https://wa.me/?text={share_text}"
    facebook_url = f"https://www.facebook.com/sharer/sharer.php?u={share_url}&quote={share_text}"

    return f"""
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Fuel Alerts</title>
  </head>
  <body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f4f8;">
      <tr>
        <td align="center" style="padding:32px 16px 48px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

            <!-- HEADER -->
            <tr>
              <td style="border-radius:20px 20px 0 0;background:#1a0a2e;padding:32px 32px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="background:linear-gradient(135deg,#ff5c8a,#ff9b3e);border-radius:14px;
                                     width:44px;height:44px;text-align:center;vertical-align:middle;
                                     font-size:22px;line-height:44px;">⛽</td>
                          <td style="padding-left:14px;">
                            <div style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
                              Fuel<span style="color:#ff5c8a;">Alerts</span>
                            </div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;letter-spacing:0.8px;">
                              YOUR WEEKLY FUEL REPORT
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <div style="background:rgba(255,92,138,0.15);border:1px solid rgba(255,92,138,0.3);
                                  border-radius:999px;padding:5px 14px;font-size:11px;font-weight:700;
                                  color:#ff8ab5;letter-spacing:0.5px;display:inline-block;">
                        {esc(fuel_type)} &nbsp;·&nbsp; {postcode} &nbsp;·&nbsp; {radius} mi
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- Hero -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                  <tr>
                    <td style="background:linear-gradient(135deg,rgba(255,92,138,0.18),rgba(255,155,62,0.12));
                               border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:22px 24px;">
                      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.45);
                                  letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">
                        Cheapest nearby this week
                      </div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="vertical-align:middle;">
                            <div style="font-size:56px;font-weight:900;color:#ffffff;letter-spacing:-2px;line-height:1;">
                              {cheapest_price:.1f}<span style="font-size:22px;font-weight:600;
                                color:rgba(255,255,255,0.55);letter-spacing:0;">p/L</span>
                            </div>
                            <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:8px;font-weight:600;">
                              {esc(top_stations[0].get('trading_name') or top_stations[0].get('brand_name') or '') if top_stations else ''}
                            </div>
                            <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:3px;">
                              {esc(top_stations[0].get('postcode') or '') if top_stations else ''} &nbsp;·&nbsp;
                              {top_stations[0]['distance_miles']:.1f} miles away
                            </div>
                          </td>
                          <td align="right" style="vertical-align:middle;padding-left:16px;">
                            {change_badge}
                            {weeks_badge}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- SAVINGS STRIP -->
            {savings_strip}

            <!-- BODY -->
            <tr>
              <td style="background:#ffffff;padding:28px 32px;">

                <!-- TRENDS -->
                <div style="font-size:12px;font-weight:800;color:#1a0a2e;letter-spacing:0.8px;
                            text-transform:uppercase;margin-bottom:14px;">
                  📈 Price Trends
                </div>

                <!-- Stats row -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="8" style="margin-bottom:20px;">
                  <tr>
                    {area_avg_html}
                    {'<td width="4%"></td>' if area_avg_html else ''}
                    {vs_last_html}
                    {'<td width="4%"></td>' if vs_last_html else ''}
                    {weeks_html}
                  </tr>
                </table>

                <!-- 7-day chart -->
                {build_chart_html(price_history, fuel_type)}

                <!-- STATIONS -->
                <div style="font-size:12px;font-weight:800;color:#1a0a2e;letter-spacing:0.8px;
                            text-transform:uppercase;margin-bottom:14px;">
                  ⛽ Top {len(top_stations)} Stations Near You
                </div>

                {station_rows}

              </td>
            </tr>

            <!-- SHARE -->
            <tr>
              <td style="background:#f8f3ff;border-top:1px solid #ece4ff;padding:22px 32px;">
                <div style="font-size:12px;font-weight:800;color:#1a0a2e;letter-spacing:0.8px;
                            text-transform:uppercase;margin-bottom:14px;">
                  🔗 Share the savings
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-right:10px;">
                      <a href="{whatsapp_url}"
                         style="display:inline-block;background:#25D366;border-radius:10px;
                                padding:11px 20px;text-decoration:none;">
                        <table role="presentation" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="font-size:16px;line-height:1;">📱</td>
                            <td style="padding-left:8px;font-size:13px;font-weight:800;color:#ffffff;">
                              Share on WhatsApp
                            </td>
                          </tr>
                        </table>
                      </a>
                    </td>
                    <td>
                      <a href="{facebook_url}"
                         style="display:inline-block;background:#1877F2;border-radius:10px;
                                padding:11px 20px;text-decoration:none;">
                        <table role="presentation" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="font-size:16px;line-height:1;">👍</td>
                            <td style="padding-left:8px;font-size:13px;font-weight:800;color:#ffffff;">
                              Share on Facebook
                            </td>
                          </tr>
                        </table>
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="font-size:11px;color:#aaa;margin-top:10px;">
                  Share the cheapest price + link to FuelAlerts with friends nearby
                </div>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#1a0a2e;border-radius:0 0 20px 20px;padding:24px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.7;">
                        Prices from the UK Government Fuel Finder API.<br/>
                        Updated within 30 mins of any change.
                      </div>
                      <div style="margin-top:12px;">
                        <a href="{site_url}/preferences" style="font-size:12px;font-weight:700;
                                                                  color:#ff5c8a;text-decoration:none;">
                          Manage preferences
                        </a>
                        &nbsp;&nbsp;·&nbsp;&nbsp;
                        <a href="{unsub}" style="font-size:12px;color:rgba(255,255,255,0.3);text-decoration:none;">
                          Unsubscribe
                        </a>
                      </div>
                    </td>
                    <td align="right" style="vertical-align:bottom;">
                      <div style="font-size:22px;font-weight:900;color:rgba(255,255,255,0.06);letter-spacing:-1px;">
                        FuelAlerts
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    """

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

    sent_count = error_count = 0

    for sub in subscribers:
        try:
            sub_lat    = float(sub["lat"])
            sub_lon    = float(sub["lon"])
            radius     = int(sub["radius_miles"])
            fuel_type  = sub.get("fuel_type") or "E10"
            to_email   = sub["email"]

            # Find candidates within radius
            candidates = []
            for nid, st in stations.items():
                fp = price_index.get(nid, {}).get(fuel_type)
                if not fp:
                    continue
                dist = haversine_miles(sub_lat, sub_lon, st["lat"], st["lon"])
                if dist <= radius:
                    candidates.append({**st, **fp, "distance_miles": dist})

            candidates.sort(key=lambda x: (float(x["price"]), x["distance_miles"]))
            top = candidates[:5]

            if not top:
                print(f"No stations found for {to_email}, skipping...")
                continue

            cheapest_price = float(top[0]["price"])
            cheapest_node  = top[0]["node_id"]

            # Last send
            last = supabase_get_last_send(supabase_url, supabase_key, sub["id"], fuel_type)
            last_price = float(last["cheapest_price"]) if last and last.get("cheapest_price") else None

            # Weeks cheapest
            weeks_cheapest = supabase_get_weeks_cheapest(
                supabase_url, supabase_key, sub["id"], cheapest_node, fuel_type
            )

            # 7-day price history for cheapest station
            price_history = supabase_get_7day_prices(
                supabase_url, supabase_key, cheapest_node, fuel_type
            )

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
            subject = f"Fuel Alerts: cheapest {fuel_type} within {radius} miles of {sub.get('postcode','')}"
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
