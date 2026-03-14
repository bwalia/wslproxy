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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL || 'http://localhost:8280/api')
    },
    server: {
      // In LAN mode, bind to all interfaces so other devices can connect
      host: mode === 'lan' ? '0.0.0.0' : 'localhost',
      port: 5173,
    },
    build: {
      // Skip cleaning output dir - Docker bind mounts create root-owned
      // files that can't be deleted on macOS, causing ENOTEMPTY errors
      emptyOutDir: false,
    },
  }
})
