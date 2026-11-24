import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Popup
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

export default function AssetMap({ geoData, floodData }) {
  const features = geoData?.features || [];

  const getColor = (feature) => {
    const risk = feature.properties?.risk_level;

    if (risk === "high") return "#fb7185";
    if (risk === "medium") return "#fbbf24";

    return "#34d399";
  };

  return (
    <div className="panel map-panel">
      <div className="panel-heading">
        <div>
          <h3>Coastal Infrastructure Map</h3>
          <p>Chennai coastal region · OpenStreetMap</p>
        </div>

        <span className="live-tag">DIGITAL TWIN</span>
      </div>

      <div className="map-container">
        <MapContainer
          center={[13.0827, 80.2707]}
          zoom={10}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {floodData && (
            <GeoJSON
              key={JSON.stringify(floodData)}
              data={floodData}
              style={{
                color: "#38bdf8",
                weight: 1,
                fillColor: "#38bdf8",
                fillOpacity: 0.25
              }}
            />
          )}

          {features.map((feature) => {
            const [lng, lat] = feature.geometry.coordinates;

            return (
              <CircleMarker
                key={feature.properties.id}
                center={[lat, lng]}
                radius={8}
                pathOptions={{
                  color: getColor(feature),
                  fillColor: getColor(feature),
                  fillOpacity: 0.9
                }}
              >
                <Popup>
                  <strong>{feature.properties.name}</strong>
                  <br />
                  Risk: {feature.properties.risk_level}
                  <br />
                  Score: {feature.properties.risk_score}
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="map-legend">
        <span><i className="high"></i> High risk</span>
        <span><i className="medium"></i> Medium risk</span>
        <span><i className="low"></i> Low risk</span>
      </div>
    </div>
  );
}