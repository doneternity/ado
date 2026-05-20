// Canonical, absolute API base — used anywhere a URL is shown to the user to
// copy into their own code. Always the public production endpoint.
export const API_BASE_URL = "https://adoai.space/v1";

// Same-origin relative base — used for in-app fetches (Playground). Resolves
// against whatever host the app is served from, so it works on both the apex
// and www domains without a cross-origin (CORS) hop.
export const PROXY_REQUEST_BASE = "/v1";
