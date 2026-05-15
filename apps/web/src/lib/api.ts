// In dev, an empty base string lets Vite's proxy in vite.config.ts forward
// `/api/*` to the local worker on :8787. In production (GitHub Pages),
// VITE_API_BASE points at the deployed Cloudflare Worker URL.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export function api(path: string): string {
  return `${API_BASE}${path}`;
}
