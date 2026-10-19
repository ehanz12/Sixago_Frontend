# SixAgo — Travel Governance (Frontend)

Antarmuka web **SixAgo Enterprise Travel Governance**: pengajuan perjalanan
dinas berjenjang, uang muka, reimbursement, delegasi approval, dan dashboard
adaptif per role. Backend API: Laravel di `C:\Development\PHP\SixAgoBeV2`.

**Baca dulu:** `ARCHITECTURE.md` (arsitektur & kontrak API) ·
`USERFLOW.md` (alur per role + naskah demo) · `AGENTS.md` (aturan kerja repo).

## Prasyarat

- Node `^20.19` atau `>=22.12`, npm
- Backend hidup di `http://localhost:8000` (MySQL `be-Six`)
- `NUXT_PUBLIC_API_BASE` bila API tidak di default (default `http://localhost:8000/api`)

## Setup

```bash
npm install          # menjalankan postinstall: nuxt prepare (wajib sebelum build)
npm run dev          # http://localhost:3000
```

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm run preview` | build & pratinjau produksi |
| `npm run typecheck` | cek tipe `vue-tsc` |
| `npm run test:e2e` | 24 test Playwright (butuh backend + MySQL hidup) |

Tidak ada script lint/test-unit — jangan mengarang `npm run lint`.

## Login

Universal untuk semua role di `/login` (Employee, Line Manager,
Division Head, Finance Approver, Super Admin). Akun demo `password123` —
lihat matriks role di `USERFLOW.md §1`.

## Struktur

`app/` adalah srcDir Nuxt 4: `pages/` (routing file-based) ·
`layouts/` (`admin` = sidebar, `auth` = shell login) ·
`components/ui/` (reusable, jangan tulis ulang style tombol/badge) ·
`composables/` · `middleware/` · `stores/` · `types/`.
`design-reference/` hanya sumber desain — jangan di-serve/di-import.
