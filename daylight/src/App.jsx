import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const RHNA_NONCOMPLIANT = [
  "LOS ANGELES", "LONG BEACH", "PASADENA", "SANTA MONICA", "GLENDALE",
  "BURBANK", "INGLEWOOD", "CULVER CITY", "HAWTHORNE", "TORRANCE",
  "POMONA", "LANCASTER", "PALMDALE", "COMPTON", "SOUTH GATE",
  "NORTH HOLLYWOOD", "VAN NUYS", "TARZANA"
];

function scoreParcel(p, weights) {
  const currentYear = 2026;
  let score = 0;
  let signals = [];

  const totalValue = p.Roll_LandValue + p.Roll_ImpValue;
  const landRatio = totalValue > 0 ? p.Roll_LandValue / totalValue : 0;
  score += Math.min(landRatio * 100, 100) * (weights.landRatio / 100);
  if (landRatio > 0.80) signals.push({ label: "High land ratio", value: `${(landRatio * 100).toFixed(0)}%`, positive: true });

  const yearsSinceSale = p.LastSaleDate ? currentYear - parseInt(p.LastSaleDate) : 20;
  score += Math.min(yearsSinceSale / 30 * 100, 100) * (weights.holdPeriod / 100);
  if (yearsSinceSale > 15) signals.push({ label: "Long hold", value: `${yearsSinceSale}yr`, positive: true });

  const isAbsentee = p.OwnerMailState && p.OwnerMailState !== "CA";
  score += isAbsentee ? 100 * (weights.absentee / 100) : 0;
  if (isAbsentee) signals.push({ label: "Out-of-state owner", value: p.OwnerMailState, positive: true });

  const buildingAge = p.YearBuilt1 ? currentYear - parseInt(p.YearBuilt1) : 40;
  score += Math.min(buildingAge / 70 * 100, 100) * (weights.buildingAge / 100);
  if (buildingAge > 45) signals.push({ label: "Aging structure", value: `Built ${p.YearBuilt1}`, positive: true });

  const isRHNA = RHNA_NONCOMPLIANT.includes(p.SitusCity?.toUpperCase()) || RHNA_NONCOMPLIANT.includes(p.TaxRateCity?.toUpperCase());
  score += isRHNA ? 100 * (weights.rhna / 100) : 0;
  if (isRHNA) signals.push({ label: "RHNA non-compliant", value: "Builder's Remedy eligible", positive: true });

  score += Math.min(p.Roll_LandValue / 15000000 * 100, 100) * (weights.landValue / 100);

  const maxPossible = weights.landRatio + weights.holdPeriod + weights.absentee + weights.buildingAge + weights.rhna + weights.landValue;
  const normalized = maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0;

  return { score: normalized, signals };
}

const USE_CODE_MAP = {
  "2100": "Retail / Strip Mall",
  "2200": "Office / Commercial",
  "2400": "Mixed Commercial",
  "2600": "Parking / Auto Services",
};

