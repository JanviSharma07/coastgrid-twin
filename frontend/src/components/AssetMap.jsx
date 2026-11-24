import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Circle, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { RISK_COLORS, SAFE_COLOR, SINK_COLOR, FLOOD_COLOR, band, floodYearText, typeLabel } from "../lib/utils";

const COLOR_FIELDS = {
  risk: { field: "risk_score", label: "Overall risk" },
  flood: { field: "flood_score", label: "Flood danger" },
  heat: { field: "heat_score", label: "Heat stress" },
  salt: { field: "salt_score", label: "Salt corrosion" },
};

function FlyTo({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo(focus, 14, { duration: 0.8 });
  }, [focus, map]);
  return null;
}

/**
 * Generic map used by several pages.
 * layers: { assets, flood, safe, sinking } booleans
 * colorBy: "risk" | "flood" | "heat" | "salt"
 */
export default function AssetMap({
  assets = [],
  floodZones,
  safeSites,
  hotspots = [],
  sinkRadiusKm = 1.5,
  layers = { assets: true, flood: true, safe: true, sinking: false },
  colorBy = "risk",
  model,
  layerKey,
  onSelect,
  selectedId,
  focus,
  center = [13.05, 80.24],
  zoom = 11,
  height = 460,
  points = [],
  mapKey,
  flood = true,
  legend = true,
  assetColor, // optional (props) => colour, overrides colour-by (used by animations)
}) {
  const sites = safeSites?.features || [];
  const cf = COLOR_FIELDS[colorBy] || COLOR_FIELDS.risk;

  return (
    <>
      <div className="map-container" style={{ height }}>
        <MapContainer key={mapKey} center={center} zoom={zoom} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyTo focus={focus} />

          {flood && layers.flood && floodZones?.features?.length > 0 && (
            <GeoJSON
              key={layerKey}
              data={floodZones}
              style={{ color: FLOOD_COLOR, weight: 1, fillColor: FLOOD_COLOR, fillOpacity: 0.35 }}
            />
          )}

          {points.map((pt, i) => (
            <CircleMarker key={`pt-${i}-${pt.lat}`} center={[pt.lat, pt.lon]} radius={pt.radius || 5}
              pathOptions={{ color: pt.stroke || "#0b1220", weight: pt.weight || 1, fillColor: pt.color, fillOpacity: 0.9 }}>
              <Tooltip>{pt.label}</Tooltip>
            </CircleMarker>
          ))}

          {layers.sinking &&
            hotspots.map((h) => (
              <Circle
                key={h.name}
                center={[h.lat, h.lon]}
                radius={sinkRadiusKm * 1000}
                pathOptions={{ color: SINK_COLOR, fillColor: SINK_COLOR, fillOpacity: 0.15, weight: 1.5, dashArray: "4" }}
              >
                <Tooltip>Land sinking hotspot: {h.name}</Tooltip>
              </Circle>
            ))}

          {layers.safe &&
            sites.map((f) => {
              const [lng, lat] = f.geometry.coordinates;
              const p = f.properties;
              return (
                <CircleMarker
                  key={`safe-${p.rank}`}
                  center={[lat, lng]}
                  radius={8}
                  pathOptions={{ color: SAFE_COLOR, fillColor: SAFE_COLOR, fillOpacity: 0.3, weight: 2, dashArray: "3" }}
                >
                  <Popup>
                    <strong>Safe site #{p.rank} for new solar + battery</strong>
                    <br />Ground {p.ground_elev_m} m · stays {p.margin_2100_m} m above worst-case 2100 water
                    <br />{p.dist_coast_km} km from sea · {p.nearest_substation_km} km to nearest substation
                  </Popup>
                </CircleMarker>
              );
            })}

          {layers.assets &&
            assets.map((f) => {
              const [lng, lat] = f.geometry.coordinates;
              const p = f.properties;
              const value = p[cf.field] ?? 0;
              const color = assetColor ? assetColor(p) : RISK_COLORS[band(value, model)];
              const selected = p.id === selectedId;
              return (
                <CircleMarker
                  key={p.id}
                  center={[lat, lng]}
                  radius={(p.voltage_kv >= 220 ? 9 : p.voltage_kv >= 110 ? 7 : 5) + (selected ? 3 : 0)}
                  pathOptions={{
                    color: selected ? "#ffffff" : "#0b1220",
                    weight: selected ? 3 : 1,
                    fillColor: color,
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{ click: () => onSelect?.(p.id) }}
                >
                  <Popup>
                    <strong>{p.name}</strong>
                    <br />{typeLabel(p.type)}{p.voltage_kv ? ` · ${p.voltage_kv} kV` : ""}
                    <br />Overall risk: <b style={{ color: RISK_COLORS[p.risk_level] }}>{p.risk_level}</b> ({p.risk_score})
                    <br />Flood {p.flood_score} · Heat {p.heat_score} · Salt {p.salt_score}
                    <br />First flooded: {floodYearText(p.flood_year)}
                    <br />Action: {p.action}
                  </Popup>
                </CircleMarker>
              );
            })}
        </MapContainer>
      </div>

      {legend && <div className="map-legend">
        {layers.assets && (
          <>
            <span className="legend-title">{cf.label}:</span>
            <span><i className="dot high"></i> High</span>
            <span><i className="dot medium"></i> Medium</span>
            <span><i className="dot low"></i> Low</span>
            <span className="legend-note">bigger dot = higher voltage</span>
          </>
        )}
        {layers.flood && <span><i className="swatch flood"></i> Flooded land</span>}
        {layers.safe && <span><i className="dot safe"></i> Safe site for solar + battery</span>}
        {layers.sinking && <span><i className="dot sink"></i> Land-sinking hotspot</span>}
      </div>}
    </>
  );
}
