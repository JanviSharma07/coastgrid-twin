import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
  timeout: 15000,
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

export const simulateRisk = (data) => API.post("/api/simulate", data);

export default API;