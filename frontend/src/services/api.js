import axios from "axios";

// Live backend by default; set VITE_API_URL (e.g. http://127.0.0.1:8000) to use a local one
export const API_BASE = import.meta.env.VITE_API_URL || "https://coastgrid-twin-api.vercel.app";

const API = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // first request after idle can take a few seconds
});

// Gentle on the free database: at most 3 requests at a time, identical GETs share one result,
// and a failed request is retried once after a short pause (the server may be waking up).
const MAX_PARALLEL = 3;
let active = 0;
const waiting = [];
const slot = () => new Promise((res) => (active < MAX_PARALLEL ? (active++, res()) : waiting.push(res)));
const release = () => (waiting.length ? waiting.shift()() : active--);
const cache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(fn) {
  await slot();
  try {
    try {
      return await fn();
    } catch (e) {
      const st = e.response?.status;
      if (st && st < 500) throw e; // 4xx (incl. 503 "not built") handled below
      if (st === 503) throw e;
      await sleep(1500);
      return await fn();
    }
  } finally {
    release();
  }
}
API.get = ((orig) => (url, cfg = {}) => {
  const key = url + JSON.stringify(cfg.params || {});
  if (cache.has(key)) return cache.get(key);
  const p = run(() => orig.call(API, url, cfg));
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return p;
})(API.get);
const post = API.post.bind(API);
API.post = (url, data, cfg) => run(() => post(url, data, cfg));

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
export const getTrends = (params) => API.get("/api/trends", { params });
export const simulateRisk = (data) => API.post("/api/simulate", data);

export default API;