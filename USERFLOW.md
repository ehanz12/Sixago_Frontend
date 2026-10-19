# SixAgo — User Flow & Matriks Role

Dokumen ini menjelaskan **alur kerja (user flow) per role** pada sistem SixAgo
Enterprise Travel Governance, untuk kebutuhan presentasi/demo.

> Backend: `C:\Development\PHP\SixAgoBeV2` (Laravel + Sanctum)
> Frontend: Nuxt 4 (`http://localhost:3000` → API `http://localhost:8000/api`)
>
> Dokumen pendamping: `DEPLOY.md` (runbook + checklist production) di repo backend,
> `ARCHITECTURE.md` (penjelasan teknis menyeluruh) di repo ini.
>
> **Catatan route (hasil restrukturisasi):** login universal di `/login`
> (stub `/admin/login` hanya redirect), ganti password di `/password`,
> profil di `/profil`. Ketiganya dapat diakses semua role yang sudah login.

## 1. Akun Demo (password semua: `password123`)

| Email | Role | Tugas utama saat demo |
|---|---|---|
| `budi@nusantara.co.id` | Employee | Mengajukan travel, uang muka, reimbursement |
| `hendra@nusantara.co.id` | Line Manager (L1) | Approve level 1 + lihat tim |
| `michael@nusantara.co.id` | Division Head (L2) | Approve level 2 + atur budget IT |
| `ratna@nusantara.co.id` | Finance Approver | Verifikasi, settlement, disburse, sync SAP |
| `admin@sixago.local` | Super Admin | Semua akses + master data |

> Akun demo langsung bisa dipakai (tanpa wajib ganti password).
> Akun baru yang dibuat via halaman Users wajib ganti password saat login pertama.

## 2. Matriks Tugas per Role

| Kemampuan | Employee | Line Mgr | Div. Head | Finance | Super Admin |
|---|---|---|---|---|---|
| Buat travel request / advance / reimbursement sendiri | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lihat data | Milik sendiri | Tim (bawahan) | Satu departemen | Semua | Semua |
| Approve antrian **Level 1** | ❌ | ✅ | ❌ | ❌ | ✅ |
| Approve antrian **Level 2** | ❌ | ❌ | ✅ | ❌ | ✅ |
| Verifikasi / settlement reimbursement | ❌ | ❌ | ❌ | ✅ | ✅ |
| Approve + disburse uang muka | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ubah budget departemen sendiri | ❌ | ❌ | ✅ | ❌ | ✅ |
| Kelola users / roles / policy / project / scheme | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sync SAP | ❌ | ❌ | ❌ | ✅ | ✅ |
| Menyetujui pengajuan milik sendiri (self-approval) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Batalkan pengajuan sendiri | ✅⁴ | ✅⁴ | ✅⁴ | ✅⁴ | ✅⁴ |
| Ubah status via PUT (Rejected/Approved/…) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit field pengajuan milik sendiri | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hapus pengajuan milik sendiri (tanpa data turunan) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Menyetujui pengajuan di luar wilayah kerja (scope check) | ❌ | ❌² | ❌² | ❌² | ✅³ |
| Bertindak sebagai Plt (delegasi aktif dari approver) | ✅¹ | ✅¹ | ✅¹ | ✅¹ | ✅¹ |
| Upload dokumen travel (sesuai scope masing-masing) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kelola profil sendiri + logout semua perangkat | ✅ | ✅ | ✅ | ✅ | ✅ |
| Terima email notifikasi (sesuai preferensi) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hapus data yang masih punya data turunan | ❌ | ❌ | ❌ | ❌ | ❌ |

> ¹ Plt mewarisi **level** delegator selama delegasi berstatus Aktif,
> dalam periode berlaku, nominal ≤ `max_amount`, dan scope cocok
> (`Penuh` = semua; `Tiket` = travel saja). Keputusan tercatat
> `decided_by` + `on_behalf_of` dan tampil sebagai chip **"Plt a/n …"**.
>
> > ⁴ Batalkan hanya **pra-approval**: status masih `Submitted` dan nol baris
> > antrean yang diputus. Setelah ada keputusan approval → **409**; baris
> > `pending`/`queued` ikut dibekukan. Ubah status lain (Rejected/Approved)
> > via PUT selalu **403** — termasuk untuk Super Admin; penolakan sah hanya
> > lewat `decide()` yang teraudit.

