# Studi Kasus: Tiga Hari Menegangkan di Rungkut

*Panduan lengkap SixAgo Enterprise Travel Governance — dari satu perjalanan dinas
di Surabaya sampai seluruh 17 halaman aplikasi, 5 role, dan 4 level approval.
Tidak ada satu pun fitur yang lolos dari dokumen ini.*

> **Dokumen pendamping:** `USERFLOW.md` (alur per role ringkas) ·
> `ARCHITECTURE.md` (arsitektur & kontrak API) · `AGENTS.md` (aturan kerja repo).
>
> **Cara memakai dokumen ini:**
> - **Bagian A** dibaca sebagai cerita — cocok untuk presentasi ke manajemen.
> - **Bagian B** dibaca sebagai panduan — cocok untuk orang yang mau menjalankan
>   sistem atau belum understand fiturnya.
> - **Bagian C** adalah referensi cepat (matriks, kamus error, peta endpoint).
> - **Bagian D** berisi hal yang **belum** dikerjakan — baca sebelum demo ke
>   klien agar tidak memberi janji yang tidak bisa ditepati.
> - **Bagian E** adalah naskah demo klik-per-klik 15 menit.

---

## DAFTAR ISI

| Bagian | Isi |
|---|---|
| **A. Narasi** | §1 Latar · §2 Pengajuan · §3 Level 1 · §4 Level 2 & tiket otomatis · §5 Kas bon & settlement · §6 Adegan baru: Level 3 Finance · §7 Adegan baru: penolakan · §8 Adegan baru: batch approve · §9 Skenario keamanan |
| **B. Panduan fitur** | B.0 Peta halaman · B.1 Employee · B.2 Line Manager · B.3 Division Head · B.4 Finance · B.5 Super Admin · B.6 Lintas-peran |
| **C. Referensi** | C.1 Matriks kapabilitas · C.2 Kamus error · C.3 Peta endpoint · C.4 Data demo · C.5 Menjalankan demo |
| **D. Batasan** | D.1 Backend ada, UI tidak · D.2 UI ada, belum tersambung · D.3 Inkonsistensi domain · D.4 Catatan arsitektur |
| **E. Penutup** | E.1 Manual vs SixAgo · E.2 Naskah demo 15 menit |

---

# BAGIAN A — NARASI

## 1. Latar: ada apa di Surabaya?

PT Nusantara Dinamika mengoperasikan Data Center Rungkut, Surabaya.

Senin pagi, tim monitoring melihat suhu lorong rak naik — kipas redundan mati.
**Budi Santoso** (Engineer P4, IT & Rekayasa Sistem) harus terbang sehari
sebelum tim lain. Estimasi biaya: **Rp9.450.000** (tiket, hotel 4 malam, per
diem, transport lokal) — dibebankan ke proyek **PRJ-2025-01**.

Angka Rp9,45jt ini penting karena ia menentukan **seluruh bentuk** cerita ini:

| Estimasi | Rantai yang dibentuk otomatis |
|---|---|
| ≤ Rp5.000.000 | Level 1 saja |
| > Rp5jt s.d. Rp15jt | Level 1 → Level 2 |
| > Rp15jt s.d. Rp50jt | Level 1 → Level 2 → Level 3 (Finance) |
| > Rp50jt | Level 1 → Level 2 → Level 3 → Level 4 (Super Admin / CFO) |

Rp9,45jt berada **di atas** Rp5jt (maka Level 2 ikut) tapi **di bawah** Rp15jt
(maka Level 3 Finance **tidak** ikut). Rantai Budi hanya **L1 → L2**. Inilah
cara SixAgo menentukan rantai secara otomatis dari nominal — bukan tebakan,
bukan dropdown "mau approval ke siapa?".

Aktor dalam cerita ini, semuanya akun seed demo dengan password `password123`:

| Tokoh | Peran dalam sistem | Peran dalam cerita |
|---|---|---|
| **Budi Santoso** | Employee (P4, IT & Rekayasa) | Yang perlu dana dan perlu persetujuan |
| **Hendra Gunawan** | Line Manager (atasan langsung Budi) | Atasan yang menyetujui L1 |
| **Michael Wijaya** | Division Head / Kepala Divisi IT | Yang memutus L2, pemilik anggaran |
| **Ratna Paramita** | Finance Approver | Verifikasi, pencairan, settlement, L3 |
| **Administrator** | Super Admin | Root & konfigurasi, L4 |

---

## 2. Adegan 1 — Pengajuan (Senin, 09.30)

Budi membuka `/admin/travel-requests/create`, memilih proyek PRJ-2025-01,
mengisi rute `CGK → SUB`, moda Garuda Indonesia, tanggal 18–22 Mei, durasi
5 hari, dan estimasi Rp9.450.000. Saat ia menekan **Ajukan Perjalanan**, sistem:

1. Menyimpan TR bernomor `TR-2025-104`, status **`Submitted`**.
2. Membaca struktur organisasi: atasan langsung Budi adalah **Hendra**, leader
   departemen IT adalah **Michael**.
3. Membentuk dua baris antrean:
   - `1 of 2` → status **`pending`** (aktif), `approver_id` = Hendra,
     `sla_due_at` = +24 jam.
   - `2 of 2` → status **`queued`** (menunggu giliran), `approver_id` = Michael.
4. Mengirim notifikasi dan email ke Hendra. Badge sidebar "Approval" Hendra
   berubah dari kosong menjadi `1`.

Yang **tidak** terjadi: tidak ada grup WhatsApp, tidak ada form kertas, tidak
ada yang perlu menebak "ini harus approve ke siapa?".

