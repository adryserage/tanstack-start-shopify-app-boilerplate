import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

export default defineConfig({
  server: {
    port: 8080,
    allowedHosts: true,
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    nitroV2Plugin({
      preset: 'node-server',
      compatibilityDate: '2025-10-04',
    }),
    viteReact(),
  ],
  optimizeDeps: {
    include: ['@shopify/app-bridge-react'],
  },
})
