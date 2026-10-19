# SixAgo — Arsitektur & Penjelasan Project

Sistem **Enterprise Travel Governance**: pengajuan perjalanan dinas korporat
berjenjang (approval Level 1–4 + auto-ticketing), uang muka (kas bon),
reimbursement, delegasi approval (Plt), notifikasi, dan audit trail.

Dokumen pendamping: `USERFLOW.md` (alur per role + naskah demo),
`AGENTS.md` (aturan kerja repo frontend).

---

## 1. Dua repo, satu sistem

| | Frontend (`SixAgov2`) | Backend (`SixAgoBeV2`) |
|---|---|---|
| Lokasi | `C:\Development\JS\SixAgov2` | `C:\Development\PHP\SixAgoBeV2` |
| Stack | Nuxt 4.5 + Vue 3.5 + Pinia + Tailwind 3, ESM | Laravel 12 + Sanctum (Bearer token) + MySQL |
| Peran | Render UI, gate tampilan per role, panggil API | Sumber kebenaran: validasi, otorisasi, rantai approval, data |
| URL dev | `http://localhost:3000` | `http://localhost:8000` → API di `/api` |
| Kunci env | `NUXT_PUBLIC_API_BASE` (default `http://localhost:8000/api`) | `DB_*`, `MAIL_*`, `QUEUE_CONNECTION=database` |

**Prinsip pembagian:** backend menolak dengan **403/409/422** bila tidak berhak;
frontend menyembunyikan tombol/menu yang tidak sesuai role. Frontend tidak
pernah dipercaya untuk keamanan — ia hanya cermin.

---

## 2. Alur request (contoh: approve Level 1)

```
Browser (Hendra, Line Manager)
  │ klik "Setujui" di Approval Queue
  ▼
FE: v-if="canDecideQueue" (stores/app.ts — cocokkan nama role)
  │ POST /api/approval-queue/7/decide { action: 'approve' }
  ▼
BE: auth:sanctum → role:Line Manager,... (CheckRole → 403 bila salah role)
  │ ApprovalChain::decide()
  │   1. status harus 'pending'              → 409 bila sudah diputus
  │   2. User::canDecide() (level + delegasi) → 403 "bukan wewenang role Anda"
  │   3. isDesignated() (approver/si Plt)     → 403 "hanya approver yang dituju"
  │   4. bukan milik sendiri                  → 403 "milik sendiri"
  │   5. isOutOfScope() (wilayah kerja)       → 403 "di luar wilayah kerja Anda"
  │   6. update baris → aktifkan level berikut / finalisasi TR
  │   7. Notify (DB) + Mail::queue + Audits::record
  ▼
FE: toast sukses + refreshNuxtData
```

**Batch approve** memakai jalur yang sama lewat `ApprovalChain::batchDecide()`:
pre-filter wewenang dulu (tidak ada efek samping), lalu `DB::transaction` —
satu gagal = seluruh batch batal, termasuk notifikasi & job email (ikut
rollback karena antrean `database`). Gagal → `422 + { failed: [...] }`.

---

## 3. Sistem RBAC — 4 lapis

Otorisasi backend **tidak memakai** kolom `roles.permissions` (hanya diekspor
ke API, tidak pernah ditegakkan; `User::hasPermission()` nol call site).
Sumber kebenaran adalah **nama role**. Jangan memindahkan gate ke permission.

### 3.0 Matriks posisi: grade ↔ role ↔ atasan

Grade dan role itu **dua hal berbeda** yang berdiri sendiri:
- **role** → kewenangan approval (`canDecideOwn`, middleware `role:`)
- **grade** → plafon perjalanan (`PolicyCheck::gradeMatches`)
- **`manager_id`** → approver struktural Level 1
- **`departments.leader_id`** → approver struktural Level 2

Hubungannya ditegakkan `app/Support/Positions.php` (cermin: `POSITION_MATRIX`
di `app/constants/domain.ts`):