Rincian langkah demi langkah: **[B.1.2](#b12-membuat-travel-request)**.

---

## 3. Adegan 2 — Level 1: Hendra menyetujui (Senin, 14.15)

Hendra membuka **Approval Queue** (`/admin/approval-queue`). Yang ia lihat
**hanya** antrean yang memang ditujukan kepadanya — bukan seluruh antrean
perusahaan, dan bukan Level 2 milik Michael. Ia membaca justifikasi, menulis
catatan *"Disetujui sesuai urgensi."*, lalu menekan **Setujui**.

Di balik layar, satu keputusan itu menggerakkan rantai:

- Baris L1 → `approved`, tercatat `decided_by` = Hendra, `decided_at`, dan `note`.
- Baris L2 → berubah dari `queued` menjadi **`pending`**, lengkap dengan batas
  SLA 24 jam yang **dihitung ulang dari momen ini**.
- Status TR → **`In Review`**.
- Michael menerima notifikasi dan email: giliran Anda.

Di halaman detail, stepper Budi berubah: **L1 hijau (Approved • Hendra)**,
**L2 kuning (AKTIF)**. Tidak ada lagi status "macet" yang ambigu — kalau
menunggu, tahu sedang menunggu siapa.

---

## 4. Adegan 3 — Level 2 dan tiket otomatis (Selasa, 10.00)

Michael memeriksa sisa plafon departemennya (IT & Rekayasa Sistem:
**Rp224.000.000 dari Rp350.000.000** terpakai) di dashboard versinya, lalu
menyetujui. Karena Level 2 adalah **level manusia terakhir** untuk nominal
sebesar ini:

- TR menjadi **`Approved`**, dengan `policy_status` = **`Policy Approved`**.
- Sistem otomatis membuat baris **Level 5 — Auto-Ticketing**
  (`decided_by` kosong — memang sistem, bukan manusia, `sequence` = 99),
  artinya *"diteruskan ke travel desk"*.
- Budi menerima notifikasi dan email persetujuan.

> **Catatan jujur.** SixAgo **tidak** menerbitkan tiket pesawat sungguhan —
> tidak ada integrasi maskapai. Yang otomatis adalah *administrasinya*: status,
> jejak audit, dan pemberitahuan ke semua pihak. Tiket fisik tetap diterbitkan
> travel desk rekanan. Kartu "Penyedia Terkoneksi (Garuda / Accor & Marriott)"
> di halaman kebijakan bersifat **informasi**, bukan koneksi API — lihat
> [D.2](#d2-ui-ada-tapi-belum-tersambung-ke-backend).

---

## 5. Adegan 4 — Kas bon dan settlement (Jumat–Senin)

Sebelum berangkat, Budi mengajukan uang muka **Rp5.000.000** untuk perjalanan
ini. Ratna (Finance) menyetujui, lalu mencatat pencairan dengan **nomor
referensi bank plus file bukti transfer** — bukan sekadar tombol "cair" yang
tidak bisa diaudit. Status menjadi **`Paid`**, Budi menerima email.

Pulang dari Surabaya, pengeluaran riil Budi **Rp9.350.000**. Sistem menghitung
rekonsiliasi otomatis:

```
Realisasi              Rp9.350.000
Uang muka              -Rp5.000.000
                       ─────────────────────
Reimbursable            +Rp4.350.000
```

Ratna memverifikasi bukti (status `Menunggu Audit` → `Menunggu Verifikasi
Finance`), lalu menyetujui settlement (`Disetujui`). Selesai — semua angka
bisa ditelusur balik ke dokumennya.

Catatan operasional yang sering terlewat: **uang muka lebih besar dari
realisasi tidak dibayar balik.** Kalau Budi hanyaelligentlya realizes
Rp4.200.000, sistem menghasilkan `−Rp800.000` yang berarti *sisa kas bon yang
harus dikembalikan*, bukan bonus. Matriks rekonsiliasi di halaman
Reimbursement menandai nilai berawalan `+` sebagai reimburse, sisanya sebagai
pengembalian.

---

## 6. Adegan 6 -- Level 3 Finance ikut serta (Senin sore, skenario live)

> **Nilai fiktif — bukan data seed.** Buat saat demo lewat UI, tidak perlu
> seeding. Tujuannya menunjukkan ambang Rp15jt.

Rabu malam, keadaan berubah. Divisi Head mendapat proyek enterprise baru:
survey tiga kota (Surabaya–Bandung–Semarang) untuk persiapan implementasi.
Budi membuat pengajuan baru: **Rp24.750.000**, dibebankan ke proyek yang sama.

Kali ini angka itu **melewati** Rp15jt. Saat tombol ditekan, `ApprovalChain`
membangun **tiga** baris, bukan dua:

| Baris | Label | Status awal | Dituju ke |
|---|---|---|---|
| 1 | `1 of 3` | `pending` | Hendra (Line Manager) |
| 2 | `2 of 3` | `queued` | Michael (Division Head) |
| 3 | `3 of 3` | `queued` | **Ratna (Finance Approver)** |

Perhatikan detail teknisnya: **Level 3 adalah "pool", bukan orang.**
`approver_id` untuk L3 bernilai `null` — artinya *siapapun* dengan role
`Finance Approver` berhak memutus, dan sistem tidak memaksa ke satu orang
tertentu. Perbedaan ini penting saat demo: login Ratna, dan antrean itu
langsung ada di-workers list-nya, tidak perlu "di-assign" ke dia.

Setelah Hendra dan Michael menyetujui, Ratna memegang giliran. Di sini pembeda
dari L1/L2 terlihat jelas: Ratna tidak bisa ditolak dengan alasan "di luar
wilayah kerja" — Finance memang **tidak** dibatasi oleh `isOutOfScope` (lihat
[C.2](#c2-kamus-error-403-409-422)). Yang tetap berlaku adalah larangan
self-approval dan kewajiban mencatat keputusan.

Setelah disetujui: TR `Approved` plus baris `Auto` (travel desk), sama seperti
 reimbursement yang lain.

---

## 7. Adegan 7 — Penolakan: rantai yang dihentikan (eksperimen live)

> **Nilai fiktif.** Rp52.000.000 — sengaja **di atas** Rp50jt agar Level 4
> (Super Admin) ikut masuk, sehingga efek reject pada level tinggi terlihat.

Untuk kebutuhan proyek yang sama, Budi mengajukan **Rp52.000.000**: refresh
perangkat keras data center plus 4 hari konsultan eksternal di Jakarta. Empat
level akan dilalui: L1 → L2 → L3 → L4.

Hendra dan Michael menyetujui. Ratna menyetujui. Sekarang giliran Super
Admin — dan di titik ini Michael memutuskan untuk **menolak**, karena ada
perbedaan antara *anggaran tersedia* dan *kebutuhan nyata*: refresh perangkat
keras bisa dipecah menjadi dua fase.

Apa yang terjadi di dalam sistem, secara presisi:

1. Baris L2 berubah `queued` → `rejected`, `decided_by` = Michael, `note` diisi.
2. **Semua baris yang masih `queued` (yaitu L3 dan L4) otomatis berubah
   `cancelled`** dengan note sistem: *"Dibatalkan otomatis (rantai dihentikan)."*
   Inilah yang membedakan `cancelled` dari `rejected` — `rejected` adalah
   keputusan manusia; `cancelled` adalah konsekuensi, tidak pernah ada yang
   menekan apa pun.
3. TR → **`Rejected`**, `policy_status` → **`Ditolak`**.
4. Notifikasi dan email ke Budi, menyebut siapa yang menolak dan atas nama siapa.

Di stepper halaman detail, Budi melihat: L1 hijau, L2 merah (Rejected • Michael
beserta note-nya), L3 dan L4 abu-abu dengan tulisan **"Dibatalkan (rantai
dihentikan)"**. Tidak ada satu pun baris yang terlihat hilang.

**Konsekuensi lanjutan yang jarang dibahas:** TR berstatus `Rejected` **tidak
lagi bisa di-approve** — `ApprovalChain::decide()` melempar **409** *"Antrean ini
sudah diputus sebelumnya"* pada baris mana pun yang pernah diputus. Tidak ada
tombol "buka lagi". Budi harus mengajukan **TR baru** — dan TR baru mendapat
nomor baru. Ini disengaja: approvals yang sudah diputus tidak boleh dihapus
dari jejak audit.

---

## 8. Adegan 8 — Batch approve yang gagal utuh (demo keamanan)

> **Kasus nyata:** Hendra punya 5 antrean L1 tertunda. Ia centang 4 dan menekan
> **Batch Approve Terpilih**. Hasilnya: **tidak ada satu pun yang terproses.**

Sistem punya dua lapis perlindungan:

1. **Pre-filter** — sebelum ada efek samping apa pun (notifikasi, email,
   audit), sistem menyaring kelayakan tiap item: apakah level-nya wewenang
   Hendra? apakah bukan miliknya sendiri? apakah pemohonnya di dalam wilayah
   kerjanya?
2. **DB transaction** — kalau lolos pra-filter tapi gagal di tengah, seluruh
   batch dibatalkan. Karena antrean email memakai `QUEUE_CONNECTION=database`,
   job di tabel `jobs` **ikut rollback** bersama transaksinya.

Respons gagal:

```json
422
{
  "message": "2 dari 4 pengajuan tidak dapat diproses oleh role Anda. Tidak ada perubahan yang disimpan.",
  "failed": [
    { "id": 12, "level": "1 of 2", "reason": "Tidak boleh menyetujui pengajuan milik sendiri." },
    { "id": 19, "level": "1 of 2", "reason": "Pengajuan ini berada di luar wilayah kerja Anda." }
  ]
}
```

UI menampilkan toast berisi alasan, item mana yang bermasalah, dan pernyataan
yang eksplisit: **tidak ada perubahan yang disimpan**. Bandingkan dengan sistem
lama, di mana 2 dari 4 biasanya lolos diam-diam dan baru ketahuan minggu depan
saat rekonsiliasi.

Ada dua batch approve yang berbeda dan harus dibedakan saat demo:

| Tombol | Endpoint | Siapa boleh |
|---|---|---|
| **Batch Approve** di halaman Travel Requests | `POST /travel-requests/batch-approve` | Line Manager, Division Head, **Super Admin** |
| **Batch Approve Terpilih (n)** di Approval Queue | `POST /approval-queue/batch-approve` | Line Manager, Division Head, **Finance Approver**, Super Admin |

Finance Approver **tidak punya** batch approve travel request (flag
`canBatchApproveTravel` di `stores/app.ts` sengaja mengecualikannya), tapi
**punya** batch approve antrean. Ini bukan bug — `routes/api.php` di backend
membatasi `travel-requests/batch-approve` ke LM/DH/SA.

---

## 9. Adegan 9 — "Bagaimana jika..." (demo keamanan)

Skenario ini bagus didemokan langsung karena semuanya **dijawab sistem**, bukan
narasi:

1. **Hendra cuti saat antrean datang?** Michael membuat delegasi (scope Penuh,
   maks. nominal, periode). Hendra sebagai Plt melihat antrean Michael dan
   menyetujui — tercatat **"Plt a/n Michael"** (chip di antrean, di riwayat, di
   audit, dan di email). Lewat nominal atau periode? **403**.
2. **Michael iseng menyetujui pengajuannya sendiri?** **403** — berlaku untuk
   semua role, termasuk Super Admin.
3. **Hendra menyerobot antrean Level 2?** **403**: baris masih `queued`, dan
   kalau sudah `pending`, ia bukan orang yang dituju — "Hanya approver yang
   dituju (atau Plt-nya)".
4. **Hendra menyetujui request level-1 milik karyawan divisi lain?** **403**
   "Pengajuan ini berada di luar wilayah kerja Anda." Berlaku juga untuk
   batch: satu item di luar scope membatalkan seluruh batch.
5. **Admin menghapus TR yang sudah berjalan?** **409** dengan pesan jelas —
   riwayat audit tidak boleh hilang diam-diam. Setelah tiga tahun, isi dokumen
   boleh berubah, tapi angka dan jejaknya tetap bisa diaudit.
6. **Budi mengintip data divisi lain?** Dashboard, direktori user, dan
   statistiknya hanya berisi datanya sendiri. Ia **bisa** membuka halaman
   Uang Muka dan Reimbursement (daftar ter-scope miliknya) dan mengajukan
   untuk travel-nya sendiri — tetapi tombol Setujui/Disburse/Verifikasi
   tidak tampil, dan API menjawab 403 bila dipaksa.
7. **Menonaktifkan approver yang masih punya antrean pending?** Tidak didukung
   — lihat [D.2](#d2-ui-ada-tapi-belum-tersambung-ke-backend); sistem membiarkan antrean
   itu menggantung (override Super Admin tetap bisa memutus).

---

# BAGIAN B — PANDUAN FITUR LENGKAP

> **Cara membaca subbab ini:** setiap subbab memakai pola
> **Peran → Halaman → Yang dilakukan → Yang terlihat di layar → Endpoint → Jebakan.**

## B.0 Peta 17 Halaman

| # | Halaman | Rute | Siapa boleh | Flag gate |
|---|---|---|---|---|
| 1 | Login | `/login` | Publik | — |
| 2 | Ganti Password | `/password` | Semua (wajib saat `must_change_password`) | `PROTECTED_PATHS` |
| 3 | Profil & keamanan | `/profil` | Semua | `PROTECTED_PATHS` |
| 4 | Dashboard adaptif | `/admin` | Semua | — (isi varies by `roleKey`) |
| 5 | Travel Requests | `/admin/travel-requests` | Semua | data ter-scope backend |
| 6 | Buat Travel Request | `/admin/travel-requests/create` | Semua | — |
| 7 | Detail Travel Request | `/admin/travel-requests/{id}` | Semua | aksi: `canDecideQueue` |
| 8 | Approval Queue | `/admin/approval-queue` | LM, DH, FA, SA | `canDecideQueue` |
| 9 | Uang Muka | `/admin/uang-muka` | FA, SA | `canFinance` |
| 10 | Reimbursement | `/admin/reimbursement` | FA, SA | `canFinance` |
| 11 | Notifikasi | `/admin/notifications` | Semua | unduh audit: `canDecideQueue` |
| 12 | Pengguna & Role | `/admin/management/users` | **SA** | `isSuperAdmin` |
| 13 | Kebijakan Perjalanan | `/admin/management/travel-policy` | **SA** | `isSuperAdmin` |
| 14 | Proyek | `/admin/management/projects` | **SA** | `isSuperAdmin` |
| 15 | Departemen & Role | `/admin/management/departements` | **SA** | `isSuperAdmin` |
| 16 | Alur & Level Approval | `/admin/management/approval-levels` | **SA** | `isSuperAdmin` |
| 17 | Delegasi Approval | `/admin/management/delegation` | **LM, DH, SA** | `showDelegation` |

> Tepat satu pengecualian dari blok "Management = Super Admin": **Delegasi**.
> Alasan di kode: delegasi harus bisa dibuat oleh **delegator-nya sendiri**,
> sehingga Line Manager dan Division Head pun boleh. Finance Approver justru
> tidak, karena mereka tidak punya level approval yang khas untuk dilimpahkan.

Tiga stub redirect 302 tersedia untuk bookmark lama: `/admin/login` → `/login`,
`/admin/password` → `/password`, `/admin/profil` → `/profil`.

**Gating berjalan dua lapis.** Frontend menyembunyikan menu dan tombol yang
tidak sesuai role (`ROLE_ROUTES` di middleware + flag di `stores/app.ts`).
Kalau dipaksa lewat URL, middleware melempar balik ke `/admin`. Dan kalau
dipaksa langsung lewat API, backend menjawab **403**. Untuk demonstrasi
keamanan, tunjukkan keduanya.

---

## B.1 — Employee (Budi Santoso)

### B.1.1 Dashboard versi Employee

**Halaman:** `/admin` (`roleKey` = `employee`)

Yang **tidak** ada di sini dibanding role lain: **grafik batang tren 6 bulan dan
donut distribusi per divisi** — keduanya disembunyikan. Alasannya bukan sekadar
estetika: data yang tidak relevan untuk scope dia tidak perlu dikirim.

KPI (4): **Pengajuan Saya · Menunggu · Disetujui · Ditolak**, plus tabel
pengajuan sendiri dan tombol **Buat Request**.

Aksi cepat di tabel:
- **✓ Setujui** — hanya untuk role dengan `canBatchApproveTravel`. **Employee
  tidak punya.** Jadi di akun Budi, ikon ini tidak pernah muncul.
- **✕ Tolak — dihapus.** Penolakan hanya lewat jalur approval (`decide`)
  yang teraudit; `PUT {status:'Rejected'}` kini selalu 403 backend, jadi
  tombol quick-reject tidak ada untuk role mana pun.

### B.1.2 Membuat Travel Request

**Halaman:** `/admin/travel-requests/create`

Delapan field. Enam wajib: **Proyek · Rute · Moda Transportasi · Tanggal Mulai ·
Tanggal Selesai · Estimasi Biaya**. Sisanya opsional: **Durasi** dan
**Keperluan/Tujuan** (textarea, yang isinya menjadi kolom `justification` di
antrean — jadi di sinilah alasan ditulis, bukan di kolom terpisah).

Validasi: cek kelengkapan di sisi klien dulu (toast, tanpa memanggil API),
ditambah atribut HTML `required`; tanggal selesai tidak boleh mendahului
mulai (dicek live + `min` + diblokir saat submit). Rute dinormalisasi
(trim/spasi-ganda/huruf besar) saat blur + di backend saat simpan.

`user_id` selalu diisi dari `app.user.id` — **tidak ada opsi behalf**. Tidak ada
yang bisa mengajukan atas nama orang lain lewat UI ini.

Setelah sukses: toast "Pengajuan {request_no} berhasil dibuat, diteruskan ke
Level 1", lalu **otomatis pindah ke halaman detail** TR tersebut.

> **Tips demo:** isi Estimasi Biaya dengan angka berbeda setiap kali
> (Rp4jt / Rp9,45jt / Rp24,75jt / Rp52jt) dan tunjukkan halaman detail —
> jumlah level di stepper akan berubah. Ini adegan yang paling meyakinkan di
> seluruh demo, karena ia membuktikan aturan nominal bekerja nyata.
>
> Di bawah form ada **panel Pratinjau Otomatis**: setiap mengetik estimasi
> (+ tanggal bila diisi), form memanggil `POST /approval-simulate` dan
> menampilkan **rantai yang akan terbentuk** ("L1 → L2 → L3") beserta **badge
> policy** ("Sesuai" hijau / "Deviasi N%" amber + kode policy). Tidak ada efek
> samping — murni pratinjau dengan aturan yang sama persis seperti eksekusi.

### B.1.3 Detail Travel Request — halaman paling fitur

**Halaman:** `/admin/travel-requests/{id}`

Empat tab:

**Tab 1 — Rincian Biaya.** Identitas pemohon (nama, NIK, jabatan, departemen),
itinerary, tabel rincian biaya, rekening tujuan, dan **stepper rantai approval**.

Stepper adalah inti halaman ini. Setiap baris antrean menjadi satu step, dengan:
- **Judul** dipetakan dari urutan chain: `Level 1 - Line Manager`,
  `Level 2 - Kepala Divisi (HOD)`, `Level 3 - Finance & Treasury`,
  `Level 4 - CFO`, dan `Auto-Ticketing & Cash` untuk baris `Auto`.
- **Warna status:** `pending` → **kuning + label "AKTIF"** dengan sorotan amber,
  `approved` → hijau, `rejected` → merah, `queued` → abu-abu, `cancelled` →
  abu-abu dengan teks **"Dibatalkan (rantai dihentikan)"**.
- **Chip delegasi:** kalau diputus melalui Plt, muncul chip
  **"Plt a/n {nama}"** beserta catatan dan waktu `decided_at` (locale id-ID).
- **Progress bar** di bawah: jumlah step selesai dibagi total step.

Ada **empat tombol keputusan** di panel bawah — hanya tampil jika
`canDecideQueue` (LM/DH/FA/SA). Kalau tidak, muncul teks "Hanya approver
berwenang yang dapat memutus pengajuan ini."

| Tombol | Yang dikirim | Efek status |
|---|---|---|
| **Setujui** | `POST /approval-queue/{id}/decide { action: 'approve' }` | `In Review` → `Approved` |
| **Tolak** | `POST /approval-queue/{id}/decide { action: 'reject' }` | → `Rejected` |
| **Minta Revisi** | `POST /notifications { category: 'approval' }` | **tidak berubah** |
| (input catatan) | ikut pada payload `decide` | — |

> **"Minta Revisi" adalah fitur yang sering disalahpahami.** Ia **tidak**
> mengubah status apa pun dan **tidak** lewat `ApprovalChain`. Ia hanya
> mengirim notifikasi ke pemohon dengan `reference_id` = nomor TR. Status tetap
> `Submitted`, baris tetap `pending`, dan pemohon **tidak** punya tombol
> "Ajukan Ulang" di UI. Artinya: ini fitur komunikasi, bukan fitur workflow.
> Kalau klien berharap ini memicu revisi lalu kirim ulang otomatis, itu belum
> ada — lihat [D.1](#d1-fitur-backend-ada-tapi-tidak-bisa-diakses-dari-ui).

**Tab 2 — Dokumen** (dengan badge jumlah di judul). Form unggah: **Judul**
(wajib), **Tipe** (`tiket` / `hotel` / `nota` / `pendukung`), **File** (maks
**10MB**, hanya PDF dan gambar). Dikirim sebagai `multipart/form-data`.

Siapa boleh mengunggah: `isSuperAdmin || canFinance || pemilik request`. Jadi
**Line Manager dan Division Head tidak bisa** — hanya Finance, Super Admin, dan
si pemilik.

Dokumen yang sudah ada ditampilkan sebagai grid; klik **Preview** membuka
`file_url`. Karena backend menyimpan path **root-relative** (`/storage/...`),
frontend wajib mengabsolutkannya ke origin API — itulah gunanya fungsi
`docHref()`. Tanpa itu, link mati.

**Tab 3 — Reimbursement.** Klaim yang terkait TR ini beserta angka
rekonsiluasinya.

**Tab 4 — Audit Log.** Riwayat keputusan dari baris antrean: siapa, kapan,
approve atau reject, atas nama siapa, dan catatannya.

Header halaman berisi: status badge, chip `policy_status`. Chip ini adalah
**badge kepatuhan yang dihitung backend saat pengajuan dibuat**
(`PolicyCheck`: total estimasi vs total plafon grade pemohon) — hijau
`Sesuai`, amber `Deviasi N%`. Setelah final, deviasi dipertahankan sebagai
`Policy Approved · Deviasi N%` agar jejak kepatuhan tidak hilang. Tombol
**Unduh PDF** (implementasinya `window.print()` —
yaitu print-to-PDF dari browser, bukan generasi PDF di server).

Tombol header di-gate per peran:
- **Ubah** — owner atau SA. Modal edit field (rute, transportasi, biaya,
  durasi, keperluan → `PUT`); **tidak pernah** mengirim `status`.
  Edit `cost`/tanggal menghitung ulang badge policy (kecuali TR final yang
  dibekukan sebagai sejarah).
- **Tolak** (jalur `decide` approver) — hanya `canDecideQueue`.
- **Batalkan Pengajuan** — hanya owner/SA **dan** status `Submitted`
  (pra-approval). Backend mengizinkan `Cancelled` hanya saat nol baris
  decided (409 bila sudah ada keputusan) dan ikut membekukan baris
  `pending`/`queued`.
- **Hapus** — owner/SA, modal konfirmasi. Backend 409 bila masih punya
  approval/uang muka/reimbursement/dokumen (pesan ditampilkan apa adanya);
  sukses → kembali ke daftar.

### B.1.4 Mengajukan Uang Muka

**Halaman:** `/admin/uang-muka` → tombol **Ajukan Uang Muka Baru**

Halaman ini **terbuka untuk semua role** — daftar ter-scope backend
(`visibleUserIds`: Employee hanya melihat miliknya), dan backend mengizinkan
pengajuan untuk travel milik sendiri (`AdvanceController@store`). Tombol
Setujui/Tolak/Disburse tetap khusus Finance (`canFinance`).

> **Perbaikan dari versi sebelumnya:** halaman ini dulu Finance-only di
> middleware, sehingga Employee tidak punya jalur pengajuan. Sekarang dibuka;
> yang di-gate hanyalah aksi keuangannya, bukan halamannya.

Field: **Travel Request** (wajib, link ke TR milik pemohon), **Nominal** (wajib),
**Plafon**, **Rekening**, **Atas Nama**, **Metode** (Bank Transfer atau Corporate
Card), **Keperluan**, **Tujuan**.

Setelah submit, status menjadi **`Pending Finance`**.

Anti salah nol: di bawah input nominal tampil live `= Rp ...`, dan submit
membuka konfirmasi berisi nominal terformat + metode. Tolak pengajuan lewat
modal beralasan wajib (bukan sekali klik).

### B.1.5 Mengklaim Reimbursement

**Halaman:** `/admin/reimbursement` → tombol **Ajukan Klaim** (terbuka semua
role, sama seperti uang muka).

Form: **Travel Request** (dropdown otomatis hanya berisi milik sendiri untuk
non-Finance), **Pengeluaran Riil** (wajib), **Uang Muka Diterima**, **Jumlah
Resi**. Status awal `Menunggu Audit` dengan `ocr_status` = `Belum
Diverifikasi`; rekonsiliasi (`+ Rp ... Reimbursable` / `- Rp ... Setor Balik
Kas`) dihitung otomatis backend. Tombol Verifikasi/Setujui Settlement/Tolak
tetap khusus Finance.

Status: `Menunggu Audit` → `Menunggu Verifikasi Finance` → `Disetujui` atau
`Ditolak`.

Form klaim menampilkan live `= Rp ...` + konfirmasi nominal sebelum submit;
tombol tolak membuka modal beralasan wajib (backend 422 bila kosong).

### B.1.6 Notifikasi

**Halaman:** `/admin/notifications`

- **Lima tab kategori dengan hitungan:** Semua · **Urgent (Butuh Tindakan
  Segera)** · Persetujuan & Tiket · Keuangan & Kas Bon · Sistem & Kebijakan.
- **Toggle "Belum Dibaca Saja"** → `unread_only=true`.
- **Search** (debounce 300ms) plus tombol **urutkan waktu** (terbaru/terlama,
  pembalikan list di sisi klien).
- **Tandai Semua Sudah Dibaca** → `POST /notifications/mark-all-read`; tandai
  satu item → `PATCH /notifications/{id}/read`.
- **Load More** menambah 20 item per klik (bukan paginasi server).
- **Quick link kontekstual** per kategori: kategori Urgent →
  `/admin/approval-queue`; Finance belum dibaca → `/admin/uang-muka` **dan**
  `/admin/reimbursement`; Sistem → kebijakan perjalanan.
- **Panel preferensi:** toggle **Email Notifikasi Keputusan** (benar-benar
  disimpan → `PUT /user/profile { email_notif_enabled }`, dengan rollback
  optimistis kalau gagal). Toggle "SLA Warning Alert Push" yang mati diganti
  info statis (peringatan SLA selalu via tab Urgent + badge; tidak ada push
  browser/mobile).

### B.1.7 Profil dan keamanan

**Halaman:** `/profil`

Editable: **Nama Lengkap**, **No. WhatsApp**, **URL Foto Profil** (input URL,
bukan unggah), toggle **Email Notifikasi Keputusan**. → `PUT /user/profile`.

Tombol **Keluar Semua Perangkat** → `POST /logout-all`, lalu logout lokal dan
kembali ke `/login`. Ini membatalkan seluruh token, bukan hanya perangkat ini.

Tidak bisa diedit sendiri: NIK, email, departemen, atasan langsung, grade, dan
role. Semua itu hanya Super Admin yang bisa ubah lewat halaman Pengguna.

---

## B.2 — Line Manager (Hendra Gunawan)

### B.2.1 Dashboard versi Manager

KPI (4): **Total Travel Request · Menunggu Approval · Budget Terpakai · Kas Bon
Pending**, plus tabel data tim dengan approve dan tolak cepat. Grafik
ditampilkan (Employee tidak melihatnya).

### B.2.2 Approval Queue — worklist utama

**Halaman:** `/admin/approval-queue`

**Empat tab kategori:** Semua · **Urgensi Tinggi** · Travel Request · Permintaan
Uang Muka. Tab "Urgensi Tinggi" menampilkan baris yang di-flag `urgent` (di
seed demo, `TR-2025-104` punya flag ini).

**Toggle Menunggu ↔ Riwayat.** "Menunggu" = `status=pending`. "Riwayat" =
`status=approved,rejected`. Perpindahan item antar tab terjadi otomatis karena
statusnya memang berubah.

Klasifikasi visual tiap kartu:
- Badge **Prioritas Tinggi** atau **Prioritas Normal** (dari `urgent`).
- Tag **Kas Bon** untuk tipe Uang Muka; ikon `flight_takeoff` untuk travel,
  `account_balance` untuk advance.
- Label nominal menyesuaikan: **"JUMLAH PENCAIRAN UANG MUKA"** versus
  **"ESTIMASI BIAYA PERJALANAN"**.
- Chip **"Plt a/n {nama}"** dengan `title` berisi "Diputus oleh {nama}".
- Di tab Riwayat: **"Diputus oleh {nama} (Plt a/n {x}) — terekam di tab
  Riwayat."**

**Aksi per kartu:**
- **Setujui** — langsung, tanpa modal.
- **Tolak** — membuka modal keputusan berisi:
  - **Empat preset catatan cepat** (chip) — klik mengisi textarea.
  - Textarea **"Catatan Keputusan Resmi (Terekam di Audit Log)"**.
  - Caption pengganti checkbox mati: *"Notifikasi dalam aplikasi selalu
    dikirim; email mengikuti preferensi notifikasi pemohon."*
  - **Alasan wajib**: modal tolak menolak submit bila catatan < 3 karakter;
    backend 422 bila kosong (berlaku juga untuk tolak uang muka &
    reimbursement yang kini lewat modal, bukan sekali klik).
- **Detail** — modal berisi rute, tanggal, estimasi biaya, justifikasi, level,
  dan status.

Kartu yang estimasinya melebihi plafon grade pemohon menampilkan **badge
amber `Deviasi N%`** (dari `travel_request.policy_status` yang sudah ada di
payload) — approver melihatnya sebelum memutus, tanpa membuka detail.

**Batch Approve Terpilih (n)** — `POST /approval-queue/batch-approve`,
all-or-nothing (lihat [§8](#8-adegan-8-batch-approve-yang-gagal-utuh-demo-keamanan)).

**Export Daftar (CSV)** — menarik `GET /exports/travel-requests` (endpoint yang
sama dengan halaman Travel Requests, bukan endpoint queue tersendiri).

Checkbox select dan select-all, serta tombol Tolak dan Setujui, hanya tampil
bila `canDecideQueue` **dan** status baris `pending`. Status non-pending otomatis
tidak bisa dicentang.

> **Dulu keempat KPI header adalah angka mock; sekarang semuanya nyata:**
> Perlu Tindakan (+ Urgent), Travel/Advance per kategori — dari endpoint antrean
> dengan `per_page=1` (hanya `meta.total` yang dibaca, ter-scope per role);
> Disetujui/Ditolak — dari `travel-requests-summary`; Kecepatan Respons —
> rata-rata `decided_at − created_at` dari 50 riwayat terakhir (diberi label
> jujur bila kosong). Tab kategori memakai hitungan yang sama.

### B.2.3 Travel Requests — filter, batch, ekspor

**Halaman:** `/admin/travel-requests`

**Tujuh tab status dengan hitungan** dari `GET /travel-requests-summary`:
Semua · Draft · Submitted · **In Review** · Approved · Rejected · Completed.
(Tab `Cancelled` **tidak** ada, meski statusnya bisa muncul setelah pembatalan.)

**Filter**, semuanya dikirim ke server:
- **Search** (debounce 300ms) → `?search=`
- **Departemen** → `?department=`
- **Proyek Strategis** → `?project=`
- **Rentang tanggal** `start_from` dan `start_to`
- **Reset Filter**

> **Jebakan teknis yang penting untuk integrasi:** dropdown Departemen dan
> Proyek mengirim **nama** (`name`), **bukan kode** (`code`), karena backend
> melakukan filter dengan `LIKE` pada kolom `name`. Nilai yang di-hardcode di
> frontend akan menghasilkan nol hasil. Opsi dropdownnya sendiri diambil dari
> API — jangan pernah menulis daftar statis.

**Baris KPI:** Total Permohonan · Menunggu Approval (dengan badge In-Review) ·
Disetujui (dengan persentase) · Total Komitmen Budget.

**Multi-select dan batch:** centang beberapa baris → bar bulk "N Travel Request
Dipilih" muncul → **Batch Approve** (`canBatchApproveTravel`: LM/DH/SA).

**Export** → `GET /exports/travel-requests` (CSV via blob dengan header Bearer).

**Aksi per baris:** link detail, link "ubah parameter" (ke detail), menu
`more_vert` dengan **Lihat Detail** dan **Batalkan Pengajuan** — yang terakhir
hanya untuk milik sendiri berstatus `Submitted` (pra-approval; backend 409
bila sudah ada keputusan, pesan ditampilkan apa adanya).

> **Perbaikan:** badge status sekarang menampilkan status apa adanya
> (`In Review`, bukan embel-embel menyesatkan). Untuk tahu sedang di level
> mana, **gunakan stepper di halaman detail sebagai sumber kebenaran.**

**Paginasi:** server-side, nyata. `per_page` bisa 10, 25, atau 50. Paginator
Laravel `{ data, current_page, last_page, total }` dibaca via `paginatorMeta()`,
dan filter yang berubah me-reset ke halaman 1.

### B.2.4 Delegasi (Hendra sebagai delegator)

**Halaman:** `/admin/management/delegation` — **dibuka juga untuk Line Manager
dan Division Head**, bukan hanya Super Admin. Detail di
[B.3.4](#b34-delegasi-plt-michael-sebagai-delegator).

---

## B.3 — Division Head (Michael Wijaya)

### B.3.1 Dashboard versi Head — dengan anggaran

KPI (4), dan ini satu-satunya dashboard yang menampilkan **anggaran**:

- **Budget Departemen Terpakai** — dari `GET /departments`, dicari lewat
  `department.code` = `CC-TECH-502` → **Rp224.000.000 dari Rp350.000.000**.
- **Progress bar** plus persentase terpakai.
- **Sisa Plafon** — `budget_total − budget_used`.
- **Antrean Level 2** dan **Proyek Aktif**.

Grafik tren 6 bulan dan donut distribusi biaya per divisi (6 warna token)
ditampilkan di sini.

### B.3.2 Menyetujui Level 2

Sama persis dengan [B.2.2](#b22-approval-queue-worklist-utama). Yang berbeda
hanya **level** yang boleh ia putuskan.

Perhatikan detail strukturalnya: **approver Level 2 adalah `leader_id` departemen
pemohon**, bukan atasan langsung. Level 1 memakai `manager_id`; Level 2 memakai
`user.department.leader`. Keduanya harus terisi. Kalau tidak, level tersebut
**auto-pass** dan tercatat di audit sebagai `travel.autopass` dengan alasan
"Tidak ada approver struktural".

### B.3.3 Mengubah budget departemen sendiri

**Halaman:** `/admin/management/departments` → kartu departemen → **Atur Plafon**

Ini **satu-satunya** hak menulis non-Super Admin di seluruh master data
(`DepartmentController` mengizinkan **Super Admin, atau Division Head untuk
departemennya sendiri**). Atasan langsung (Line Manager) **tidak** boleh.

**Penting untuk demo governance:** di halaman lain (`users.vue`) ada validasi
saat Super Admin membuat pengguna, yang menandai risiko **jika atasan langsung
punya role yang salah**:

| Kondisi | Peringatan di UI | Akibat sebenarnya |
|---|---|---|
| Atasan ber-role bukan Line Manager/SA | "tidak bisa memutus Level 1" | Rantai **macet** — 403 saat mau menyetujui |
| Atasan beda departemen | "L2 tetap ikut leader departemen user" | Tab "Tim" bercampur |
| Atasan berstatus non-Aktif | "antrean L1 tidak akan diputus" | Antrean menggantung |
| Memilih user itu sendiri sebagai atasan | "Atasan langsung tidak boleh user itu sendiri" | Ditolak di form |
| Tanpa atasan sama sekali | Catatan "auto-pass tercatat audit" | Untuk TR ≤ Rp5jt (rantai hanya L1) artinya **langsung Approved** |

Fitur governance ini layak didemokan — ia menunjukkan sistem **mencegah
konfigurasi yang membuat approval buntu**, bukan sekadar mencatat kejadian
setelah terjadi.

### B.3.4 Delegasi (Plt) — Michael sebagai delegator

**Halaman:** `/admin/management/delegation`

Ini halaman yang **tidak** terkunci Super Admin. Field form:

| Field | Wajib | Catatan |
|---|---|---|
| **Pemberi Kewenangan** (delegator) | Ya | default = user yang login |
| **Penerima Mandat** (delegatee) | Ya | daftar user dari API |
| **Cakupan** | Ya | radio: **Penuh (Full Approval)** atau **Tiket & Hotel** |
| **Mulai Berlaku** | Ya | tanggal |
| **Berakhir Pada** | Ya | tanggal |
| **Batas Nilai Anggaran Maksimal** | Tidak | 0 berarti tanpa batas |
| **Alasan Pelimpahan** | Tidak | teks bebas |
| Checkbox konfirmasi kepatuhan | — | **tidak divalidasi, tidak dikirim** ([D.2](#d2-ui-ada-tapi-belum-tersambung-ke-backend)) |

Submit tidak langsung menyimpan — muncul **modal konfirmasi** yang meringkas
pemberi kewenangan beserta SLA respons rata-rata, baru benar-benar
`POST /delegations`.

**Syarat agar Plt benar-benar berlaku** — semuanya harus terpenuhi, diperiksa
di `User::delegationFor()` dan `ApprovalChain::isDesignated()`:

1. Status delegasi = **Aktif**.
2. `start_date` ≤ hari ini ≤ `end_date`.
3. Nominal antrean ≤ `max_amount` (dan `max_amount` > 0; nilai 0 = tanpa batas).
4. Cakupan cocok dengan tipe antrean: `Penuh` atau `full` = semua;
   `tiket` atau `travel` = hanya antrean bertipe Travel.
5. **Delegator sendiri punya wewenang atas antrean itu** (level dan wilayah
   kerjanya sah).
6. Setting global `delegation_enabled` = true (bisa dimatikan Super Admin di
   [B.5.5](#b55-alur-dan-level-approval-simulasi-dan-eskalasi)).

 Secara teknis, jika satu saja gagal, delegasi **tidak berlaku** dan approver
kembali menjadi "harus orang itu sendiri".

**Aksi baris:** **Ubah delegasi** (form diisi dari data mentah — perhatikan
jebakan scope di [D.3](#d3-inkonsistensi-domain-yang-perlu-diketahui)) ·
**Cabut delegasi** → `POST /delegations/{id}/revoke` · tombol `history`
(**tanpa handler**).

Baris yang sudah kedaluwarsa di-grayscale dengan `opacity-70`, dan tombol Ubah
serta Cabut disembunyikan. Label masa berlaku dihitung di klien: `Kedaluwarsa`,
belum mulai → "Mulai {tanggal}", aktif → "Sisa N Hari".

**Audit Trail live** di bawah tabel: `GET /audit-logs?type=Delegation`
menampilkan aksi (`delegation.revoke` → "Delegasi dicabut"), pelaku, alamat IP,
waktu, dan badge "Tercatat". Di bawahnya ada klaim "Imutabel & Enkripsi
SHA-256".

> **Alur demo delegasi yang sudah teruji:** logout dari Michael, login Hendra,
> buka Approval Queue — antrean L2 milik Michael **ikut tampil**, putuskan, dan
> chip "Plt a/n Michael" akan muncul di kartu, di riwayat, dan di audit.

---

## B.4 — Finance Approver (Ratna Paramita)

Finance adalah role dengan **dua halaman kerja penuh** dan satu-satunya yang
menyentuh uang.

### B.4.1 Dashboard versi Finance

KPI (4), semuanya angka **antrean kerja dan uang**, bukan angka perjalanan:

- **Verifikasi Pending** (dari `GET /reimbursements-summary`)
- **Kas Bon Pending** (dari `GET /advances-summary`)
- **Siap Disburse**
- **Total Disbursed**

Section bawah berisi **link kerja langsung** ke Reimbursement dan Uang Muka.
Grafik tren dan donut tetap ditampilkan untuk Finance, tapi isi utama
dashboardnya adalah antrean kerja.

> Finance **tidak punya** `canBatchApproveTravel`, jadi **tidak ada** tombol
> Batch Approve di halaman Travel Requests untuknya. Ia tetap punya batch
> approve di Approval Queue.

### B.4.2 Uang Muka — verifikasi dan pencairan

**Halaman:** `/admin/uang-muka`

**Lima tab dengan hitungan** (dihitung di sisi klien dari list, bukan dari API):
Semua · Pending Review · Disetujui · Sudah Ditransfer (Paid) · Ditolak.

Status di backend, dipetakan ke label UI:

| Status backend | Label UI | Arti |
|---|---|---|
| `Pending Finance` | Pending Review | Menunggu keputusan Finance |
| `Approved-Ready to Pay` | Approved - Ready to Pay | Disetujui, uang belum keluar |
| `Paid` | Paid / Transferred | Sudah ditransfer, bukti tersimpan |
| `Rejected` | Ditolak | — |

**Aksi:**

1. **Setujui atau Tolak** (saat `Pending Finance`) →
   `POST /advances/{id}/decide { action: 'approve' | 'reject', note? }`.
   Backend membalas **409** kalau statusnya sudah bukan `Pending Finance`,
   dengan pesan `"Pengajuan {request_no}: {status}."`
2. **Disburse** (hanya saat `Approved - Ready to Pay`) → modal:
   - **Nomor Referensi Bank** — **wajib**, divalidasi di klien.
   - **File Bukti Transfer** — PDF atau gambar, maks 10MB, multipart.
   → `POST /advances/{id}/disburse`. Status → **`Paid`**, bukti tautan
   tersimpan permanen dan bisa dibuka.

> **Inilah inti nilai sistemnya.** "Cair" di sistem lama adalah satu klik. Di
> sini "cair" adalah satu klik plus bukti transfer. Nomor referensi dan file
> bukti adalah **field wajib di backend**, bukan sekadar field opsional di
> form — jadi tidak bisa dilewati bahkan kalau form-nya dimodifikasi.

**SLA label** diturunkan dari status (bukan dari field SLA API): "Siap
Transfer", "Tuntas Terkirim", "Ditolak Otomatis", "Menunggu Finance", dengan
ikon berbeda.

**Rekap bawah:** `{n} menunggu finance (Rp X) • {m} siap dicairkan (Rp Y)`.

**Ekspor (dua tombol):** `GET /exports/advances` — "Ekspor Data (Excel/CSV)"
dan "Unduh Rekap Pencairan (CSV)".

**Filter:** **Metode** dikirim ke server (`?method=`, nilai persis
`Bank Transfer`/`Corporate Card` sesuai validasi backend); **Departemen**
difilter lokal tetapi opsinya dari API (bukan hardcoded). Dropdown Periode
yang tidak berfungsi **dihapus**.

**KPI:** tiga kartu pertama dari `advances-summary`; kartu keempat
("Sudah Ditransfer") menghitung status `Paid` dari daftar yang dimuat —
diberi label jujur. Delta palsu "+8,4% vs April 2025" dihapus.

> **Sisa jebakan:** checkbox select-all/select-row **tidak terhubung ke aksi
> apa pun** (tidak ada bulk action uang muka).

### B.4.3 Reimbursement — verifikasi dan settlement

**Halaman:** `/admin/reimbursement`

**Lima tab dengan hitungan:** Semua Klaim · Perlu Verifikasi Finance · Siap
Settlement · Perlu Revisi (Resubmit) · Selesai.

> **Perbaikan dari versi sebelumnya:** tab "Siap Settlement" dan "Selesai"
> dulu memakai filter identik. Sekarang dibedakan sesuai alur status:
> **Siap Settlement** = `Menunggu Verifikasi Finance` (lolos verifikasi,
> menunggu settlement), **Selesai** = `Disetujui`.

**Tiga aksi** → `POST /reimbursements/{id}/verify { action: ... }`:

| Aksi | `action` | Efek status |
|---|---|---|
| **Verifikasi** | `verify` | `Menunggu Audit` → `Menunggu Verifikasi Finance` |
| **Tolak** | `reject` | → `Ditolak` |
| **Setujui Settlement** | `settlement` | → `Disetujui` (settlement) |

Plus **Kirim Notifikasi Revisi** → `POST /notifications { category: 'finance' }`
ke pemohon.

**Status audit turunan** yang ditampilkan di kolom status — ini illustrate
bagaimana data mentah dipetakan jadi bahasa manusia:

| Sumber | Tampil sebagai |
|---|---|
| status `Disetujui` | "Verifikasi Lolos (Audit OK)" |
| status `Ditolak` | "Ditolak / Butuh Bukti" |
| `ocr_status = 'Deviasi Plafon'` | **"Deviasi Plafon (>14%)"** — merah |
| selain itu | "Menunggu Audit Finance" |

**Badge bukti:** `"{n} Resi (OCR Valid | Deviasi Plafon | Ditolak)"` dengan
ikon berbeda.

**Panel kebijakan:** tombol **Pelajari SOP Travel** (modal 5 poin SOP
settlement) dan **Hubungi Helpdesk Audit** (`mailto:`).

**KPI keempat** ("Sisa Kas Bon Balik") memakai `net_reimbursement` negatif
dari summary + hitungan klaim berekonsiliasi negatif dari daftar yang dimuat.

> **Perbaikan dari versi sebelumnya:** tombol **"inspeksi resi dan OCR"**
> yang mati dan filter stub **Departemen / Kategori / Periode** dihapus.
> Checkbox select-all masih dekoratif (tidak ada bulk action).

`splitRoute()` memecah rute pada `→` **dan** pada mojibake `â†’` — ada
workaround khusus untuk data yang pernah rusak.

---

## B.5 — Super Admin

Enam halaman management. Super Admin melihat **semua** (scope backend = null),
dan satu-satunya yang boleh menulis master data.

### B.5.1 Pengguna dan Role

**Halaman:** `/admin/management/users`

**KPI:** total, akun 30 hari terakhir, pejabat otoritas, non-aktif — dari
endpoint baru `GET /users-summary` (SA-only, pola sama seperti summary lain).

**Filter:** Search (debounce) · Departemen (kirim **`name`**) · Role (5 role
kanonik) · Status (Aktif, Pending, atau Cuti).

**Impor Data Karyawan (CSV):** input file tersembunyi → `POST /users/import`
(multipart). Toast menampilkan jumlah baris yang **dibuat**; kalau gagal,
pesan format kolom ditampilkan.

**Drawer Tambah dan Edit** — tujuh field: **NIK · Nama · Email ·
Departemen · Grade · Atasan Langsung · Role SixAgo**. Grade punya deskripsi
jabatan (P1–P5 supervisory, M1–M3 managerial). Toggle undangan mati **dihapus**,
diganti info jujur: password awal `SixAgo123!` disampaikan manual, user wajib
ganti saat login pertama (toast sukses juga tidak lagi mengklaim pengiriman
email/WhatsApp).

**Validasi governance di dalam drawer** — sudah dijelaskan di
[B.3.3](#b33-mengubah-budget-departemen-sendiri). Ini bagian paling bernilai
dari halaman ini: form **memperingatkan** sebelum konfigurasi yang membuat
approval buntu disimpan.

**Aksi per baris:** **Edit** · **Reset password** (`POST
/users/{id}/reset-password`, default `SixAgo123!`) · **Ubah status akun**
(`PATCH /users/{id}/toggle-status`). Ketiganya (reset + toggle) dibungkus
modal konfirmasi berisi nama target. NIK/email divalidasi di klien (format +
duplikat 422 backend ditampilkan di form). Impor CSV: tombol **Template CSV**
+ cek header di klien sebelum upload (kolom kurang/tak dikenal ditolak dini).

**Perilaku akun baru:** pengguna yang dibuat lewat halaman ini **wajib ganti
password saat login pertama** (`must_change_password`). Inilah yang membuat
`/password` menjadi halaman universal dengan badge merah "Anda wajib membuat
password baru sebelum melanjutkan".

> **Tidak ada bulk action** di halaman ini meski checkbox select-all tersedia,
> dan **tidak ada paginasi per-page selector**. Ada `downloadExport('users')` di
> `useMappers.ts` tapi **tidak pernah dipanggil** dari mana pun.

### B.5.2 Kebijakan Perjalanan

**Halaman:** `/admin/management/travel-policy`

Matriks **plafon per grade dan wilayah**: tiket, hotel, per diem, transport
lokal, dan SLA review.

**Filter:** Search · **Wilayah** (Semua, Domestik, Asia Pasifik, Internasional —
dipetakan ke `region` Domestik atau Global) · **Status** (Aktif Berjalan →
`active`, Draf Revisi atau Non-aktif → `inactive`).

**Tabel:** kode · cakupan grade · plafon · per diem · SLA · **toggle status
aktif** per baris → `PATCH /travel-policies/{id}/toggle`. Baris non-aktif
diredupkan.

**Aksi baris:** **Edit** (modal, `code` dinonaktifkan saat edit) · **Duplikasi**
· **Hapus** (`DELETE /travel-policies/{id}`).

**Buat Kebijakan Baru:** kode (wajib) · grade · wilayah (wajib) · empat plafon
· SLA, plus panel parameter toleransi deviasi.

**Ekspor:** "Unduh Matriks (XLS)" → `GET /exports/travel-policies` (output
sesungguhnya CSV) · "Riwayat Perubahan Aturan" → `GET /exports/audit-logs`.

**Ringkasan atas** — dulu empat kartu grade hardcoded; sekarang satu kartu per
policy di database (kode, grade, wilayah+SLA, empat plafon, badge aktif) plus
caption penjelas peran policy. Panel bawah:
- "Tingkat Kepatuhan" — badge `Sesuai` vs `Deviasi` dari sampel 50 pengajuan
  terakhir (diberi label jujur).
- "Matriks Hierarki Approval Deviasi" — ditulis ulang sesuai realita: deviasi
  adalah **badge informatif**, bukan penolakan otomatis; rantai tetap ikut
  nominal.
- "Penyedia Terkoneksi (API Contract)" — ditulis ulang jujur: **referensi
  rekanan**, bukan koneksi API; tiket via travel desk.

> **Pembeda yang perlu dijelaskan ke klien:** kebijakan menilai
> **kepatuhan** (badge di pengajuan, dihitung `PolicyCheck` saat create dari
> total estimasi vs total plafon grade). Rantai approval tetap dari konstanta
> `ApprovalChain` (Rp5jt/Rp15jt/Rp50jt) + struktur organisasi. Mengubah policy
> mengubah *penilaian*, bukan *rantai*.

### B.5.3 Proyek

**Halaman:** `/admin/management/projects`

Master proyek dan WBS dengan **pagu anggaran perjalanan** per proyek.

**Filter:** Search · tab status dengan hitungan (Semua, Active, On Hold,
Completed, Cancelled → `status`) · filter departemen (opsi dari API,
filter lokal) · export (`GET /exports/projects`).

**Drawer Tambah dan Edit:** kode (wajib) · WBS (wajib) · nama (wajib) · PM
(wajib, select dari `/users`) · departemen · lokasi · pagu anggaran (wajib) ·
tanggal mulai dan selesai · status.

**Departemen dinamis mengikuti PM:** setiap ganti PM, field terisi dari
`PM.department` (caption menyebut sumbernya; PM tanpa departemen → isi
manual; field tetap bisa diketik manual di antara pergantian PM). Kolom
nullable di backend; tampilan list punya fallback
`department ?? PM.department`.

**Logika tampilan yang layak didemokan:**

- `daysLeft` = `end_date` − hari ini. Badge: "Sisa N Hari", "Berakhir", atau
  "Selesai 100%". Warna **error** bila ≤ 30 hari.
- **Pagu anggaran** = `budget_used / budget_total` (1 desimal). **Warning bila
  > 85%** dan status masih Active → bar merah plus label "(Warning)", dan baris
  tabel diberi background.
- KPI dihitung di klien: total proyek aktif, utilisasi anggaran agregat, proyek
  mendekati plafon, close-out kuartal.

**Sinkronisasi SAP / ERP Project** → `POST /projects/sync-sap`.

> **Halaman ini Super Admin-only, padahal backend mengizinkan Finance Approver
> juga.** Jadi kemampuan sync-SAP milik Finance **tidak terjangkau dari UI**.
> ([D.1](#d1-fitur-backend-ada-tapi-tidak-bisa-diakses-dari-ui))

**Aksi baris:** Edit · link "alokasi tiket" (→ `/admin/travel-requests`) ·
**Nonaktifkan** (`PUT /projects/{id} { status: 'Cancelled' }`). Toggle kas bon
otomatis yang mati diganti info jujur (pembebanan dicatat manual via pagu).
Kartu utilisasi memakai angka agregat nyata (`formatRpShort`) + bar sesuai
persentase.

### B.5.4 Departemen dan Matriks Role

**Halaman:** `/admin/management/departments`

**Dua tab:**

**Tab 1 — Struktur Departemen dan Cost Center.** Kartu per departemen dengan
progress bar anggaran (warning > 75%), sisa limit, dan "Diperbarui {tanggal}".
Aksi: **Atur Plafon** · **Kelola Anggota** (→ `/admin/management/users`) ·
**Ubah** (menggantikan `more_vert` mati). Toggle Grid/List mati diganti
hitungan "N departemen".

Form department: nama (wajib) · kode cost center (wajib, disabled saat edit) ·
plafon Q2 (wajib) · **Kepala Departemen (select user → `leader_id`, penentu
Level 2; kosong = L2 auto-pass tercatat audit)** · alur approval radio
(dikirim sebagai field `sla`).

KPI strip: total plafon + utilisasi agregat + jumlah unit (nyata); kartu
"Tanpa Kepala Departemen" (nyata, actionable — terkait L2 auto-pass) dan
"Cakupan Matriks Role" (jumlah role dari API) menggantikan "SLA 98,4%" dan
"audit 100%" yang dulu hardcoded.

**Tab 2 — Definisi Hak Akses dan Matriks Role.** Tabel **5 role kanonik × 5
modul** dengan tanda ✅ dan ⛔ — statis, dibaca dari kode, bukan dari database.
Setiap baris punya link "Kelola Hak" → `/admin/management/users`.

Tombol **+ Buat Custom Role Baru** → modal (nama peran, role template basis,
empat checkbox hak modul) → `POST /roles`. Modal kini mencantumkan catatan
jujur: role tersimpan tetapi matriks dan form pengguna masih memakai 5 role
kanonik. ([D.1](#d1-fitur-backend-ada-tapi-tidak-bisa-diakses-dari-ui))

**Ekspor:** Struktur Organisasi → `GET /exports/departments` · Riwayat
Perubahan Matrix → `GET /exports/audit-logs`.

### B.5.5 Alur dan Level Approval — simulasi dan eskalasi

**Halaman:** `/admin/management/approval-levels`

**Empat bagian:**

**(1) Pemilih Skema.** Kartu skema approval; klik berarti **aktivasi**
(`POST /approval-schemes/{id}/activate`). Badge status: Aktif, Standby,
Regulated, atau Non-aktif. Tombol **+ Tambah Skema Alur Approval** (nama wajib
plus deskripsi).

> **Penting untuk demo:** **mengaktifkan skema baru tidak mengubah rantai yang
> sedang berjalan.** Baris antrean dibangun saat TR dibuat, dan tidak pernah
> dibangun ulang. Banner di halaman ini mengatakannya: dokumen berjalan
> mengikuti versi saat dibuat. Inilah yang benar.

**(2) Step builder.** Setiap tahap menampilkan **Pemicu · Otorisator · SLA**,
lalu badge (Automated Engine, Universal Entry, atau Threshold Plafon) dan aksi:
**Edit rule** · **Salin tahap** (duplikasi dengan `step + 1` dan nama
"(Salinan)") · **Hapus tahap**. Tahap dengan `locked` (Level 5 Auto-Ticketing)
menampilkan "Sistem Otomatis (Terkunci)" dan aksi dimatikan.

**(3) Simulasi Uji Alur Otorisasi** — fitur paling representatif dari "apa yang
terjadi kalau". Modal berisi: **Estimasi Biaya** (wajib), tujuan, dan checkbox
"Mengajukan kas bon" → `POST /approval-simulate` → daftar terurut tahap hasil
**plus blok policy** (`policy_code`, total plafon, `Sesuai`/`Deviasi N%`,
`days_assumed`; tambah tanggal untuk perhitungan hari yang akurat).

> **Ini memakai `ApprovalChain` DAN `PolicyCheck` yang sama persis** dengan
> eksekusi nyata. Kalau simulasi bilang L1→L2 + Deviasi 103,7%, maka TR dengan
> nominal dan tanggal yang sama akan benar-benar punya L1→L2 + badge tersebut.
> Tidak ada duplikasi aturan di mana pun. **Demo terbaik: buka
> simulasi, isi Rp24.750.000, dan tunjukkan tiga tahap muncul.** Dengan begitu
> klaim "rantai otomatis" jadi terbukti, bukan sekadar janji.

**(4) Eskalasi dan delegasi.** Toggle **Eskalasi ke atasan (24 jam)** dan
**Izinkan delegasi approval saat approver cuti** → `PUT /settings
{ escalation_enabled, delegation_enabled }`, beserta tombol **Simpan &
Terapkan** dan **Reset ke Standar**.

> **`delegation_enabled` benar-benar berfungsi.** `User::delegationFor()`
> memeriksa `Setting::bool('delegation_enabled', true)` lebih dulu — kalau
> dimatikan, **seluruh delegasi di seluruh perusahaan langsung tidak berlaku**,
> dan setiap Plt kembali kehilangan wewenang. Ini tombol demo yang sangat efektif
> untuk menunjukkan kontrol terpusat.

**Ekspor:** "Unduh Log Audit (CSV)" → `GET /exports/audit-logs`. Tombol mati
"Pratinjau JSON Schema" dan "Sisipkan Node Antara" **dihapus**; ikon drag
yang menyesatkan **dihapus** (tahap terkunci tetap punya ikon gembok);
copy "seret modul" diperbaiki.

**KPI SLA** — rata-rata `decided_at − created_at` dari 50 riwayat putusan
terakhir + jumlahnya, dengan label jujur bila kosong. Angka lama (18,4 jam,
94,8%, 1.248) dihapus.

> **Toast ganda di halaman ini disengaja**: sukses memakai toast lokal yang
> kaya (kartu dengan detail perubahan), sementara kegagalan memakai `AppToast`
> generik. Visualnya berbeda karena jenis informasinya berbeda — bukan
> inkonsistensi. Halaman `users.vue` punya pola yang sama.

### B.5.6 Delegasi — panel Super Admin

Halaman yang sama dengan [B.3.4](#b34-delegasi-plt-michael-sebagai-delegator). Super
Admin melihat **semua** delegasi (scope backend = null). KPI: Aktif, Terjadwal
(dihitung klien, nyata), **Total Delegasi** dan **Riwayat Kedaluwarsa**
(menggantikan "38 request +12%" dan "0 kasus"); "dari 24 riwayat" menjadi
hitungan nyata; checkbox kepatuhan kini **required beneran** (memblokir submit);
tombol refresh di-wire, tombol history mati dihapus; deteksi scope disamakan
dengan backend (`isFullScope`: mengandung `penuh`/`full`) sehingga badge hijau
muncul untuk data lama dan form Edit tidak lagi menurunkan grade scope.

---

## B.6 — Lintas-peran

### B.6.1 Sidebar dan navigasi adaptif

**Layout:** `layouts/admin.vue` (sidebar plus topbar), dengan drawer mobile dan
bottom nav mobile.

Tiga grup yang bisa di-collapse:

| Grup | Item | Gate |
|---|---|---|
| **Main** | Dashboard, Travel Requests, Approval Queue, Uang Muka | Queue: `canDecideQueue` · Uang Muka & Reimbursements: semua role (aksi finance per tombol via `canFinance`) |
| **Management & Policy** | Policies, Projects, Reimbursements, Users & Roles, Departemen & Role, Approval Level, Delegasi | `isSuperAdmin`, kecuali Delegasi: LM/DH/SA |
| **Analytics** | Notifikasi Sistem, "Reports & Audit" (badge **"Soon"**) | — |

**Badge dinamis** dari `GET /dashboard/sidebar-badges`:
- Angka **Approval** = antrean `pending` yang terlihat user itu. **Nol berarti
  badge hilang**, bukan badge "0".
- Angka **Notifikasi** = unread miliknya.
- Format `9+` untuk angka besar.
- Tidak ada lagi angka hardcoded di badge.

**Topbar:** search global (debounce 300ms) · chip entitas "PT Nusantara Dinamika
Tbk" (hanya di layar xl) · tombol **Request Baru** (`hidden sm:flex`, semua
role) · lonceng notifikasi dengan badge · user menu (avatar atau inisial, nama,
role, Profil Saya, Ganti Password, Keluar).

> **Perbaikan:** search topbar (`?q=`) sekarang dibaca sebagai nilai awal filter
> di halaman Travel Requests (di-watch, jadi berubah tiap navigasi). Sebelumnya
> tidak memfilter apa pun.

### B.6.2 Ekspor — 8 endpoint

Semua mengembalikan CSV, dikirim sebagai blob dengan header Bearer token.

| Dari halaman | Endpoint |
|---|---|
| Travel Requests | `GET /exports/travel-requests` |
| Approval Queue ("Export Daftar") | `GET /exports/travel-requests` *(berkasama dengan Travel Requests)* |
| Uang Muka (dua tombol) | `GET /exports/advances` |
| Notifikasi (Pusat Unduhan) | `GET /exports/audit-logs` — **hanya Super Admin** (diselaraskan dengan backend yang SA-only; sebelumnya `canDecideQueue` sehingga LM/DH/FA kena 403) |
| Notifikasi (Pusat Unduhan) | `GET /exports/advances` |
| Kebijakan Perjalanan | `GET /exports/travel-policies` |
| Proyek | `GET /exports/projects` |
| Departemen | `GET /exports/departments` |
| Delegasi | `GET /exports/audit-logs` |
| Approval Levels | `GET /exports/audit-logs` |

**Tidak ada tombol export** di Reimbursement. `downloadExport('reimbursements')`
dan `downloadExport('users')` **terdefinisi tapi tidak pernah dipanggil**.
Beberapa tombol berlabel "XLS" padahal outputnya CSV.

---

# BAGIAN C — REFERENSI

## C.1 Matriks kapabilitas 5 role

| Kemampuan | Employee | Line Mgr | Div. Head | Finance | Super Admin |
|---|---|---|---|---|---|
| Buat travel request sendiri | Ya | Ya | Ya | Ya | Ya |
| Buat advance / reimbursement | Ya | Ya | Ya | Ya | Ya |
| Lihat travel request | Milik sendiri | Tim (bawahan) | Satu departemen | Semua | Semua |
| Lihat pengguna (`GET /users`) | Diri sendiri | Diri + bawahan | Departemennya | Semua | Semua |
| Approve antrian **Level 1** | Tidak | Ya | Tidak | Tidak | Ya |
| Approve antrian **Level 2** | Tidak | Tidak | Ya | Tidak | Ya |
| Approve antrian **Level 3** (Finance) | Tidak | Tidak | Tidak | Ya | Ya |
| Approve antrian **Level 4** (CFO/SA) | Tidak | Tidak | Tidak | Tidak | Ya |
| Batch approve **antrean** | Tidak | Ya | Ya | Ya | Ya |
| Batch approve **travel request** | Tidak | Ya | Ya | Tidak | Ya |
| Verifikasi / settlement reimbursement | Tidak | Tidak | Tidak | Ya | Ya |
| Approve + **disburse** uang muka | Tidak | Tidak | Tidak | Ya | Ya |
| Ubah budget departemen sendiri | Tidak | Tidak | Ya | Tidak | Ya |
| Kelola users / policy / project / scheme / role | Tidak | Tidak | Tidak | Tidak | Ya |
| Sync SAP | Tidak | Tidak | Catatan 2 | Catatan 2 | Ya |
| Buat / cabut delegasi | Tidak | Ya | Ya | Tidak | Ya |
| Simulasi alur approval | Ya (pratinjau di form create) | Ya | Ya | Ya | Ya (halaman) |
| Unduh log audit dari UI | Tidak | Ya | Ya | Ya | Ya |
| Unggah dokumen | Ya (pemilik) | Tidak | Tidak | Ya | Ya |
| Batalkan pengajuan milik sendiri | ✅⁴ | ✅⁴ | ✅⁴ | ✅⁴ | ✅⁴ |
| Batalkan pengajuan orang lain | Tidak | Tidak | Tidak | Tidak | ✅⁴ |
| Ubah status via PUT (Rejected/Approved/…) | Tidak | Tidak | Tidak | Tidak | Tidak |
| Edit field milik sendiri + hapus (tanpa turunan) | Ya | Ya | Ya | Ya | Ya |
| Profil sendiri dan ganti password | Ya | Ya | Ya | Ya | Ya |
| Keluar semua perangkat | Ya | Ya | Ya | Ya | Ya |
| **Self-approval** | Tidak | Tidak | Tidak | Tidak | **Tidak** |
| **Approve di luar wilayah kerja** | Tidak | Tidak | Tidak | Tidak | Ya (lolos) |
| **Hapus data yang punya data turunan** | Tidak | Tidak | Tidak | Tidak | **Tidak** |

> **Catatan 2 — Backend mengizinkan Finance**, tapi halamannya Super Admin-only,
> sehingga kemampuannya tidak terjangkau dari UI.
>
> > ⁴ Batalkan hanya **pra-approval** (`Submitted` + nol baris decided; baris
> > `pending`/`queued` ikut dibekukan). Setelah ada keputusan → **409**.
> > Status lain via PUT selalu **403** — penolakan sah hanya lewat `decide()`.

**Semua role** dapat: daftar Departemen (⚠️ membuka `budget_total` dan
`budget_used` ke semua role — [D.3](#d3-inkonsistensi-domain-yang-perlu-diketahui)) ·
Notifikasi · badge Sidebar · Mengganti password · Edit profil sendiri ·
Bertindak sebagai **Plt** bila punya delegasi aktif.

## C.2 Kamus error 403 / 409 / 422

Pesan di bawah ini **ditampilkan apa adanya** di toast. Jangan memakai pesan
generik "terjadi kesalahan" saat demo — pesan aslinya adalah bukti bahwa backend
benar-benar menolak.

**403 — Akses ditolak**

| Pesan | Penyebab | Yang harus dilakukan user |
|---|---|---|
| `Akses ditolak untuk role Anda.` | Middleware `role:` tidak cocok | Login dengan role yang benar |
| `Akses ditolak: level {label} bukan wewenang role Anda.` | Role tidak memegang level itu (L1=LM, L2=DH, L3=FA, L4=SA) | Tunggu giliran, atau minta delegasi |
| `Hanya approver yang dituju (atau Plt-nya) yang boleh memutus antrean ini.` | Baris `pending` tapi approver-nya orang lain | — |
| `Tidak boleh menyetujui pengajuan milik sendiri.` | Self-approval | Berlaku untuk **semua** role termasuk Super Admin |
| `Pengajuan ini berada di luar wilayah kerja Anda.` | Pemohon di luar `visibleUserIds()` approver | Tidak bisa di-override role biasa |
| `Status hanya dapat diubah melalui jalur approval (decide).` | PUT `status` selain `Cancelled` (termasuk self-approve `Approved` dan fake `Rejected`) — semua role | Pakai tombol Setujui/Tolak (jalur `decide`) |
| `policy_status dihitung otomatis oleh sistem.` | PUT `policy_status` manual — semua role | Biarkan `PolicyCheck`/finalisasi yang mengisi |
| `Akun Anda tidak aktif. Hubungi administrator.` | `status` user bukan Aktif | Hubungi Super Admin |

**409 — Konflik**

| Pesan | Penyebab |
|---|---|
| `Antrean ini sudah diputus sebelumnya.` | Baris sudah bukan `pending` (double-click atau sudah diputus) |
| `Pengajuan {no}: {status}.` | Status advance sudah berubah, bukan `Pending Finance` |
| `Tidak dapat dibatalkan: pengajuan sudah memiliki keputusan approval.` | PUT `Cancelled` setelah ada baris approved/rejected | Batalkan hanya bisa pra-approval; setelah itu hubungi approver/SA |
| `Alasan penolakan wajib diisi.` | `decide`/`verify` dengan `action=reject` tanpa note (min. 3 karakter) | Isi alasan di modal penolakan |
| `Tidak dapat dihapus: travel request masih memiliki approval, uang muka, reimbursement, atau dokumen. Batalkan statusnya sebagai gantinya.` | Integritas data |
| `Tidak dapat dihapus: departemen masih memiliki anggota. Pindahkan anggota terlebih dahulu.` | Integritas data |
| `Tidak dapat dihapus: proyek masih memiliki travel request.` | Integritas data |
| `Tidak dapat dihapus: user masih memiliki travel request, bawahan, atau peran (leader/PM). Nonaktifkan statusnya sebagai gantinya.` | Integritas data |

**422 — Batch approve gagal utuh**

```json
{ "message": "2 dari 4 pengajuan tidak dapat diproses oleh role Anda. Tidak ada perubahan yang disimpan.",
  "failed": [ { "id": 12, "level": "1 of 2", "reason": "..." } ] }
```

`reason` bisa salah satu dari: `Tidak boleh menyetujui pengajuan milik
sendiri.` · `Pengajuan ini berada di luar wilayah kerja Anda.` · `Level {x}
bukan wewenang role Anda.`

**Urutan pemeriksaan penting:** check dilakukan berurutan, jadi pesan pertama
yang muncul **tidak selalu** penyebab paling mendasar. Designated dicek sebelum
scope, dan self-approval dicek sebelum scope.

## C.3 Peta endpoint

| Area | Endpoint | Dipanggil dari |
|---|---|---|
| **Auth** | `POST /login` (throttle 10 per menit) | `/login` — body `corporateId` (camelCase, satu-satunya pengecualian kontrak) |
| | `POST /logout` dan `POST /logout-all` | user menu · `/profil` |
| | `GET /user` dan `PUT /user/profile` | middleware · `/profil` · `/notifications` |
| | `POST /user/password` | `/password` |
| **Dashboard** | `GET /dashboard/stats` · `/charts` · `/sidebar-badges` | `/admin`, layout |
| **Travel** | `GET /travel-requests` (+filter) | daftar |
| | `GET /travel-requests-summary` | KPI daftar dan dashboard |
| | `GET /travel-requests/no/{no}` | resolusi dari redirect setelah create |
| | `POST /travel-requests` | `/create` — memanggil `ApprovalChain::build` + `PolicyCheck` (badge `Sesuai`/`Deviasi N%`) |
| | `PUT /travel-requests/{id}` | Ubah · Batalkan · Nonaktifkan proyek |
| | `POST /travel-requests/batch-approve` | **LM / DH / SA saja** |
| **Queue** | `GET /approval-queue` | Approval Queue |
| | `POST /approval-queue/{id}/decide` | **satu-satunya** jalur keputusan |
| | `POST /approval-queue/batch-approve` | LM/DH/FA/SA |
| | `POST`, `PATCH`, `DELETE /approval-queue` | **Super Admin saja** (perbaikan manual) |
| **Uang** | `GET /advances` dan `/advances-summary` | Uang Muka |
| | `POST /advances` · `/{id}/decide` · `/{id}/disburse` | **FA / SA** |
| **Klaim** | `GET /reimbursements` dan `/reimbursements-summary` | Reimbursement |
| | `POST /reimbursements/{id}/verify` | **FA / SA** |
| **Dokumen** | `POST /travel-documents` (multipart) | pemilik · FA · SA |
| **Notifikasi** | `GET /notifications` dan `/notifications-unread-count` | `/notifications` |
| | `POST /notifications` · `/mark-all-read` · `PATCH /{id}/read` | Minta Revisi · tandai dibaca |
| **Master** | `GET`, `POST`, `PUT /users` · `GET /users-summary` · `POST /users/import` · `/{id}/reset-password` · `/{id}/toggle-status` | **SA** |
| | `GET`, `POST`, `PUT`, `DELETE /travel-policies` · `/{id}/toggle` | **SA** |
| | `GET`, `POST`, `PUT /projects` · `POST /projects/sync-sap` | **SA** (sync-SAP juga FA di backend) |
| | `GET`, `POST`, `PUT /departments` | **SA, atau DH untuk departemennya sendiri** |
| | `GET`, `POST /roles` | **SA** |
| | `GET`, `POST /approval-schemes` · `/{id}/activate` | **SA** |
| | `GET`, `POST`, `PUT`, `DELETE /approval-levels` | **SA** |
| | `POST /approval-simulate` | **terbuka semua role** (pratinjau rantai + blok `policy`; param tanggal opsional) |
| | `GET`, `PUT /settings` | **SA** |
| **Delegasi** | `GET`, `POST`, `PUT /delegations` · `/{id}/revoke` | LM/DH/SA |
| **Audit** | `GET /audit-logs?type=Delegation` dan `GET /audit-logs` | Delegasi · Notifications |
| **Export** | `/exports/{travel-requests,advances,reimbursements,users,projects,departments,travel-policies,audit-logs}` | delapan tombol |

## C.4 Data demo

### Akun

| Email | Role | Departemen | Atasan | Password | Catatan |
|---|---|---|---|---|---|
| `budi@nusantara.co.id` | Employee (P4) | IT & Rekayasa Sistem | Hendra | `password123` | Pemohon utama |
| `hendra@nusantara.co.id` | Line Manager (M3) | IT & Rekayasa Sistem | — | `password123` | Level 1 |
| `michael@nusantara.co.id` | Division Head (M3) | IT & Rekayasa Sistem | — | `password123` | Level 2 dan leader IT |
| `ratna@nusantara.co.id` | Finance Approver (M2) | HR & Keuangan Korporat | — | `password123` | Level 3 dan uang |
| `siti@nusantara.co.id` | Employee (P3) | Komersial & Enterprise Sales | **Super Admin** | `password123` | Untuk demo lintas-scope |
| `admin@sixago.local` | Super Admin (M2) | HR & Keuangan Korporat | — | **`admin1234567`** | **Lihat catatan di bawah** |

> ⚠️ **Penting:** akun Super Admin di-seed oleh `DatabaseSeeder` dengan password
> **`admin1234567`** dan flag **`must_change_password = true`**. Ia **tidak**
> di-override oleh `DemoSeeder`, karena `firstOrCreate` hanya insert kalau belum
> ada. Jadi saat login pertama ke `admin@sixago.local`, sistem **akan memaksa ke
> `/password`**. Ini fitur yang benar — hanya perlu diketahui sebelum demo.
> Dokumentasi `USERFLOW.md` §1 menyatakan password semua akun `password123` dan
> "tanpa wajib ganti password"; itu **tidak akurat untuk akun admin**.

### Data bisnis

| Objek | Nilai |
|---|---|
| **TR-2025-104** | Budi · PRJ-2025-01 · `CGK → SUB` · Garuda Indonesia · 18–22 Mei 2025 · 5 Hari · **Rp9.450.000** · status `Submitted` · *"Maintenance Data Center Rungkut"* · baris `pending` di-flag `urgent` |
| **ADV-2025-042** | TR-2025-104 · **Rp5.000.000** · plafon Rp6.500.000 · BCA · Bank Transfer · status `Approved-Ready to Pay` |
| **REIM-2025-081** | TR-2025-104 · realisasi **Rp9.350.000** · advance Rp5.000.000 · **`+ Rp4350000 Reimbursable`** · `ocr_status: Valid` · 12 resi · status `Menunggu Audit` |
| **Delegasi** | Super Admin → **Budi** · scope `Penuh (Full Approval)` · maks **Rp25.000.000** · 16–22 Mei 2025 · Aktif · alasan *"Cuti Tahunan"* |
| **PRJ-2025-01** | *Q2 Data Center Resiliency Rungkut* · WBS `884.09.21` · PM: Budi · **Rp150.000.000** (terpakai Rp98.450.000) · Jan–Jun 2025 · Active |
| **POL-IDN-MGR-03** | Grade P3–P5 · Domestik · tiket ≤ Rp4.500.000 · hotel ≤ Rp1.100.000 per malam · per diem Rp450.000 · transport lokal ≤ Rp200.000 per hari · SLA 3 Hari Kerja |
| **CC-TECH-502** | *IT & Rekayasa Sistem* · **Rp350.000.000** (terpakai **Rp224.000.000**) · leader: Michael |
| **CC-SALE-101** | *Komersial & Enterprise Sales* · **Rp450.000.000** (terpakai **Rp351.000.000**) · leader: **kosong**, sehingga L2 auto-pass |
| **CC-CORP-901** | *HR & Keuangan Korporat* · leader: Super Admin |
| **Skema** | *Alur Standar Domestik* (aktif), 5 level termasuk Level 5 terkunci |

### Ketidakkonsistenan di data seed (ketahui sebelum demo)

- `ADV-2025-042` punya `account_name` = **"a.n Bambang Wicaksono"**, padahal
  pemohonnya Budi Santoso. Tampilan rekening akan terlihat tidak konsisten
  dengan nama pemohon.
- Delegasi di-seed dengan `scope` = `'Penuh (Full Approval)'` (diselaraskan
  dari `'Full - Semua Approval'`). Backend tetap menerima string lama
  (`str_contains($scope, 'full')`), dan frontend mendeteksi via `isFullScope()`
  (mengandung `penuh`/`full`) — badge hijau muncul dan form Edit tidak lagi
  menurunkan grade scope. Perilaku dikunci test
  `test_delegatee_scope_with_legacy_full_string_is_accepted`.

## C.5 Menjalankan demo

```bash
# 1. Backend — butuh MySQL `be-Six` sudah termigrasi
cd C:\Development\PHP\SixAgoBeV2
php artisan migrate --seed
php artisan db:seed --class=DemoSeeder   # data demo (ditolak di production)
php artisan serve --host=127.0.0.1 --port=8000

# 2. Frontend
cd C:\Development\JS\SixAgov2
npm install          # postinstall: nuxt prepare
npm run dev          # http://localhost:3000
```

API default `http://localhost:8000/api`; ganti dengan `NUXT_PUBLIC_API_BASE`
bila perlu.

**Prasyarat email:** notifikasi in-app selalu muncul, tapi email bergantung pada
`MAIL_*` di `.env` backend. Kalau mail belum dikonfigurasi, **percayai
notifikasi di `/admin/notifications`**, bukan inbox — dan sampaikan itu juga saat
demo.

**Kesalahan umum saat demo:**

| Gejala | Penyebab dan solusi |
|---|---|
| Login `admin@sixago.local` langsung lempar ke `/password` | Normal — `must_change_password = true` dari `DatabaseSeeder`. Ganti password dulu. |
| Login admin ditolak | Password-nya `admin1234567`, bukan `password123` |
| Semua akun demo ditolak | `DemoSeeder` pakai `firstOrCreate` — **password lama tidak di-update**. Reset manual bila sudah pernah berubah. |
| Badge sidebar Approval kosong padahal ada antrean | Badge menghitung antrean *yang terlihat user itu* — cek dengan akun approver yang benar, atau cek flag `urgent` |
| Halaman `/admin/uang-muka` tidak bisa diakses | Tidak berlaku lagi — halaman terbuka semua role; yang Finance-only hanyalah tombol approve/disburse/verify. Bila tetap terpental, cek `ROLE_ROUTES` di middleware. |
| Gambar dokumen tidak muncul | `file_url` root-relative; butuh `php artisan storage:link` di backend |

---

# BAGIAN D — BATASAN DAN YANG BELUM ADA

> **Bagian ini ada supaya tidak ada janji yang tidak bisa ditepati.**
> Semua di bawah ini terverifikasi terhadap kode, bukan asumsi.

## D.1 Fitur backend ada, tapi tidak bisa diakses dari UI

| Fitur | Status |
|---|---|
| **Halaman Audit Log dan Reports** | **Tidak ada sama sekali.** Link sidebar "Reports & Audit" mengarah ke `/admin` dengan badge **"Soon"**. Audit log hanya muncul sebagai (a) tab di detail travel request — dan itu dibaca dari tabel *approvals*, bukan tabel audit — dan (b) panel Audit Trail di halaman Delegasi (`?type=Delegation`). |
| **Halaman Roles terpisah** | Tidak ada route. `GET` dan `POST /roles` ada di backend, dan `POST /roles` dipanggil dari modal di `departments.vue` — **tapi role yang dibuat tidak pernah muncul di matriks** (tabel statis) maupun di dropdown role pada form user (hanya 5 role kanonik). Jadi membuat custom role sia-sia dari sisi UI. |
| **`downloadExport('reimbursements')` dan `downloadExport('users')`** | Fungsi terdefinisi di `useMappers.ts` tapi **tidak pernah dipanggil**. Tombol export di Reimbursement tidak ada. |
| **`POST /projects/sync-sap` untuk Finance** | Backend mengizinkan Finance Approver, halamannya Super Admin-only, sehingga kemampuan tidak terjangkau dari UI. |
| **Perbaikan manual antrean approval** (`POST`, `PATCH`, `DELETE /approval-queue`, Super Admin) | Endpoint ada, **tidak ada UI di mana pun**. |
| **`AuthUser.permissions`** | Ada di tipe frontend, tapi backend **tidak pernah menegakkan** kolom permission (`User::hasPermission()` nol call site). Sumber kebenaran adalah **nama role**. |
## D.2 UI ada, tapi belum tersambung ke backend

> Legenda: ✅ = sudah diperbaiki · ⬜ = masih terbuka.

| Elemen | Status |
|---|---|
| ✅ Checkbox **"Ingat saya"** (login) | Dihapus; diganti info sesi per-perangkat. |
| ✅ Link **"Lupa Password?"** (login) | Dead link diganti teks "Hubungi Admin" (reset mandiri belum ada). |
| ✅ Checkbox **"Kirim email"** (modal decide) | Diganti caption: email mengikuti preferensi pemohon (`Notify` menghormati `email_notif_enabled`). |
| ✅ Toggle **"SLA Warning Alert Push"** | Diganti info statis (peringatan via tab Urgent; tidak ada push). |
| ✅ Toggle **"Undangan Aktivasi"** (users) | Dihapus; diganti info password awal + toast jujur. |
| ✅ Toggle **"Kas Bon Otomatis"** (projects) | Diganti info pencatatan manual. |
| ✅ Checkbox **konfirmasi kepatuhan** (delegasi) | Kini required beneran (memblokir submit). |
| ✅ Filter stub (reimbursement) | Dihapus (hanya search + reload). |
| ✅ Dropdown uang-muka | Metode dikirim ke server; Departemen dari API; Periode yang mati dihapus. |
| ✅ Tombol **"inspeksi resi"** | Dihapus. |
| ⬜ Checkbox **select-all** (uang-muka, reimbursement) | Masih dekoratif (tidak ada bulk action). |
| ✅ Penolakan tanpa alasan | `note` wajib (min. 3 karakter) di 3 jalur backend + modal FE; 422 bila kosong. |
| ✅ Edit TR tak teraudit | `travel.update` tercatat (old/new) — terlihat via export audit-logs. |
| ✅ Reset/toggle/cabut sekali klik | Modal konfirmasi berisi nama target. |
| ✅ Salah ketik nominal | Live `= Rp ...` di bawah input + modal konfirmasi nominal terformat. |
| ✅ Status/role magic string | `TravelStatuses`/`UserRoles` (BE) cermin `app/constants/domain.ts` (FE); dikunci test kontrak. |
| ✅ Validasi NIK/email/tanggal | Inline di form + pesan 422 apa adanya. |
| ✅ Rute inkonsisten | Normalisasi trim/spasi/huruf besar (blur + backend). |
| ✅ Filter dept projects hardcoded | Opsi dari API. |
| ✅ Impor CSV menebak format | Template + cek header klien. |
| ✅ Ikon **drag** + tombol mati (approval-levels) | Dihapus; copy "seret modul" diperbaiki. |
| ✅ **Search topbar** | `?q=` kini dibaca sebagai nilai awal filter. |
| ✅ Toggle **Grid/List** | Diganti hitungan departemen. |
| ✅ Tombol **`more_vert`** (departments) | Diganti tombol Ubah. |
| ✅ Tombol **refresh** / **`history`** (delegasi) | Refresh di-wire; history dihapus. |
| ✅ Paginasi **dashboard** | Diganti "Lihat semua". |
| ✅ Badge **SLA detail TR** | Dihitung dari `sla_due_at` baris pending. |
| ✅ Field **`leader_id`** | Select Kepala Departemen di form (BE sudah menerima). |
| ⬜ **Paginasi** (reimbursement, delegasi) | Masih UI statis. |
| ✅ **Angka KPI mock** | Semua di-wire ke summary/API (lihat tiap subbab B); label diberi sumber jujur. |
| ⬜ **Label tombol ekspor** | Sebagian masih menyebut "XLS" padahal CSV. |
| ✅ **Label "In Review (Lvl 2 - Finance)"** | Menampilkan status apa adanya; stepper detail sumber kebenaran. |

## D.3 Inkonsistensi domain yang perlu diketahui

**1. ~~Edit delegasi bisa menurunkan grade scope~~ — diperbaiki.** Frontend kini
mendeteksi via `isFullScope()` yang mencerminkan persis backend (mengandung
`penuh`/`full`), seed diselaraskan ke `'Penuh (Full Approval)'`, dan perilaku
dikunci test backend. Badge hijau muncul untuk data lama; form Edit tidak lagi
menurunkan scope diam-diam.

**2. Kebijakan perjalanan menilai kepatuhan, bukan menentukan rantai.**
`PolicyCheck` menghitung badge `Sesuai`/`Deviasi N%` saat create (total estimasi
vs total plafon grade: `transport + hotel×nights + per_diem×days +
local×days`), dipertahankan saat finalisasi
(`Policy Approved · Deviasi N%`), dan dipratinjau di form create + simulasi.
Rantai tetap dari konstanta `ApprovalChain` (Rp5jt/Rp15jt/Rp50jt) + struktur
organisasi — mengubah policy mengubah *penilaian*, bukan *rantai*.
Bila tidak ada policy yang cocok (grade di luar cakupan / nonaktif),
`policy_status` tetap null seperti sebelumnya.

**3. ~~Pengajuan advance/reimbursement tidak bisa diakses Employee~~ —
diperbaiki.** Kedua halaman dibuka untuk semua role (daftar ter-scope backend);
yang di-gate hanyalah tombol approve/disburse/verify (`canFinance`). Klaim
mandiri masuk dengan `ocr_status` = `Belum Diverifikasi`.

**4. `GET /departments` membuka anggaran ke semua role.** `budget_total` dan
`budget_used` dikembalikan ke **semua** role, termasuk Employee. Endpoint-nya
memang harus terbuka untuk dropdown filter karyawan, tetapi field-nya tidak
dipangkas. Kalau anggaran dianggap sensitif, yang perlu diperbaiki adalah memotong
field-nya — **jangan** membatasi endpoint-nya.

**5. ~~Duplikasi tab di Reimbursement~~ — diperbaiki.** "Siap Settlement" kini
= `Menunggu Verifikasi Finance`, "Selesai" = `Disetujui` — sesuai alur status.

**6. Level 2 tanpa leader berarti auto-pass.** `CC-SALE-101` (Komersial) tidak
punya `leader_id`, jadi TR Siti di departemen itu untuk nominal di atas Rp5jt akan
**auto-pass Level 2** dan langsung naik ke L3. Ini perilaku yang benar — termasuk
tercatat di audit sebagai `travel.autopass` — tapi terlihat seperti "level
dilewati" kalau penonton tidak diberi tahu.

**7. `account_name` ADV-2025-042** = "a.n Bambang Wicaksono", bukan Budi.

**8. Password baru user di-hardcode `'SixAgo123!'` di frontend** (`users.vue`) —
tetap begitu, tetapi kini dikomunikasikan jujur (info di drawer + toast tanpa
klaim pengiriman email/WhatsApp). User wajib ganti saat login pertama.

## D.4 Catatan arsitektur (ringkas)

**Empat lapis RBAC, semuanya ditegakkan di backend:**

| Lapis | Mekanisme | Atasan |
|---|---|---|
| 1. Route | middleware `role:A,B` | Role cocok, jika tidak 403 |
| 2. Level rantai | `User::canDecide()` | L1=Line Manager, L2=Division Head, L3=Finance Approver, L4=Super Admin, atau Plt via delegasi aktif |
| 3. Scope wilayah | `User::visibleUserIds()` | Employee→diri, LM→bawahan, DH→departemennya, FA/SA→semua |
| 4. Designated | `isDesignated()` | Approver yang ditunjuk, atau Plt-nya |

Frontend hanya mencerminkan lapis 1 dan 2 (tombol disembunyikan). Lapis 3 dan 4
hanya diketahui backend, jadi UI **bisa** menampilkan tombol yang ternyata
ditolak — dan itu memang terjadi (lihat
[B.1.3](#b13-detail-travel-request-halaman-paling-fitur)). Error asli
ditampilkan lewat toast, bukan pesan generik.

**Siklus status:**

```
Travel:   Draft → Submitted → In Review → Approved / Rejected
                          │               └─ baris "Auto" (travel desk)
                          └─ reject di level mana pun → sisa 'queued' → 'cancelled'
Advance:  Pending Finance → Approved-Ready to Pay → Paid  (disburse butuh transfer_ref + bukti)
Reimb:    Menunggu Audit → Menunggu Verifikasi Finance → Disetujui / Ditolak
Antrean:  pending (aktif, satu-satunya yang bisa diputus) → approved/rejected
          queued (menunggu giliran) · cancelled (konsekuensi reject)
```

**Rantai dibentuk satu kali, saat TR dibuat.** `ApprovalChain::build()` adalah
satu-satunya pembentuk baris antrean, dan **juga** yang dipakai
`POST /approval-simulate`. Tidak ada duplikasi aturan di mana pun. Pada momen
yang sama, **`PolicyCheck::check()` menilai kepatuhan** dan mengisi
`policy_status` (`Sesuai`/`Deviasi N%`/null) — badge informatif yang terbawa
sampai finalisasi, bukan penolakan.

**Kontrak yang sering salah bila mengintegrasikan:**

- Login memakai **`corporateId`** (camelCase) — satu-satunya pengecualian;
  selain itu semua field snake_case di kedua sisi.
- Filter departemen dan proyek memakai **LIKE pada `name`**, bukan `code`.
- `q.level` adalah **label komposit** (`"1 of 3"`), bukan angka.
- Paginator Laravel `{ data, current_page, last_page, total }`.
- `travel_documents.file_url` **root-relative** (`/storage/...`) — wajib
  diabsolutkan ke origin API.

---

# BAGIAN E — PENUTUP

## E.1 Manual vs SixAgo

| Dulu (manual) | Kini (SixAgo) |
|---|---|
| Approve via chat, jejak hilang | Tiap keputusan: siapa, kapan, catatan, atas nama siapa |
| Bingung "lantas ke siapa?" | Rantai dibentuk otomatis dari **nominal + struktur organisasi** |
| Rantai diubah manual di tengah jalan | Rantai **dibekukan** saat pengajuan dibuat; versinya terdokumentasi |
| Tiket dikira sudah beres | Status eksplisit sampai "diteruskan ke travel desk" |
| Kas bon cair tanpa bukti | Wajib **nomor referensi + file bukti** |
| Rekonsiliasi dihitung manual | Otomatis dari `realisasi − uang muka` |
| Satu orang bisa approve sendiri | Diblokir sistem (403) — termasuk via PUT `Approved` |
| Batalkan seenaknya setelah di-approve | Ditolak (409); batal hanya bisa pra-approval + rantai ikut dibekukan |
| Status diubah diam-diam via API | PUT status selain Cancelled selalu 403; badge policy tak bisa ditulis manual |
| Approver cuti membuat pengajuan menggantung | Delegasi (Plt) dengan scope, plafon, dan periode — tercatat |
| Batch approve sebagian gagal diam-diam | **All-or-nothing** plus daftar item yang gagal dan alasannya |
| Atasan salah role membuat approval buntu | Peringatan di form user **sebelum** konfigurasi disimpan |
| Plafon satu departemen, semua orang bisa ubah | Hanya Super Admin, atau DH untuk **departemennya sendiri** |
| Tidak bisa tahu kenapa sebuah TA ditolak | Kamus error + audit log + catatan keputusan di setiap level |
| Data lintas divisi terbuka | `visibleUserIds()` di empat titik: dashboard, antrean, direktori, statistik |
| Laporan dibuat manual dari Excel | Delapan endpoint export dengan data ter-scope per role |
| "Siapa yang boleh apa?" tanya orang IT | Matriks role dan `ROLE_ROUTES` yang bisa dibaca di satu file |
| Plafon policy hanya jadi pajangan | Badge **Sesuai / Deviasi N%** dihitung saat pengajuan dibuat, terlihat approver tiap level, terbawa sampai final |
| Karyawan titip pengajuan via admin | Pengajuan uang muka & klaim mandiri — halaman terbuka semua role, aksi finance tetap terkunci |
| Angka dashboard tidak bisa dipercaya | KPI dari summary endpoint ter-scope; setiap angka berlabel sumbernya |

## E.2 Naskah demo 15 menit

> Prasyarat: backend dan frontend jalan, `DemoSeeder` sudah dijalankan.
> **Siapkan dua tab browser** (atau dua profil) agar tidak login ulang terus.
> Untuk demo yang paling mulus: siapkan nominal Rp24.750.000 dan Rp52.000.000 di
> form create **sebelum** presentasi (tidak perlu submit).

| # | Menit | Login | Aksi | Yang harus terlihat |
|---|---|---|---|---|
| 1 | 0:00–1:00 | **Budi** | `/admin` | KPI versi Employee: Pengajuan Saya, Menunggu, Disetujui, Ditolak. **Tidak ada grafik.** Tunjukkan badge sidebar (Approval dan Notifikasi). |
| 2 | 1:00–1:30 | **Budi** | `/admin/travel-requests` | Tujuh tab dengan hitungan, filter, paginasi. Tunjukkan tabel **hanya miliknya**. |
| 3 | 1:30–2:30 | **Budi** | `/admin/travel-requests/create` | Isi rute `CGK → SUB`, tanggal, estimasi **Rp24.750.000** — panel **Pratinjau Otomatis** muncul: rantai L1→L2→L3 + badge **Deviasi 103,7%** dari POL-IDN-MGR-03. Submit. Toast nomor TR baru. |
| 4 | 2:30–3:30 | **Budi** | Halaman detail TR baru | **Stepper tiga tahap**: L1 AKTIF (kuning), L2 dan L3 queued. Chip amber **Deviasi 103,7%** di header. Tunjukkan tab Dokumen, tombol Unduh PDF, tombol Batalkan. |
| 5 | 3:30–4:00 | **Hendra** | `/admin` | Dashboard versi Manager plus grafik. Tabel tim, tombol approve dan tolak cepat. |
| 6 | 4:00–5:00 | **Hendra** | `/admin/approval-queue` | Tab **Urgensi Tinggi** (TR-2025-104). Setujui TR-2025-104 dengan catatan → kartu pindah ke tab Riwayat. Setujui TR baru (L1). |
| 7 | 5:00–5:30 | **Hendra** | `/admin/approval-queue` | **Batch approve**: centang dua antrean → Batch Approve. Jika salah satu di luar scope → **422 + "Tidak ada perubahan yang disimpan"** + daftar `failed`. Ini momen yang paling meyakinkan. |
| 8 | 5:30–6:30 | **Michael** | `/admin` | Dashboard versi Head: **Budget Departemen Terpakai Rp224.000.000 dari Rp350.000.000** plus progress bar dan sisa plafon. |
| 9 | 6:30–7:30 | **Michael** | `/admin/approval-queue` | Setujui Level 2. Buka detail TR → stepper: L1 hijau, L2 hijau, **L3 Finance kuning AKTIF**. |
| 10 | 7:30–8:30 | **Michael** | `/admin/management/delegation` | **Halaman ini terbuka untuk Division Head** — buktikan bukan SA-only. Buat delegasi Penuh ke Hendra, periode hari ini, maks Rp10.000.000. |
| 11 | 8:30–9:30 | **Hendra** | `/admin/approval-queue` | Antrean **L3 milik Ratna** ikut tampil di antrean Hendra (scope Full). Setujui → **chip "Plt a/n Michael"** muncul di kartu dan di Riwayat. Tampilkan juga chip di detail TR. |
| 12 | 9:30–10:30 | **Ratna** | `/admin` | Dashboard versi Finance: Verifikasi Pending, Kas Bon Pending, Siap Disburse, Total Disbursed. |
| 13 | 10:30–12:00 | **Ratna** | `/admin/uang-muka` | Tab dengan hitungan. Ambil **ADV-2025-042** (status *Ready to Pay*) → **Disburse** → isi **nomor referensi bank** (wajib) dan **file bukti** → status `Paid`. Tunjukkan tautan bukti yang tersimpan. |
| 14 | 12:00–13:00 | **Ratna** | `/admin/reimbursement` | Ambil **REIM-2025-081** (realisasi Rp9.350.000, advance Rp5.000.000, `+ Rp4.350.000 Reimbursable`, `ocr_status: Valid`) → **Verifikasi** → **Setujui Settlement** → status `Disetujui` / "Verifikasi Lolos (Audit OK)". Tunjukkan badge resi "12 Resi (OCR Valid)". |
| 15 | 13:00–14:00 | **Admin** | `/admin/management/approval-levels` | **Simulasi Uji Alur Otorisasi** → isi **Rp24.750.000** → tiga tahap muncul. Ini bukti bahwa simulasi dan rantai memakai aturan yang sama. Lalu toggle **"Izinkan delegasi approval saat approver cuti"** → **Simpan**, lalu tekankan: delegasi yang tadi **sekarang tidak berlaku**. |
| 16 | 14:00-14:45 | **Admin** | /admin/management/users | TKP (titik kunci): buka drawer Edit user, pilih atasan ber-role **bukan** Line Manager, maka **peringatan governance muncul**. Ini yang membedakan "bisa configure" dari "aman dikonfigurasi". |
| 17 | 14:45–15:00 | **Budi** | `/admin/notifications` | Semua notifikasi dari 15 menit tadi: disetujui, dana ditransfer, settlement. Tab per kategori, tandai sudah dibaca. Pastikan preferensi email aktif. |

**Penutup demo** (kalau ada waktu): login sebagai **Budi**, buka
`/admin/approval-queue` langsung di URL. Middleware **melempar balik ke
dashboard**. Tegaskan: ini bukan sekadar menu yang disembunyikan — backend juga
menolak dengan **403** kalau dipaksa lewat API. Frontend menyembunyikan, backend
yang menilai.

---

*Dokumen ini disusun berdasarkan kode repo `SixAgov2` dan `SixAgoBeV2` (2026).
Untuk detail arsitektur lebih dalam, lihat `ARCHITECTURE.md`; untuk alur per role
ringkas, lihat `USERFLOW.md`.*




