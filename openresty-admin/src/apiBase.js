/**
 * Admin API base URL — resolved at runtime so one image works on
 * int.blah.com / acc.blah.com / cp.pop0.uk / lon1 without rebuild.
 *
 * Priority:
 *   1. window.__WSLPROXY_CONFIG__.apiUrl  (from /runtime-config.js)
 *   2. same-origin "/api"
 */
export function getApiUrl() {
  if (typeof window !== "undefined") {
    const fromRuntime = window.__WSLPROXY_CONFIG__?.apiUrl;
    if (fromRuntime && String(fromRuntime).trim()) {
      return String(fromRuntime).replace(/\/$/, "");
    }
  }
  return "/api";
}
