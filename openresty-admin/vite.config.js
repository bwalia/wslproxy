import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Supports multi-environment via --mode flag:
//   npm run dev              → mode=development (loads .env + .env.local)
//   npm run dev:int          → mode=int (loads .env + .env.int)
//   npm run dev:lan          → mode=lan (loads .env + .env.lan + .env.lan.local, binds 0.0.0.0)
//   npm run dev:prod         → mode=prod (loads .env + .env.prod)
//   npm run dev:diytaxreturn → mode=diytaxreturn (loads .env + .env.diytaxreturn)
//   See .env.example for full documentation.
//
// CORS-free proxy strategy (same as Next.js rewrites):
//   The browser always calls relative /api paths (same-origin, no CORS).
//   Vite dev server proxies those requests to the real backend server-side.
//   Proxy target resolution order:
//     1. PROXY_TARGET env var  — set by Docker Compose to internal network URL
//     2. VITE_FRONT_URL        — picks up per-mode value (prod/int/diytaxreturn)
//     3. http://localhost:8280 — safe default for bare-metal local dev
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Server-only — never exposed to the browser bundle
  const proxyTarget = env.PROXY_TARGET || env.VITE_FRONT_URL || 'http://localhost:8280'

  return {
    plugins: [react()],
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL || '/api')
    },
    server: {
      // LAN mode and Docker both need all-interface binding
      host: mode === 'lan' || !!env.DOCKER_ENV ? '0.0.0.0' : 'localhost',
      port: parseInt(env.PORT) || 5173,
      proxy: {
        // All /api/* requests proxied to backend — eliminates CORS entirely
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        // Public health endpoint also proxied
        '/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      // Skip cleaning output dir - Docker bind mounts create root-owned
      // files that can't be deleted on macOS, causing ENOTEMPTY errors
      emptyOutDir: false,
    },
  }
})