> Penegakan ganda: backend menolak dengan **HTTP 403** bila role tidak berhak,
> dan frontend menyembunyikan tombol/menu yang tidak sesuai role.
>
> > ² Scope check (`ApprovalChain::isOutOfScope`): approver hanya bisa memutus
> > pengajuan yang pemohonnya berada dalam jangkauan visibilitasnya —
> > Line Manager = bawahannya sendiri, Division Head = departemennya sendiri.
> > Finance & Super Admin tidak dibatasi scope. Tanpa ini, Line Manager mana pun
> > bisa menyetujui request level-1 di seluruh perusahaan.
> >
> > ³ Super Admin lolos semua cek scope dan level.

## 3. Flow 1 — Approval Travel Request Berjenjang (alur utama demo)

Saat TR dibuat, sistem membentuk **rantai antrean per level** berdasar nominal
(`App\Support\ApprovalChain`, satu-satunya sumber kebenaran — dipakai juga
oleh simulasi di halaman Approval Level):

| Estimasi biaya | Rantai yang dibentuk |
|---|---|
| ≤ Rp5jt | Level 1 saja |
| Rp5–15jt (mis. Rp9,45jt milik Budi) | Level 1 → Level 2 |
| Rp15–50jt | Level 1 → 2 → 3 (Finance) |
| > Rp50jt | Level 1 → 2 → 3 → 4 (Super Admin, pengganti CFO) |

Approver tiap level ditentukan **struktural**: L1 = atasan langsung pemohon,
L2 = leader departemen pemohon, L3 = finance mana pun, L4 = Super Admin.

### Kalau approver strukturalnya tidak ada

Rantai **tidak pernah kosong dan tidak pernah auto-approved**. Level yang
tidak bisa dipakai dilewati (dicatat di audit + notifikasi ke Super Admin):

| Situasi | Hasil |
|---|---|
| Pemohon tanpa atasan langsung | L1 dilewati |
| Pemohon = leader departemennya sendiri | L2 dilewati (approve sendiri dilarang) |
| Pemohon ikut pool Finance | L3 dilewati |
| Atasan langsung = leader departemen (orang sama) | L2 dilewati (anti-dobel) |
| Setelah semua dilewati, tidak ada tersisa | Cadangan **Finance (L3)**, atau **Super Admin (L4)** bila pemohonnya Finance |

Baris cadangan muncul dengan label `3 (Cadangan Finance)` dan tetap perlu
diapprove manusia — ini berbeda dari perilaku lama yang langsung Approved.

```
Employee (Budi)                    Line Manager (Hendra)              Division Head (Michael)
     │                                        │                                        │
     │  1. Buat Travel Request                │                                        │
     │     /admin/travel-requests/create      │                                        │
     │     Status: Submitted                  │                                        │
     │     Rantai: [L1 pending → L2 queued] ──▶ 2. L1 pending muncul di               │
     │                                        │    Queue Hendra (yang dituju)          │
     │                                        │  3. Hendra Setujui + catatan          │
     │                                        │     L1 approved; L2 aktif (pending),   │
     │                                        │     TR → "In Review"; notifikasi ─────▶ 4. L2 pending muncul di
     │                                        │                                        │    Queue Michael
     │                                        │                                        │  5. Michael Setujui
     │                                        │                                        │     L2 approved → TR Approved +
     │                                        │                                        │     baris "Auto" (Level 5 diteruskan
     │                                        │                                        │     ke travel desk)
     │◀──────── Status TR: Approved + "Policy Approved", notifikasi + email masuk ─────┘
```