| Role | Grade sah | Wajib punya atasan |
|---|---|---|
| Employee | P1 – P5 | **ya** |
| Line Manager | P4 – M3 | tidak |
| Division Head | M1 – M3 | tidak |
| Finance Approver | P1 – M3 | tidak |
| Super Admin | M1 – M3 | tidak |

Ditegakkan di `UserController@store/update` + import CSV: role & grade harus
kanonik, grade harus dalam rentang role, atasan bukan diri sendiri / bukan
siklus / harus Aktif / harus ber-role approver, dan `DepartmentController`
menolak `leader_id` yang bukan Division Head departemen itu (Super Admin
diizinkan). Grade yang **tidak tercakup travel policy** hanya diberi peringatan,
tidak diblokir — `GET /travel-policies/grade-coverage` memberi daftarnya, dan
`php artisan users:audit` melapor seluruh pelanggaran yang sudah ada (read-only).

### 3.1 Empat lapis otorisasi

Otorisasi backend **tidak memakai** kolom `roles.permissions` (hanya diekspor
ke API, tidak pernah ditegakkan; `User::hasPermission()` nol call site).
Sumber kebenaran adalah **nama role**. Jangan memindahkan gate ke permission.

| Lapis | Mekanisme | Lokasi |
|---|---|---|
| 1. Route | middleware `role:A,B` → 403 (`CheckRole.php`) | `routes/api.php` |
| 2. Level rantai | `User::canDecide()` — LM→L1, DH→L2, FA→L3, SA→semua, atau Plt via delegasi aktif | `User.php:103` |
| 3. Scope wilayah | `User::visibleUserIds()` — Employee→diri sendiri, LM→bawahan, DH→departemennya, FA/SA→semua | `User.php:178` |
| 4. Designated | `isDesignated()` — approver yang ditunjuk atau Plt-nya | `ApprovalChain.php:352` |

Frontend mencerminkan lapis 1–2 lewat `canDecideQueue` (LM/DH/FA/SA),
`canBatchApproveTravel` (LM/DH/SA — **tanpa** FA, sesuai `routes/api.php:37`),
`canFinance` (FA/SA), `isSuperAdmin`, `isOwnRequest()`, dan `roleKey`
di dashboard. Lapis 3–4 hanya diketahui backend (butuh data antrean),
jadi UI bisa menampilkan tombol yang backend tolak — error 403 asli
ditampilkan lewat toast, bukan pesan generik.

**Pengecualian pola gate-halaman:** `/admin/uang-muka` dan
`/admin/reimbursement` **sengaja tidak ada** di `ROLE_ROUTES` (terbuka semua
role). Backend sudah men-scope daftar (`visibleUserIds`), mengizinkan create
untuk travel milik sendiri (`Advance/ReimbursementController@store`), dan
mengunci `decide`/`disburse`/`verify` ke FA/SA via `role:` — halaman meng-gate
per tombol via `canFinance`. Tombol unduh audit-log di Notifikasi di-gate
`isSuperAdmin` (backend `GET /exports/audit-logs` SA-only).

**5 role kanonik** (harus sama persis di `DatabaseSeeder.php:45-61`,
`users.vue:31`, dan seluruh `hasRole()`):
`Employee` · `Line Manager` · `Division Head` · `Finance Approver` · `Super Admin`

---

## 4. Siklus hidup travel request

```
Draft → Submitted → In Review → Approved / Rejected
              │          │            │
              │          │            └─ Level 5 "Auto" (teruskan ke travel desk)
              │          └─ reject di level mana pun → sisa 'queued' → 'cancelled'
              └─ rantai dibentuk ApprovalChain::build() berdasar nominal:
                 ≤5jt: L1 · 5–15jt: L1→L2 · 15–50jt: L1→L2→L3 · >50jt: +L4
                 (lalu disaring resolveSteps() — lihat §4.1)
```

### 4.1 Resolver rantai: level yang dilewati & jaring pengaman

