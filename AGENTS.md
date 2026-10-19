# AGENTS.md — SixAgov2

## Stack
- Nuxt 4.5 + Vue 3.5 + Vue Router 5 + Vite 8, ESM (`"type": "module"` in `package.json:3`), Node `^20.19 || >=22.12` (required by Vite/Nuxt).
- Tailwind CSS (@nuxtjs/tailwindcss) dan Pinia — WAJIB dicek dulu apakah sudah terpasang; jika belum, install dengan `npx nuxi module add tailwindcss` dan `npx nuxi module add pinia` sebelum mulai konversi layar.
- Config: `nuxt.config.ts:2` — `compatibilityDate: '2025-07-15'`, `devtools.enabled: true`.

## Commands
- `npm install` — runs `postinstall: nuxt prepare` (`package.json:10`) to generate `.nuxt/` (required before types/build work).
- `npm run dev` — dev server at `http://localhost:3000`.
- `npm run build` / `npm run preview` / `npm run generate` — production build, local preview, static generate (`package.json:6-9`).
- No lint / typecheck / test scripts configured — do not invent `npm run lint` or `test` commands.

## Structure
- `app/app.vue:1` — entry (Nuxt 4 `srcDir` is `app/`, not repo root).
- Semua kode UI ditaruh di `app/`, mengikuti konvensi Nuxt 4 file-based:
  - `app/pages/` — routing (`app/pages/admin/index.vue`, `app/pages/app/index.vue`, dst.)
  - `app/components/ui/` — komponen reusable (BaseButton.vue, StatusBadge.vue, BaseCard.vue, SearchBar.vue)
  - `app/layouts/` — `admin.vue` (sidebar+topbar, untuk /admin/**), `app.vue` (bottom nav, untuk /app/**) — HATI-HATI: nama layout `app.vue` bisa bentrok penamaan dengan `app/app.vue` root entry, cek dulu konvensi Nuxt 4 kalau perlu ganti nama jadi `staff.vue`.
  - `app/composables/`, `app/middleware/`, `app/types/`
- `public/` — static assets (`robots.txt`, `favicon.ico`).
- `design-reference/` — 16 static HTML mocks (dashboard, login, travel-request, approval, reimbursement, management-*). Ini UI source of truth — implementasikan dari sini; JANGAN di-serve atau di-import langsung.
- `.nuxt/`, `.output/`, `.nitro/`, `.cache/`, `dist/` — generated, gitignored. Jangan pernah edit `.nuxt/` manual.

## Design Token (WAJIB pakai dari tailwind.config.ts, jangan hardcode hex)
- primary: '#28B446'
- secondary: '#1A5D2C'
- tertiary: '#E9F7EF'
- neutral: '#F8F9FA'
- Font: 'Plus Jakarta Sans'

## Aturan Konversi Presisi (berlaku setiap kali konversi layar dari design-reference/)
1. Pertahankan struktur, urutan elemen, spacing, dan proporsi persis dari file sumber — jangan menyederhanakan.
2. Semua warna WAJIB dari token Tailwind di atas.
3. Teks statis disalin persis, Bahasa Indonesia, jangan diparafrase.
4. Pakai komponen reusable yang sudah ada di `app/components/ui/`, jangan tulis ulang style tombol/badge dari nol.
5. Data dummy pakai interface TypeScript eksplisit di `app/types/`.
6. Responsive wajib (sm & lg breakpoint) walau desain sumber cuma satu ukuran.
7. Setiap `<img>` punya `alt`, tombol ikon punya `aria-label`.
8. Tidak boleh pakai library UI eksternal (Nuxt UI dll) kecuali diminta.
9. Kalau ada elemen ambigu di desain sumber, tandai `<!-- TODO: konfirmasi ... -->`, jangan menebak.
10. Selalu akhiri dengan daftar singkat "Asumsi yang dibuat" kalau ada bagian tidak eksplisit.

## Conventions & Gotchas
- ESM only — use `import/export`, not `require`.
- PowerShell on Windows (`win32`): quote spaced paths with `"..."`, invoke exes with `& "path\to\exe"`, chain with `; if ($?) { ... }` (not `&&`).
- No CI workflows; no env files committed (`.env*` ignored, `!.env.example` allowed).
