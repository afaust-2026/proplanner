import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'ProPlan Scholar',
        short_name: 'ProPlan Scholar',
        description: 'The AI-powered academic planner for busy students.',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0e0e14',
        theme_color: '#C75B12',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/icon-72.png',  sizes: '72x72',  type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-96.png',  sizes: '96x96',  type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-128.png', sizes: '128x128',type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-144.png', sizes: '144x144',type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-152.png', sizes: '152x152',type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-192.png', sizes: '192x192',type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-384.png', sizes: '384x384',type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512',type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Dashboard',   url: '/app#dashboard',   icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
          { name: 'Calendar',    url: '/app#calendar',    icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
          { name: 'Assignments', url: '/app#assignments', icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
        ],
      },
      workbox: {
        // Cache the app shell and core assets — exclude landing/privacy/terms so Vercel routing handles them
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/app/],
        runtimeCaching: [
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // Short cache for Supabase — 5 min max to keep data fresh across devices
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  base: '/',
})
