// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  /**
   * Mode SPA (ssr: false).
   *
   * Auth memakai Bearer token di localStorage, yang tidak bisa dibaca server.
   * Dengan SSR aktif, auth.global.ts selalu melihat user belum login saat
   * render di server → setiap hard-refresh ke /admin/** bounce ke /login
   * walau sesi valid. Semua 21 halaman bersifat privat (tanpa kebutuhan SEO)
   * dan tidak ada kode yang bergantung pada SSR, jadi SPA menghapus kelas bug
   * ini tanpa kehilangan apa pun. Tetap kompatibel dengan `nuxt generate`
   * maupun `node .output/server/index.mjs`.
   */
  ssr: false,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt'],
  css: ['~/assets/css/tailwind.css'],
  // Komponen dipakai tanpa prefix direktori: <BaseButton> bukan <UiBaseButton>
  components: [{ path: '~/components', pathPrefix: false }],
  app: {
    head: {
      title: 'SixAgo — Travel Governance Enterprise',
      titleTemplate: '%s | SixAgo',
      htmlAttrs: { lang: 'id' },
      meta: [
        { name: 'description', content: 'SixAgo Enterprise Travel Governance — kelola perjalanan dinas, approval berjenjang, uang muka, dan reimbursement terpusat.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { charset: 'utf-8' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      ],
    },
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000/api',
    },
  },
  experimental: {
    typedPages: true,
    viewTransition: true,
  },
  nitro: {
    compressPublicAssets: { gzip: true, brotli: true },
  },
})
