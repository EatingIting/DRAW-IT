const envBaseUrl = process.env.REACT_APP_API_BASE_URL?.trim();
const fallbackBaseUrl =
  typeof window !== "undefined" ? window.location.origin : "";

export const API_BASE_URL = envBaseUrl || fallbackBaseUrl;
