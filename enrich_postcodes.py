"""
One-time postcode enrichment script.
Uses postcodes.io bulk API — only needs 'requests'.

Fields used:
  city   = ttwa (Travel to Work Area) — actual town name e.g. "Peterhead"
  county = admin_district (council area) e.g. "Aberdeenshire"
  country = country e.g. "Scotland"

Run:
  pip install requests
  $env:SUPABASE_URL="https://qwmdhhdxsxyfwyvvbzgg.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY="your-key"
  python enrich_postcodes.py
"""

import os
import re
import time
import requests

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

def normalise_pc(pc):
    if not pc:
        return None
    pc = re.sub(r'[^A-Z0-9]', '', str(pc).upper().strip())
    if len(pc) < 5:
        return None
    return pc[:-3] + ' ' + pc[-3:]

def chunk(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def fetch_all_stations():
    all_stations = []
    offset = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/pfs_stations",
            headers=HEADERS,
            params={'select': 'node_id,postcode', 'offset': offset, 'limit': 1000, 'order': 'node_id'},
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            break
        all_stations.extend(data)
        print(f'  Fetched {len(all_stations)}...')
        if len(data) < 1000:
            break
        offset += 1000
    return all_stations

def lookup_postcodes_batch(postcodes):
    try:
        r = requests.post(
            'https://api.postcodes.io/postcodes',
            json={'postcodes': postcodes},
            timeout=20,
        )
        if r.status_code != 200:
            return {}
        results = {}
        for item in r.json().get('result', []):
            if not item or not item.get('result'):
                continue
            res = item['result']
            pc = res.get('postcode', '')
            results[pc] = {
                'city': (res.get('ttwa') or '').strip().title(),
                'county': (res.get('admin_district') or '').strip().title(),
                'country': (res.get('country') or '').strip(),
            }
        return results
    except Exception as e:
        print(f'  Error: {e}')
        return {}

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
        return

    print('Fetching all stations...')
    stations = fetch_all_stations()
    print(f'Total: {len(stations)}')

    # Build postcode -> node_ids map
    pc_to_nodes = {}
    for s in stations:
        pc = normalise_pc(s.get('postcode', ''))
        if not pc:
            continue
        pc_to_nodes.setdefault(pc, []).append(s['node_id'])

    unique_pcs = list(pc_to_nodes.keys())
    print(f'Unique postcodes: {len(unique_pcs)}')

    # Bulk lookup
    all_results = {}
    batches = list(chunk(unique_pcs, 100))
    for i, batch in enumerate(batches):
        print(f'  postcodes.io batch {i+1}/{len(batches)}...')
        all_results.update(lookup_postcodes_batch(batch))
        if i < len(batches) - 1:
            time.sleep(0.25)

    print(f'Got results for {len(all_results)} postcodes')

    # Build updates
    updates = []
    for pc, node_ids in pc_to_nodes.items():
        if pc not in all_results:
            continue
        d = all_results[pc]
        for node_id in node_ids:
            updates.append({
                'node_id': node_id,
                'city': d['city'] or None,
                'county': d['county'] or None,
                'country': d['country'] or None,
            })

    print(f'Updating {len(updates)} stations...')
    total = 0
    for i, batch in enumerate(chunk(updates, 200)):
        url = f"{SUPABASE_URL}/rest/v1/pfs_stations?on_conflict=node_id"
        r = requests.post(url, headers=HEADERS, json=batch)
        if r.status_code not in (200, 201, 204):
            print(f'  Batch {i+1} error: {r.status_code} {r.text[:100]}')
        else:
            total += len(batch)
            print(f'  Updated {total}/{len(updates)}')
        time.sleep(0.05)

    print(f'\nDone! {total} stations updated.')
    print('\nVerify:')
    print("SELECT city, county, COUNT(*) FROM pfs_stations GROUP BY city, county ORDER BY COUNT(*) DESC LIMIT 20;")

if __name__ == '__main__':
    main()