**Yang dilihat penonton:** badge status di halaman detail berubah
`Submitted` → `In Review` → `Approved`; stepper menampilkan tiap tahap
(pending = AKTIF, approved, queued, cancelled) + chip **"Plt a/n"** bila
diputus Plt; item pindah dari tab **Menunggu** ke **Riwayat**.
Aturan main: hanya baris `pending` yang bisa diputus (selainnya 409),
hanya approver yang dituju/Plt-nya (selainnya 403),
tidak boleh menyetujui milik sendiri (403),
pemohon harus dalam wilayah kerja approver (403 "di luar wilayah kerja Anda"),
reject menghentikan rantai (sisa `queued` → `cancelled`).
Dokumen pendukung bisa diunggah di tab Dokumen halaman detail.

**Batch approve bersifat all-or-nothing** (`ApprovalChain::batchDecide`):
item yang tidak eligible ditolak *sebelum* ada efek samping, lalu sisanya
diproses dalam satu `DB::transaction`. Satu kegagalan = seluruh batch batal
(termasuk notifikasi & job email yang ikut rollback karena antrean DB).
Respons gagal: `422 + { failed: [{ id, level, reason }] }` agar UI bisa
menampilkan item mana yang bermasalah.

## 4. Flow 2 — Uang Muka (Kas Bon)

```
Employee (Budi)                              Finance (Ratna)
     │                                              │
     │  1. "Ajukan Uang Muka Baru"                  │
     │     Status: Pending Finance ─────────────────▶ 2. Tab Uang Muka → Setujui
     │                                              │    Status: Approved - Ready to Pay
     │                                              │  3. Klik Disburse → isi nomor referensi
     │                                              │     bank (wajib) + file bukti ──▶ Paid
     │◀──────── Notifikasi + email "dana ditransfer" ┘
```

## 5. Flow 3 — Reimbursement / Settlement

```
Employee (Budi)                              Finance (Ratna)
     │                                              │
     │  1. Klaim reimbursement                      │
     │     Status: Menunggu Audit ──────────────────▶ 2. Klik Verifikasi
     │                                              │  3. Klik Setujui Settlement ──▶ Disetujui
     │◀──────── Notifikasi + email hasil verifikasi ─┘
```

## 6. Flow 4 — Delegasi (Plt, sudah diberlakukan di approval)

```
Division Head (Michael)                      Line Manager (Hendra)
     │                                              │
     │  1. Buat delegasi → Hendra                   │
     │     (scope Penuh, maks. nominal, periode)    │
     │     Status: Aktif ───────────────────────────▶ 2. Antrean Level 2 milik
     │                                              │    Michael ikut tampil di
     │                                              │    queue Hendra
     │                                              │  3. Hendra Setujui → tercatat
     │                                              │    "Plt a/n Michael" (chip di
     │                                              │    antrean + riwayat + audit)
     │  4. Cabut kapan saja (Revoke)                │
```

Batasan yang ikut dites: nominal di atas `max_amount` → 403,
scope `Tiket` tidak berlaku untuk antrean non-travel,
delegasi kedaluwarsa/di-nonaktifkan (`settings`) → wewenang hilang.

## 7. Dashboard & Badge per Role

Satu halaman `/admin`, isinya menyesuaikan role (data backend-nya pun
sudah ter-scope, jadi tiap role memang hanya menerima datanya sendiri):

| Role | KPI | Bagian lain |
|---|---|---|
| Employee | Pengajuan Saya / Menunggu / Disetujui / Ditolak | Tabel pengajuan sendiri + tombol Buat Request (tanpa grafik) |
| Line Manager | Tim, Menunggu Saya, Disetujui, Perlu Tindakan | Tabel tim + approve/tolak cepat |
| Division Head | Budget departemen + progress plafon, Antrean L2, Proyek Aktif | Grafik + tabel divisi |
| Finance | Verifikasi Pending, Kas Bon Pending, Siap Disburse, Total Disbursed | Link kerja ke Reimbursement / Uang Muka |
| Super Admin | KPI global + jumlah pengguna | Semua bagian |

Badge sidebar juga dinamis per user (`GET /dashboard/sidebar-badges`):
angka Approval = antrean pending yang terlihat user itu (kosong = badge
hilang), angka Notifikasi = unread miliknya. Tidak ada lagi angka hardcoded.

## 8. Skenario Negatif (untuk demo keamanan role)

