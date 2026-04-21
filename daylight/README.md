# Daylight

California re-entitlement site selection tool for LA County. Ingests public assessor data, scores commercial parcels by acquisition opportunity, and visualizes results on an interactive map.

## What it does

Pulls commercial parcel data from the LA County ArcGIS FeatureServer and scores each parcel across six signals: land/improvement ratio, hold period, absentee ownership, building age, RHNA non-compliance, and land value. Results are displayed on a Mapbox map with filtering, a detail panel showing valuation and eligibility flags, and CSV export.

Reduces 10,000+ LA County commercial parcels to the top leads eligible for residential conversion under AB 2011, SB 423, and Builder's Remedy.

## Stack

- React 18 + Vite
- Mapbox GL JS
- Python (data pipeline)
- LA County ArcGIS FeatureServer (public)


## Data pipeline

Run `fetch_parcels.py` to pull fresh data from the LA County ArcGIS API
