import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const RISK_COLORS = { high: "#fb7185", medium: "#fbbf24", low: "#34d399" };
const SAFE_COLOR = "#2dd4bf";

// riskData: /api/risk response (GeoJSON FeatureCollection of assets with risk)
// floodZones: /api/flood-zones response (GeoJSON FeatureCollection, one polygon layer)
// safeSites: /api/safe-sites response (GeoJSON FeatureCollection of points)
export default function AssetMap({ riskData, floodZones, safeSites, layerKey, onSelect }) {
  const assets = riskData?.features || [];
  const sites = safeSites?.features || [];

  return (
    <>
      <div className="map-container">
        <MapContainer center={[13.05, 80.24]} zoom={11} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {floodZones?.features?.length > 0 && (
            <GeoJSON
              key={layerKey}
              data={floodZones}
              style={{ color: "#38bdf8", weight: 1, fillColor: "#38bdf8", fillOpacity: 0.35 }}
            />
          )}

          {sites.map((f) => {
            const [lng, lat] = f.geometry.coordinates;
            const p = f.properties;
            return (
              <CircleMarker
                key={`safe-${p.rank}`}
                center={[lat, lng]}
                radius={7}
                pathOptions={{ color: SAFE_COLOR, fillColor: SAFE_COLOR, fillOpacity: 0.35, weight: 2, dashArray: "3" }}
              >
                <Popup>
                  <strong>Safe site #{p.rank} for solar + battery</strong>
                  <br />Ground: {p.ground_elev_m} m · {p.margin_2100_m} m above worst-case 2100 water
                  <br />{p.dist_coast_km} km from coast · {p.nearest_substation_km} km to nearest substation
                </Popup>
              </CircleMarker>
            );
          })}

          {assets.map((f) => {
            const [lng, lat] = f.geometry.coordinates;
            const p = f.properties;
            const color = RISK_COLORS[p.risk_level] || RISK_COLORS.low;
            return (
              <CircleMarker
                key={p.id}
                center={[lat, lng]}
                radius={p.voltage_kv >= 220 ? 9 : p.voltage_kv >= 110 ? 7 : 5}
                pathOptions={{ color: "#0b1220", weight: 1, fillColor: color, fillOpacity: 0.95 }}
                eventHandlers={{ click: () => onSelect?.(p.id) }}
              >
                <Popup>
                  <strong>{p.name}</strong>
                  <br />Risk: <b style={{ color }}>{p.risk_level}</b> ({p.risk_score})
                  <br />Flood year: {p.flood_year ?? "beyond 2150"}
                  <br />Elevation: {p.base_elev_m} m · {p.dist_coast_km} km from coast
                  <br />Action: {p.action}
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="map-legend">
        <span><i className="dot high"></i> High risk</span>
        <span><i className="dot medium"></i> Medium risk</span>
        <span><i className="dot low"></i> Low risk</span>
        <span><i className="dot safe"></i> Safe solar + battery site</span>
        <span><i className="swatch flood"></i> Flooded area</span>
      </div>
    </>
  );
}
