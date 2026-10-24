import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    fs: { allow: ['..'] }, // ../shared
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
})