`ApprovalChain::resolveSteps()` menyaring level SEBELUM baris antrean dibuat.
Level yang dilewati dicatat di audit (`travel.autopass`) + notifikasi ke Super Admin.

| Lewat bila | Contoh |
|---|---|
| Tidak ada approver struktural | Employee tanpa atasan → L1 hilang |
| Approver adalah pemohon sendiri | Kepala Divisi yang juga leader departemennya → L2 hilang |
| Pemohon ikut pool approver | Finance mengajukan → L3 (pool Finance) hilang |
| Approver dobel di level berurutan | Line Manager dengan atasan = Kepala Divisi → L2 hilang |

**Jaring pengaman:** bila setelah disaring tidak ada level tersisa, ditambahkan
pool cadangan — **Finance (L3)**, atau **Super Admin (L4)** bila pemohonnya
Finance. Rantai tidak pernah kosong, dan pengajuan tidak pernah Approved
otomatis tanpa keputusan manusia.

Label langkah cadangan diawali angka (`3 (Cadangan Finance)`) karena
`User::canDecideOwn()` mem-parse `str($queue->level)->before(' ')` untuk
menentukan level — label polos akan ter-parse `0` dan membuat pool tidak bisa
diputus.

Status baris antrean: `pending` (aktif, satu-satunya yang bisa diputus) →
`approved`/`rejected`; `queued` (menunggu giliran); `cancelled`.
Baris dibangun internal — endpoint tulis `approval-queue` hanya untuk
Super Admin (perbaikan manual).

Uang muka: `Pending Finance` → `Approved-Ready to Pay` → `Paid`
(disburse wajib `transfer_ref` + bukti). Reimbursement: `Menunggu Audit` →
`Menunggu Verifikasi Finance` → `Disetujui` (settlement) / `Ditolak`.

**Badge kepatuhan policy** (`Support/PolicyCheck.php`): saat TR dibuat,
`TravelRequestController@store` menilai total estimasi vs total plafon grade
pemohon (`transport + hotel×nights + per_diem×days + local×days`,
`days = max(1, end−start+1)`, `nights = max(1, days−1)`, plafon string
di-parse digitnya, grade dicocokkan sebagai rentang "P3 - P5") dan mengisi
`policy_status` = `Sesuai` / `Deviasi N%` / null (tak ada policy cocok).
Ini **label informatif**: tidak menolak, tidak mengubah rantai. Finalisasi
mempertahankannya (`Policy Approved · Deviasi N%`); `POST /approval-simulate`
mengembalikan blok `policy` yang sama (param tanggal opsional,
`days_assumed` eksplisit bila absen).

**Kunci status via PUT** (`TravelRequestController@update`): `policy_status`
tak bisa ditulis manual (403, semua role); `status` hanya menerima
`'Cancelled'` dan hanya pra-approval (pemohon/SA, status `Submitted`, nol
baris decided — selain itu 409; baris `pending`/`queued` ikut dibekukan).
Nilai status lain via PUT selalu 403 — penolakan/persetujuan sah hanya lewat
`decide()` yang teraudit. Edit field (`cost`/tanggal) menghitung ulang badge
via `PolicyCheck` selama TR belum final; TR final dibekukan sebagai sejarah.
`note` wajib (min. 3 karakter) untuk setiap `action=reject` di
`decide`/`advances-decide`/`reimbursements-verify` (422 bila kosong).
Edit TR via `update()` mencatat `travel.update` (old/new) ke audit.

**Anti salah-ketik & magic string:** string status/role terpusat di
`Support/TravelStatuses.php` + `Support/UserRoles.php`, dicerminkan di
`app/constants/domain.ts` (nilai harus sama persis — dikunci
`DomainValuesTest`). Rute dinormalisasi (trim/spasi/huruf besar) di
`store`/`update` + blur form. Nominal uang (advance/klaim) dikonfirmasi
ulang terformat sebelum submit; aksi destruktif (reset password, toggle
status, cabut delegasi) wajib modal konfirmasi berisi nama target.

---