1. Login sebagai **Budi (Employee)** → menu Approval Queue dan Management
   **tidak tampil**; buka URL langsung (`/admin/approval-queue`) → dilempar
   ke dashboard. Menu Uang Muka & Reimbursement **tampil** (daftar ter-scope
   miliknya + bisa mengajukan sendiri), tetapi tombol Setujui/Disburse/
   Verifikasi **tidak tampil**; paksa via API → **403**.
2. Paksa via API: `POST /api/approval-queue/1/decide` dengan token Budi →
   **403** `{ "message": "Akses ditolak untuk role Anda." }`.
3. Login sebagai **Hendra (L1)** coba approve antrian **Level 2** → **403**
   ("bukan wewenang role Anda").
4. **Self-approval**: Hendra coba approve pengajuan miliknya sendiri → **403**
   ("Tidak boleh menyetujui pengajuan milik sendiri"), berlaku untuk semua role.
5. **Lintas tim**: Hendra (L1) coba approve request level-1 milik karyawan
   yang **bukan bawahannya** → **403** ("di luar wilayah kerja Anda").
   Berlaku juga untuk batch: satu item di luar scope membatalkan seluruh batch.
6. **Plt kebablasan**: delegasi `max_amount` Rp100rb dipakai approve Rp1jt → **403**.
7. **Hapus data beranak**: hapus travel request yang sudah punya approval →
   **409** + pesan jelas (bukan error 500).
8. **Batalkan pasca-approval**: pemohon `PUT {status:'Cancelled'}` setelah
   L1 menyetujui → **409** ("sudah memiliki keputusan approval").
9. **PUT status langsung**: pemohon/SA `PUT {status:'Rejected'}` atau
   `{status:'Approved'}` (self-approve pintu belakang) → **403**
   ("hanya melalui jalur approval (decide)").
10. **Tulis badge manual**: `PUT {policy_status:'Sesuai'}` → **403**
    ("dihitung otomatis oleh sistem").
11. **Reject berjenjang tetap hidup**: L2 menolak via `decide()` setelah L1
    menyetujui → **200**, TR `Rejected` (aturan di atas hanya mengunci jalur
    PUT, bukan `decide`).
12. **Tolak tanpa alasan**: `decide`/`verify` reject tanpa `note` → **422**
    ("Alasan penolakan wajib diisi").
12. **Statistik ter-scope**: Budi lihat dashboard total = miliknya saja,
    Super Admin lihat total global.
13. **Notifikasi orang lain**: PATCH `/api/notifications/{id-milik-orang}` →
    **403** (hanya pemilik atau Super Admin).
14. **Oprek antrean langsung**: POST/PATCH/DELETE `/api/approval-queue`
    oleh non-Super Admin → **403** (baris antrean hanya dibangun
    `ApprovalChain::build`, perbaikan manual khusus Super Admin).
15. **Direktori user ter-scope**: Budi `GET /api/users` hanya melihat
    dirinya sendiri; Hendra melihat dirinya + bawahan; Ratna & admin
    melihat semua.

## 9. Naskah Demo 5 Menit (urutan klik)

1. Login **Budi** → Dashboard versi employee → Buat Request
   (`/admin/travel-requests/create`) → isi estimasi → panel Pratinjau
   Otomatis menampilkan rantai + badge policy (Sesuai/Deviasi) → submit →
   tunjukkan status *Submitted*; tunjukkan badge sidebar milik Budi.
2. Logout, login **Hendra** → Dashboard versi manager → Approval Queue
   tab Menunggu → Setujui + catatan → item pindah ke Riwayat.
3. Login **Michael** → Setujui Level 2 → buka detail TR → badge **Approved**;
   tunjukkan dashboard versi head (budget departemen).
4. (Opsional Plt) Michael buat delegasi → Hendra; login **Hendra** →
   setujui antrean Level 2 → tampil chip **"Plt a/n Michael"**.
5. Login **Ratna** → verifikasi reimbursement → disburse uang muka
   (isi nomor referensi + bukti) → tunjukkan notifikasi + email ke Budi.
6. Login **Budi** → Notifikasi: pengajuan disetujui. Selesai.
