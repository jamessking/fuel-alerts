import os
import csv
import requests

# =========================
# CONFIG
# =========================

FUEL_TOKEN_URL = "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token"
PFS_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs"
PRICES_URL = "https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices"

CLIENT_ID = os.getenv("FUEL_CLIENT_ID")
CLIENT_SECRET = os.getenv("FUEL_CLIENT_SECRET")

OUT_FILE = "fuel_finder_full_dump.csv"

# =========================
# AUTH
# =========================

def get_access_token():
    r = requests.post(
        FUEL_TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "scope": "fuelfinder.read",
        },
        timeout=30,
    )
    r.raise_for_status()

    j = r.json()

    # Handle wrapped response
    if "access_token" in j:
        return j["access_token"]

    if "data" in j and "access_token" in j["data"]:
        return j["data"]["access_token"]

    # If we get here, print for debugging
    raise RuntimeError(f"No access_token in response: {j}")


# =========================
# BATCH FETCHING
# =========================

def fetch_all(url, token):
    batch = 1
    all_items = []

    while True:
        r = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
            params={"batch-number": batch},
            timeout=30,
        )

        # End-of-data quirk
        if r.status_code == 400:
            break

        r.raise_for_status()
        data = r.json()

        if isinstance(data, dict):
            items = data.get("data", [])
        else:
            items = data

        if not items:
            break

        print(f"Fetched {len(items)} records from batch {batch}")
        all_items.extend(items)
        batch += 1

    return all_items

# =========================
# MAIN
# =========================

def main():
    print("Authenticating…")
    token = get_access_token()

    print("Fetching ALL PFS records…")
    pfs = fetch_all(PFS_URL, token)
    print(f"Total PFS records: {len(pfs)}")

    print("Fetching ALL fuel price records…")
    prices = fetch_all(PRICES_URL, token)
    print(f"Total price records: {len(prices)}")

 # Index prices by node_id + fuel_type
    price_index = {}
    fuel_types = set()

    for p in prices:
        node = p.get("node_id")
        if not node:
            continue

        # Shape 1: station-level prices: { node_id, fuel_prices: [ {fuel_type, price, ...}, ... ] }
        if "fuel_prices" in p and isinstance(p["fuel_prices"], list):
            for fp in p["fuel_prices"]:
                fuel = fp.get("fuel_type")
                if not fuel:
                    continue
                fuel_types.add(fuel)
                price_index.setdefault(node, {})[fuel] = fp

        # Shape 2: flat prices: { node_id, fuel_type, price, ... }
        elif "fuel_type" in p:
            fuel = p.get("fuel_type")
            if not fuel:
                continue
            fuel_types.add(fuel)
            price_index.setdefault(node, {})[fuel] = p

        else:
            # Unknown shape — ignore, but you could print once if you want
            continue

    fuel_types = sorted(fuel_types)


    # Build rows
    rows = []
    for st in pfs:
        node = st["node_id"]
        prices_for_node = price_index.get(node, {})

        row = {
            "node_id": node,
            "trading_name": st.get("trading_name"),
            "brand_name": st.get("brand_name"),
            "organisation": st.get("mft_organisation_name"),
            "postcode": st.get("location", {}).get("postcode"),
            "city": st.get("location", {}).get("city"),
            "county": st.get("location", {}).get("county"),
            "country": st.get("location", {}).get("country"),
            "latitude": st.get("location", {}).get("latitude"),
            "longitude": st.get("location", {}).get("longitude"),
            "is_motorway_service_station": st.get("is_motorway_service_station"),
            "is_supermarket_service_station": st.get("is_supermarket_service_station"),
            "temporary_closure": st.get("temporary_closure"),
            "permanent_closure": st.get("permanent_closure"),
        }

        for fuel in fuel_types:
            p = prices_for_node.get(fuel)
            row[f"{fuel}_price"] = p.get("price") if p else None
            row[f"{fuel}_updated"] = p.get("price_last_updated") if p else None

        rows.append(row)

    # Write CSV
    print(f"Writing CSV: {OUT_FILE}")
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done. Wrote {len(rows)} rows to {OUT_FILE}")

if __name__ == "__main__":
    main()