export default function App() {
  const [parcels, setParcels] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("map");
  const [filters, setFilters] = useState({
    minLandRatio: 0,
    city: "ALL",
    useCode: "ALL",
    minScore: 0,
  });
  const [weights, setWeights] = useState({
    landRatio: 30,
    holdPeriod: 20,
    absentee: 15,
    buildingAge: 15,
    rhna: 15,
    landValue: 5,
  });
  const [showWeights, setShowWeights] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    fetch("/parcels.json")
      .then(r => r.json())
      .then(data => setParcels(data));
  }, []);

  const scoredParcels = useMemo(() => {
    return parcels.map(p => {
      const { score, signals } = scoreParcel(p, weights);
      const totalValue = p.Roll_LandValue + p.Roll_ImpValue;
      const landRatio = totalValue > 0 ? p.Roll_LandValue / totalValue : 0;
      return { ...p, score, signals, landRatio };
    });
  }, [parcels, weights]);

  const cities = useMemo(() => [...new Set(parcels.map(p => p.SitusCity))].sort(), [parcels]);

  const filteredParcels = useMemo(() => {
    return scoredParcels
      .filter(p => p.landRatio >= filters.minLandRatio / 100)
      .filter(p => filters.city === "ALL" || p.SitusCity === filters.city)
      .filter(p => filters.useCode === "ALL" || p.UseCode === filters.useCode)
      .filter(p => p.score >= filters.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2000);
  }, [scoredParcels, filters]);

  const getColor = (score) => {
    if (score >= 80) return "#16a34a";
    if (score >= 60) return "#ca8a04";
    if (score >= 40) return "#ea580c";
    return "#94a3b8";
  };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapboxgl.accessToken = "pk.eyJ1IjoidGFuaXNoYXIiLCJhIjoiY21vMzJpaWFjMTBiMzJwcTR6cmVqdzFnZCJ9.qWdlXx_F-aii4F31TGqyjw";

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-118.35, 34.05],
      zoom: 9.5,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapInstance.current = map;
    map.on("load", () => updateMarkers());
  }, []);

  const updateMarkers = useCallback(() => {
    if (!mapInstance.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    filteredParcels.forEach(p => {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${getColor(p.score)};border:2px solid rgba(255,255,255,0.6);cursor:pointer;transition:transform 0.15s;`;
      el.onclick = () => setSelected(p);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([p.center_lon, p.center_lat])
        .addTo(mapInstance.current);
      markersRef.current.push(marker);
    });
  }, [filteredParcels]);

  useEffect(() => { updateMarkers(); }, [updateMarkers]);

  useEffect(() => {
    if (selected && mapInstance.current) {
      mapInstance.current.flyTo({ center: [selected.center_lon, selected.center_lat], zoom: 14, duration: 800 });
    }
  }, [selected]);

  const exportCSV = () => {
    const headers = ["APN", "Score", "Address", "City", "UseType", "LandValue", "ImpValue", "LandRatio", "Owner", "OwnerState", "LastSale", "RHNA"];
    const rows = filteredParcels.map(p => [
      p.APN, p.score, p.SitusFullAddress, p.SitusCity, USE_CODE_MAP[p.UseCode] || p.UseCode,
      p.Roll_LandValue, p.Roll_ImpValue, (p.landRatio * 100).toFixed(1) + "%",
      p.OwnerName, p.OwnerMailState, p.LastSaleDate,
      RHNA_NONCOMPLIANT.includes(p.SitusCity?.toUpperCase()) ? "Yes" : "No"
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daylight_leads.csv";
    a.click();
    setShowExport(true);
    setTimeout(() => setShowExport(false), 2000);
  };

  const fmt = (n) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'SF Mono', monospace",
      background: "#0a0a0a", color: "#e5e5e5", height: "100vh", display: "flex", flexDirection: "column",
      fontSize: "12px", overflow: "hidden"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />

      <div style={{ borderBottom: "1px solid #222", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontWeight: 600, fontSize: "15px", letterSpacing: "3px", color: "#f5c542" }}>DAYLIGHT</span>
          <span style={{ color: "#555", fontSize: "10px" }}> · LA COUNTY</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: "#666", marginRight: "8px" }}>{filteredParcels.length} parcels</span>
          <button onClick={() => setView("map")} style={tabStyle(view === "map")}>MAP</button>
          <button onClick={() => setView("list")} style={tabStyle(view === "list")}>LIST</button>
          <button onClick={() => setShowWeights(!showWeights)} style={{ ...btnStyle, background: showWeights ? "#2a2a2a" : "transparent" }}>WEIGHTS</button>
          <button onClick={exportCSV} style={{ ...btnStyle, background: "#f5c542", color: "#0a0a0a", fontWeight: 600 }}>
            {showExport ? "✓ EXPORTED" : "EXPORT CSV"}
          </button>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "8px 16px", display: "flex", gap: "16px", alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        <FilterSelect label="City" value={filters.city} onChange={v => setFilters(f => ({ ...f, city: v }))}>
          <option value="ALL">All Cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </FilterSelect>
        <FilterSelect label="Use" value={filters.useCode} onChange={v => setFilters(f => ({ ...f, useCode: v }))}>
          <option value="ALL">All Types</option>
          <option value="2100">Retail / Strip Mall</option>
          <option value="2200">Office / Commercial</option>
          <option value="2400">Mixed Commercial</option>
          <option value="2600">Parking / Auto</option>
        </FilterSelect>
        <FilterSlider label="Min Score" value={filters.minScore} onChange={v => setFilters(f => ({ ...f, minScore: v }))} max={100} />
        <FilterSlider label="Min Land %" value={filters.minLandRatio} onChange={v => setFilters(f => ({ ...f, minLandRatio: v }))} max={100} />
      </div>

      {showWeights && (
        <div style={{ borderBottom: "1px solid #1a1a1a", padding: "10px 16px", background: "#111", display: "flex", gap: "20px", flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ fontSize: "10px", color: "#f5c542", fontWeight: 600, alignSelf: "center" }}>SCORING WEIGHTS</span>
          <WeightSlider label="Land Ratio" value={weights.landRatio} onChange={v => setWeights(w => ({ ...w, landRatio: v }))} />
          <WeightSlider label="Hold Period" value={weights.holdPeriod} onChange={v => setWeights(w => ({ ...w, holdPeriod: v }))} />
          <WeightSlider label="Absentee" value={weights.absentee} onChange={v => setWeights(w => ({ ...w, absentee: v }))} />
          <WeightSlider label="Bldg Age" value={weights.buildingAge} onChange={v => setWeights(w => ({ ...w, buildingAge: v }))} />
          <WeightSlider label="RHNA" value={weights.rhna} onChange={v => setWeights(w => ({ ...w, rhna: v }))} />
          <WeightSlider label="Land Value" value={weights.landValue} onChange={v => setWeights(w => ({ ...w, landValue: v }))} />
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, position: "relative" }}>
          {view === "map" ? (
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          ) : (
            <div style={{ overflow: "auto", height: "100%", padding: "0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#111", position: "sticky", top: 0 }}>
                    {["Score", "Address", "City", "Type", "Land", "Imp", "Ratio", "Owner", "State", "Sale"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: "9px", color: "#666", fontWeight: 500, textTransform: "uppercase", letterSpacing: "1px", borderBottom: "1px solid #222" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParcels.map(p => (
                    <tr key={p.APN} onClick={() => { setSelected(p); setView("map"); }} style={{ cursor: "pointer", borderBottom: "1px solid #151515" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#151515"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ display: "inline-block", width: "28px", textAlign: "center", padding: "2px 0", borderRadius: "3px", fontWeight: 600, fontSize: "11px", color: "#0a0a0a", background: getColor(p.score) }}>{p.score}</span>
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "11px" }}>{p.SitusFullAddress}</td>
                      <td style={{ padding: "8px 10px", color: "#888" }}>{p.SitusCity}</td>
                      <td style={{ padding: "8px 10px", color: "#888" }}>{USE_CODE_MAP[p.UseCode]?.split("/")[0] || p.UseCode}</td>
                      <td style={{ padding: "8px 10px", color: "#7dd3fc" }}>{fmt(p.Roll_LandValue)}</td>
                      <td style={{ padding: "8px 10px", color: "#888" }}>{fmt(p.Roll_ImpValue)}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 500, color: p.landRatio > 0.8 ? "#16a34a" : "#888" }}>{(p.landRatio * 100).toFixed(0)}%</td>
                      <td style={{ padding: "8px 10px", fontSize: "10px", color: "#aaa" }}>{p.OwnerName}</td>
                      <td style={{ padding: "8px 10px", color: p.OwnerMailState !== "CA" ? "#f5c542" : "#555" }}>{p.OwnerMailState}</td>
                      <td style={{ padding: "8px 10px", color: "#555" }}>{p.LastSaleDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === "map" && (
            <div style={{ position: "absolute", bottom: "20px", left: "16px", background: "rgba(10,10,10,0.85)", border: "1px solid #333", padding: "8px 12px", borderRadius: "4px", display: "flex", gap: "12px", fontSize: "10px" }}>
              {[["80+", "#16a34a"], ["60-79", "#ca8a04"], ["40-59", "#ea580c"], ["<40", "#94a3b8"]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: c }} />
                  <span style={{ color: "#999" }}>{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ width: "340px", borderLeft: "1px solid #222", overflow: "auto", background: "#0f0f0f", flexShrink: 0 }}>
            <div style={{ padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px", lineHeight: 1.3 }}>{selected.SitusFullAddress}</div>
                  <div style={{ fontSize: "11px", color: "#888" }}>{selected.SitusCity}, CA {selected.SitusZIP}</div>
                  <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>APN {selected.APN}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                  <div style={{ fontSize: "24px", fontWeight: 600, color: getColor(selected.score), lineHeight: 1 }}>{selected.score}</div>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "10px" }}>✕ close</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "16px" }}>
                {selected.signals.map((s, i) => (
                  <span key={i} style={{ fontSize: "9px", padding: "3px 7px", borderRadius: "3px", background: s.positive ? "rgba(22,163,74,0.15)" : "rgba(234,88,12,0.15)", color: s.positive ? "#4ade80" : "#fb923c", border: `1px solid ${s.positive ? "rgba(22,163,74,0.25)" : "rgba(234,88,12,0.25)"}` }}>
                    {s.label}: {s.value}
                  </span>
                ))}
              </div>

              <Section title="VALUATION">
                <Row label="Land Value" value={fmt(selected.Roll_LandValue)} highlight />
                <Row label="Improvement Value" value={fmt(selected.Roll_ImpValue)} />
                <Row label="Total Assessed" value={fmt(selected.Roll_LandValue + selected.Roll_ImpValue)} />
                <Row label="Land / Total Ratio" value={`${(selected.landRatio * 100).toFixed(1)}%`} highlight={selected.landRatio > 0.8} />
              </Section>

              <Section title="PROPERTY">
                <Row label="Use Code" value={`${selected.UseCode} — ${USE_CODE_MAP[selected.UseCode] || "Commercial"}`} />
                <Row label="Year Built" value={selected.YearBuilt1 || "Unknown"} />
                <Row label="Tax Rate City" value={selected.TaxRateCity} />
              </Section>

              <Section title="OWNERSHIP">
                <Row label="Owner" value={selected.OwnerName} />
                <Row label="Mail City" value={selected.OwnerMailCity} />
                <Row label="Mail State" value={selected.OwnerMailState || "CA"} highlight={selected.OwnerMailState !== "CA"} />
                <Row label="Last Sale" value={selected.LastSaleDate || "Unknown"} />
              </Section>

              <Section title="ELIGIBILITY">
                <Row label="AB 2011 / AB 2243" value="Commercial → Residential ✓" highlight />
                <Row label="SB 423 Streamline" value="Ministerial if ≥10% affordable" />
                <Row label="RHNA Status" value={
                  RHNA_NONCOMPLIANT.includes(selected.SitusCity?.toUpperCase()) ?
                    "Non-compliant — Builder's Remedy ✓" : "Compliant"
                } highlight={RHNA_NONCOMPLIANT.includes(selected.SitusCity?.toUpperCase())} />
                <Row label="Density Bonus" value="20-50% above base zoning" />
              </Section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>{children}</select>
    </div>
  );
}

function FilterSlider({ label, value, onChange, max }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
      <input type="range" min={0} max={max} value={value} onChange={e => onChange(+e.target.value)}
        style={{ width: "80px", accentColor: "#f5c542" }} />
      <span style={{ fontSize: "10px", color: "#f5c542", width: "28px" }}>{value}</span>
    </div>
  );
}

function WeightSlider({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "9px", color: "#aaa", width: "70px" }}>{label}</span>
      <input type="range" min={0} max={50} value={value} onChange={e => onChange(+e.target.value)}
        style={{ width: "60px", accentColor: "#f5c542" }} />
      <span style={{ fontSize: "10px", color: "#f5c542", width: "20px" }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontSize: "9px", color: "#f5c542", fontWeight: 600, letterSpacing: "2px", marginBottom: "6px", paddingBottom: "4px", borderBottom: "1px solid #222" }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "11px" }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ color: highlight ? "#4ade80" : "#ccc", fontWeight: highlight ? 500 : 400 }}>{value}</span>
    </div>
  );
}

const btnStyle = {
  border: "1px solid #333", padding: "4px 10px", fontSize: "9px", cursor: "pointer",
  color: "#ccc", background: "transparent", fontFamily: "inherit", letterSpacing: "1px",
};

const tabStyle = (active) => ({
  ...btnStyle,
  background: active ? "#f5c542" : "transparent",
  color: active ? "#0a0a0a" : "#666",
  fontWeight: active ? 600 : 400,
});

const selectStyle = {
  background: "#151515", border: "1px solid #333", color: "#ccc", padding: "4px 8px",
  fontSize: "11px", fontFamily: "inherit",
};
