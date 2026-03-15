// Central place for backend URL — set NEXT_PUBLIC_API_URL in production
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const HTTP_BASE = API_BASE;
export const WS_BASE   = API_BASE.replace(/^http/, "ws");