## 5. Struktur direktori

**Frontend** (`app/` adalah srcDir Nuxt 4):
- `pages/` — `login.vue` (universal), `password.vue`, `profil.vue`,
  `admin/` (dashboard adaptif + travel-requests + approval-queue + uang-muka +
  reimbursement + notifications + management/*), stub redirect di
  `admin/login.vue`, `admin/password.vue`, `admin/profil.vue`
- `layouts/` — `admin.vue` (sidebar + gating menu), `auth.vue` (shell background login)
- `components/ui/` — BaseButton, BaseCard, StatusBadge, SearchBar, AppToast, …
- `composables/` — `useApi` ($fetch + Bearer + 401→logout), `useMappers`
  (snake_case → camelCase tampilan), `useToast`, `useRedirectAfterLogin`
- `stores/app.ts` — token/user di localStorage (`sixago_token_v2`,
  `sixago_user_v2`, `sixago_pwd_flag`), `login`/`logout`/`changePassword`
- `middleware/auth.global.ts` — login wajib, `mustChangePassword`,
  `ROLE_ROUTES` + `PROTECTED_PATHS`
- `tests/e2e/` — Playwright (login, middleware, navigasi per role, render)

**Backend** (`app/`):
- `Http/Controllers/Api/` — 17 controller (lihat §7 untuk peta endpoint)
- `Http/Middleware/CheckRole.php` — penegak `role:`
- `Models/` — User (canDecide, visibleUserIds, delegationFor), TravelRequest,
  ApprovalQueue, Advance, Reimbursement, Delegation, Department, Project, …
- `Support/ApprovalChain.php` — **sumber kebenaran rantai** (build, decide,
  batchDecide, isDesignated, isOutOfScope, notifyApprovers, finalize)
- `Support/Audits.php`, `Support/Notify.php`, `Mail/DecisionMail.php`
- `routes/api.php` — seluruh kontrak API; `database/seeders/` — 5 role +
  akun demo (`password123` — reset bila drift, `firstOrCreate` tidak
  memperbarui password yang sudah ada)

---

## 6. Data & relasi penting

- `users`: `role`, `manager_id` (atasan → bawahan), `department_id`,
  `grade`, `status` (Aktif/Non-Aktif), `must_change_password`, `last_active`
  (ditulis saat login)
- `travel_requests` → `user`, `project`, `approvals` (queue), `advances`,
  `reimbursements`, `documents`
- `approval_queues`: `travel_request_id`, `type` (Travel/Uang Muka),
  `level` ("1 of 3"), `sequence`, `approver_id`, `status`, `decided_by`,
  `on_behalf_of`, `decided_at`, `sla_due_at`, `urgent`
- `delegations`: `delegator_id`, `delegatee_id`, `scope` (Penuh/Tiket),
  `max_amount` (0 = tanpa batas), `start_date`, `end_date`, `status`
- `departments`: `code`, `name`, `budget_total/used`, `leader_id`
- `travel_documents`: `file_url` root-relative (`/storage/...`) — FE wajib
  mengabsolutkan ke origin API (lihat `docHref()` di `[id].vue`)

**Kontrak yang sering salah:**
- Login memakai `corporateId` (camelCase, satu-satunya pengecualian);
  selain itu semua snake_case dua sisi.
- Filter departemen/proyek memakai LIKE pada **`name`**, bukan `code` —
  dropdown FE wajib mengirim nama asli dari API, bukan daftar hardcoded.
- `q.level` adalah label komposit ("1 of 3"), bukan angka.
- Paginator Laravel `{ data, current_page, last_page, total }` dibaca
  via `paginatorMeta()`.

---

## 7. Peta endpoint (ringkas, lengkap di `routes/api.php`)

Auth: `login` (throttle 10/mnt) · `logout` · `logout-all` · `user` ·
`user/password` · `user/profile`.
Dashboard: `stats` · `charts` · `sidebar-badges`.
Travel: `travel-requests` (+`batch-approve` LM/DH/SA, `summary`, `no/{no}`).
Queue: `approval-queue` (+`batch-approve`, `decide`; tulis = SA).
Uang: `advances` (+`decide`, `disburse`, `summary`; FA/SA).
Klaim: `reimbursements` (+`verify`, `summary`; FA/SA).
Dokumen/notifikasi/delegasi/audit/ekspor/pengaturan: sesuai `routes/api.php`.
Master (tulis = SA): `users` (+`users-summary` SA-only) · `travel-policies`
(+`toggle`) · `projects` (+`sync-sap` FA/SA) · `departments` (update: SA atau
DH departemennya sendiri; `leader_id` nullable) · `roles` ·
`approval-schemes` (+`activate`) · `approval-levels` ·
`approval-simulate` (terbuka, dipakai pratinjau rantai + policy).

---

## 8. Desain & token

Token Tailwind (`tailwind.config.ts`, **jangan hardcode hex**):
`primary #28B446` · `secondary #1A5D2C` · `tertiary #E9F7EF` ·
`neutral #F8F9FA` · + turunan (`surface-container-low #EFF4FF` untuk
field & pill, `on-surface #121C2A`, `on-surface-variant #3E4A3C`, …).
Font: Plus Jakarta Sans. Background login: `public/img/login-bg.svg`
(ilustrasi 1280×704 dari design-reference; form 384px float tanpa kartu).

---

## 9. Menjalankan & menguji

```bash
# Backend (butuh MySQL `be-Six`, sudah termigrasi + terseed)
cd C:\Development\PHP\SixAgoBeV2
php artisan serve --host=127.0.0.1 --port=8000
php artisan test            # 128 test
php artisan users:audit     # audit struktur posisi (read-only, tidak mengubah data)

# Frontend
cd C:\Development\JS\SixAgov2
npm run dev                 # http://localhost:3000
npm run build               # verifikasi produksi
npm run test:e2e            # 24 test Playwright (butuh kedua server)
npm run typecheck           # vue-tsc
```

**Batasan E2E yang perlu diketahui:**
- Backend single-thread (`artisan serve`) + throttle login 10/mnt → test
  jalan serial (`workers: 1`), total ~8 login API per run.
- E2E read-only terhadap DB demo; mutasi hanya di Feature test (sqlite).

> **Catatan mode render (per 2026-10-13):** aplikasi berjalan sebagai SPA
> (`ssr: false` di `nuxt.config.ts`). Sebelumnya SSR aktif, dan karena token
> auth hanya ada di localStorage, `auth.global.ts` selalu melihat user belum
> login saat render di server — sehingga **setiap hard-refresh ke `/admin/**`
> bounce ke `/login` walau sesi valid**. Test sempat jalan dengan cara klik
> client-side sebagai workaround masalah ini. Sekarang batas tersebut hilang:
> `page.goto('/admin/...')` langsung bisa dipakai di Playwright.
>
> Alasannya: seluruh 21 halaman bersifat privat (tanpa kebutuhan SEO) dan
> tidak ada kode yang bergantung pada SSR. Mode ini tetap kompatibel dengan
> `npm run generate` (static) maupun `node .output/server/index.mjs`.
> Bila nanti ada halaman publik yang butuh SEO/SSR, hidupkan kembali lewat
> `routeRules` untuk path tertentu.

---

## 10. Diketahui & belum dikerjakan

- `GET /departments` membuka `budget_total/used` ke semua role — butuh
  pemangkasan field bila dianggap sensitif (jangan batasi endpoint-nya,
  filter dropdown karyawan membutuhkannya terbuka).
- `POST /projects/sync-sap` mengizinkan Finance Approver tapi halamannya
  SA-only — kemampuan tak terjangkau.
- Toast ganda di `approval-levels.vue` & `users.vue` (sukses = toast lokal
  kaya, gagal = AppToast) — disengaja karena visualnya berbeda fungsi.
- `/admin/password` & `/admin/profil` masih ada sebagai stub 302.
