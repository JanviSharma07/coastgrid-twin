import axios from "axios";

// Live backend by default; set VITE_API_URL (e.g. http://127.0.0.1:8000) to use a local one
export const API_BASE = import.meta.env.VITE_API_URL || "https://coastgrid-twin-api.vercel.app";

const API = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // first request after idle can take a few seconds
});

export const getMeta = () => API.get("/api/meta");
export const getHealth = () => API.get("/api/health");
export const getRisk = (params) => API.get("/api/risk", { params });
export const getPriorities = (params) => API.get("/api/priorities", { params });
export const getAssets = (params) => API.get("/api/assets", { params });
export const getSafeSites = (params) => API.get("/api/safe-sites", { params });
export const getSeaLevel = (params) => API.get("/api/sea-level", { params });
export const getOcean = (params) => API.get("/api/ocean", { params });
export const getFloodZones = (params) => API.get("/api/flood-zones", { params });

export const getAssetDetail = (id, params) =>
  API.get(`/api/assets/${id}`, { params });

export const getAreaImpact = (params) => API.get("/api/area-impact", { params });
export const simulateRisk = (data) => API.post("/api/simulate", data);

export default API;