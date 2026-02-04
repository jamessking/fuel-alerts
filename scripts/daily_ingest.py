import os
import requests
from datetime import date
from typing import Dict, List

# -----------------------------
# ENV
# -----------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FUEL_CLIENT_ID = os.getenv("FUEL_CLIENT_ID")
FUEL_CLIENT_SECRET = os.getenv("FUEL_CLIENT_SECRET")

TOKEN_URL = "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token"
PFS_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs"
PRICES_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices"

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# -----------------------------
# AUTH
# -----------------------------
def get_access_token() -> str:
    r = requests.post(
        TOKEN_URL,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "FuelAlerts/1.0 (contact: jamessking76@gmail.com)",
            "Accept": "application/json",
        },
        data={
            "grant_type": "client_credentials",
            "client_id": FUEL_CLIENT_ID,
            "client_secret": FUEL_CLIENT_SECRET,
            "scope": "fuelfinder.read",
        },
        timeout=30,
    )

    r.raise_for_status()
    j = r.json()

    if not j.get("success") or "data" not in j or "access_token" not in j["data"]:
        raise RuntimeError(f"Unexpected token response: {j}")

    return j["data"]["access_token"]


# -----------------------------
# FETCH ALL BATCHES
# -----------------------------
def fetch_all(endpoint: str, token: str) -> List[dict]:
    all_items = []
    batch = 1

    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "FuelAlerts/1.0 (contact: jamessking76@gmail.com)",
        "Accept": "application/json",
    }

    while True:
        url = f"{endpoint}?batch-number={batch}"
        r = requests.get(url, headers=headers, timeout=60)

        if r.status_code == 400:
            break  # no more batches

        r.raise_for_status()
        data = r.json()

        if not data:
            break

        all_items.extend(data)
        batch += 1

    return all_items


# -----------------------------
# UPSERT STATIONS
# -----------------------------
def upsert_stations(stations: List[dict]):
    rows = []
    for s in stations:
        loc = s.get("location") or {}
        rows.append({
            "node_id": s["node_id"],
            "trading_name": s.get("trading_name"),
            "brand_name": s.get("brand_name"),
            "organisation": s.get("mft_organisation_name"),
            "postcode": loc.get("postcode"),
            "city": loc.get("city"),
            "county": loc.get("county"),
            "country": loc.get("country"),
            "latitude": float(loc["latitude"]) if loc.get("latitude") else None,
            "longitude": float(loc["longitude"]) if loc.get("longitude") else None,
            "is_motorway_service_station": s.get("is_motorway_service_station"),
            "is_supermarket_service_station": s.get("is_supermarket_service_station"),
            "temporary_closure": s.get("temporary_closure"),
            "permanent_closure": s.get("permanent_closure"),
            "amenities": s.get("amenities"),
            "opening_times": s.get("opening_times"),
        })

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/pfs_stations?on_conflict=node_id",
        headers=HEADERS_SUPABASE,
        json=rows,
        timeout=60,
    )
    if r.status_code == 403:
    print("403 headers:", r.headers)
    print("403 body:", r.text)
    r.raise_for_status()

# -----------------------------
# INSERT DAILY PRICES
# -----------------------------
def insert_prices(prices: List[dict]):
    today = date.today().isoformat()
    rows = []

    for rec in prices:
        node = rec.get("node_id")
        for fp in rec.get("fuel_prices", []):
            rows.append({
                "snapshot_date": today,
                "node_id": node,
                "fuel_type": fp.get("fuel_type"),
                "price": fp.get("price"),
                "price_last_updated": fp.get("price_last_updated"),
            })

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/fuel_prices_daily",
        headers=HEADERS_SUPABASE,
        json=rows,
        timeout=60,
    )
    r.raise_for_status()

# -----------------------------
# MAIN
# -----------------------------
def main():
    print("Authenticating…")
    token = get_access_token()

    print("Fetching all stations…")
    stations = fetch_all(PFS_URL, token)
    print(f"Stations: {len(stations)}")

    print("Fetching all prices…")
    prices = fetch_all(PRICES_URL, token)
    print(f"Price records: {len(prices)}")

    print("Upserting stations…")
    upsert_stations(stations)

    print("Inserting daily prices…")
    insert_prices(prices)

    print("Daily ingest complete.")

if __name__ == "__main__":
    main()

