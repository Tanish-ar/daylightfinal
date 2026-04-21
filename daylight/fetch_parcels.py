import requests
import json
import time

BASE_URL = "https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/LA_County_Parcels/FeatureServer/0/query"
OUT_FIELDS = "APN,AIN,UseType,UseCode,UseDescription,TaxRateCity,Roll_LandValue,Roll_ImpValue,Roll_Year,SitusFullAddress,SitusCity,SitusZIP,YearBuilt1,SQFTmain1,CENTER_LAT,CENTER_LON"
BATCH_SIZE = 2000
MAX_RECORDS = 10000


def fetch_batch(offset=0):
    params = {
        "where": "UseType='Commercial'",
        "outFields": OUT_FIELDS,
        "returnGeometry": "false",
        "resultRecordCount": BATCH_SIZE,
        "resultOffset": offset,
        "orderByFields": "Roll_LandValue DESC",
        "f": "json",
    }
    resp = requests.get(BASE_URL, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        print(f"  API error: {data['error']}")
        return [], False

    features = data.get("features", [])
    has_more = data.get("exceededTransferLimit", False)
    return [f["attributes"] for f in features], has_more


def enrich(p):
    return {
        "APN": p.get("APN", ""),
        "AIN": p.get("AIN", ""),
        "UseType": p.get("UseType", ""),
        "UseCode": str(p.get("UseCode", "")),
        "UseDescription": p.get("UseDescription", ""),
        "TaxRateCity": p.get("TaxRateCity", ""),
        "Roll_LandValue": p.get("Roll_LandValue") or 0,
        "Roll_ImpValue": p.get("Roll_ImpValue") or 0,
        "SitusFullAddress": p.get("SitusFullAddress", ""),
        "SitusCity": p.get("SitusCity", ""),
        "SitusZIP": p.get("SitusZIP", ""),
        "YearBuilt1": str(p.get("YearBuilt1") or ""),
        "SQFTmain1": p.get("SQFTmain1") or 0,
        "center_lat": p.get("CENTER_LAT"),
        "center_lon": p.get("CENTER_LON"),
        "OwnerName": "",
        "OwnerMailCity": "",
        "OwnerMailState": "",
        "LastSaleDate": "",
    }


def main():
    all_parcels = []
    offset = 0

    while offset < MAX_RECORDS:
        print(f"  Fetching batch at offset {offset}...")
        batch, has_more = fetch_batch(offset)

        if not batch:
            break

        valid = [p for p in batch if p.get("CENTER_LAT") and p.get("Roll_LandValue")]
        all_parcels.extend(valid)
        print(f"  Got {len(batch)} records ({len(valid)} valid) — total: {len(all_parcels)}")

        if not has_more:
            break

        offset += BATCH_SIZE
        time.sleep(0.5)

    enriched = [enrich(p) for p in all_parcels]
    enriched.sort(key=lambda p: p["Roll_LandValue"], reverse=True)

    with open("public/parcels.json", "w") as f:
        json.dump(enriched, f, indent=2)

    print(f"\nWrote {len(enriched)} parcels to public/parcels.json")
    if enriched:
        print(f"Top parcel: {enriched[0]['SitusFullAddress']} — ${enriched[0]['Roll_LandValue']:,.0f}")


if __name__ == "__main__":
    main()
