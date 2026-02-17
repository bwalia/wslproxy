import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || process.env.API_URL || 'http://localhost:3000/api')
  },
  build: {
    // Skip cleaning output dir - Docker bind mounts create root-owned
    // files that can't be deleted on macOS, causing ENOTEMPTY errors
    emptyOutDir: false,
  },
})
