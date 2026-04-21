import pandas as pd
import json
import sys
import os

COLUMN_MAPS = {
    "APN": ["AIN", "APN", "ain", "apn", "AssessorParcelNumber"],
    "UseCode": ["UseCode", "usecode", "UseCode_2", "GeneralUseType", "SpecificUseType", "use_code"],
    "UseType": ["UseType", "usetype", "use_type", "GeneralUseDescription"],
    "Roll_LandValue": ["Roll_LandValue", "roll_landvalue", "LandValue", "Roll_LandBaseValue", "LandBaseValue", "netlandvalue"],
    "Roll_ImpValue": ["Roll_ImpValue", "roll_impvalue", "ImpValue", "Roll_ImpBaseValue", "ImpBaseValue", "netimpvalue"],
    "SitusFullAddress": ["SitusFullAddress", "situsfulladdress", "SitusAddress", "PropertyLocation"],
    "SitusCity": ["SitusCity", "situscity", "SitusCityState"],
    "SitusZIP": ["SitusZIP", "situszip"],
    "TaxRateCity": ["TaxRateCity", "taxratecity", "TaxRateArea"],
    "YearBuilt1": ["YearBuilt1", "yearbuilt1", "YearBuilt", "EffectiveYearBuilt"],
    "center_lat": ["center_lat", "CENTER_LAT", "Latitude", "lat", "LAT"],
    "center_lon": ["center_lon", "CENTER_LON", "Longitude", "lon", "LONG", "LON"],
    "RollYear": ["RollYear", "rollyear", "Roll_Year", "TaxYear"],
}


def is_commercial(code):
    code = str(code).strip()
    return len(code) == 4 and code.startswith("2")


def find_column(df, target):
    candidates = COLUMN_MAPS.get(target, [target])
    for c in candidates:
        if c in df.columns:
            return c
    lower_map = {col.lower(): col for col in df.columns}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python process_csv.py <path_to_csv>")
        sys.exit(1)

    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        sys.exit(1)

    print(f"Loading {csv_path}...")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(df)} rows, {len(df.columns)} columns")

    col_map = {}
    for target in COLUMN_MAPS:
        actual = find_column(df, target)
        if actual:
            col_map[target] = actual

    roll_col = col_map.get("RollYear")
    if roll_col:
        latest_year = df[roll_col].max()
        df = df[df[roll_col] == latest_year]
        print(f"  Filtered to roll year {latest_year}: {len(df)} rows")

    use_col = col_map.get("UseCode")
    use_type_col = col_map.get("UseType")

    if use_col:
        df["_use_str"] = df[use_col].astype(str).str.strip()
        commercial = df[df["_use_str"].apply(is_commercial)]
    elif use_type_col:
        commercial = df[df[use_type_col].str.contains("Commercial", case=False, na=False)]
    else:
        print("Cannot find use code or use type column.")
        sys.exit(1)

    print(f"  Commercial parcels: {len(commercial)}")

    land_col = col_map.get("Roll_LandValue")
    if land_col:
        commercial = commercial[pd.to_numeric(commercial[land_col], errors="coerce") > 0]

    lat_col = col_map.get("center_lat")
    lon_col = col_map.get("center_lon")
    if lat_col and lon_col:
        commercial = commercial[
            pd.to_numeric(commercial[lat_col], errors="coerce").notna() &
            pd.to_numeric(commercial[lon_col], errors="coerce").notna()
        ]

    print(f"  With coordinates and land value: {len(commercial)}")

    parcels = []
    for _, row in commercial.iterrows():
        def get(target, default=""):
            c = col_map.get(target)
            if c and c in row.index:
                val = row[c]
                return default if pd.isna(val) else val
            return default

        land = float(get("Roll_LandValue", 0) or 0)
        imp = float(get("Roll_ImpValue", 0) or 0)

        parcels.append({
            "APN": str(get("APN")),
            "UseType": str(get("UseType", "Commercial")),
            "UseCode": str(get("UseCode")),
            "TaxRateCity": str(get("TaxRateCity")),
            "Roll_LandValue": int(land),
            "Roll_ImpValue": int(imp),
            "SitusFullAddress": str(get("SitusFullAddress")),
            "SitusCity": str(get("SitusCity")),
            "SitusZIP": str(get("SitusZIP")),
            "YearBuilt1": str(get("YearBuilt1")),
            "center_lat": float(get("center_lat", 0) or 0),
            "center_lon": float(get("center_lon", 0) or 0),
            "OwnerName": "",
            "OwnerMailCity": "",
            "OwnerMailState": "",
            "LastSaleDate": "",
        })

    parcels.sort(key=lambda p: p["Roll_LandValue"], reverse=True)

    if len(parcels) > 5000:
        parcels = parcels[:5000]

    with open("public/parcels.json", "w") as f:
        json.dump(parcels, f, indent=2)

    print(f"\nWrote {len(parcels)} parcels to public/parcels.json")


if __name__ == "__main__":
    main()
