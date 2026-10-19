<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { ReimbursementItem } from '~/types'
import { formatRp } from '~/utils/format'
import { formatDateId, mapReimbursement } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { REIMBURSEMENT_STATUS } from '~/constants/domain'
import { useAppStore } from '~/stores/app'

const { canFinance } = storeToRefs(useAppStore())

type ReimDisplay = ReimbursementItem & {
  travelDates: string
  origin: string
  destination: string
  reconciliationLabel: string
  reconciliationClass: string
  reconciliationIcon: string
  receiptLabel: string
  receiptClass: string
  receiptIcon: string
  receiptIconClass: string
  auditLabel: string
  auditClass: string
  auditDotClass?: string
  avatarAlt: string
  title: string
  /** Flag alur finance dari backend (FinanceFlow) — bukan turunan label. */
  canVerify: boolean
  canSettle: boolean
  canReject: boolean
  settled: boolean
  rejected: boolean
  decidedByLabel: string
}

function fmtWhen(v: string | null | undefined): string {
  if (!v) return ''
  try {
    return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(v)
  }
}

const api = useApi()

const searchQuery = ref('')
const debouncedSearch = useDebounce(searchQuery, 300)
const selected = ref<Set<string>>(new Set())
const toast = useToast()

const { data: listRes } = await useAsyncData('reimbursements', () => api<LaravelPaginator<any>>('/reimbursements', {
  params: { search: debouncedSearch.value.trim() || undefined, per_page: 50 },
}), { watch: [debouncedSearch] })
const { data: summary } = await useAsyncData('reimbursements-summary', () => api<{
  total_claimed: number; total_advance: number; net_reimbursement: number; pending_count: number
}>('/reimbursements-summary'))
// Daftar TR untuk form pengajuan — backend sudah men-scope: non-Finance/SA
// hanya menerima TR miliknya sendiri, jadi dropdown otomatis benar per role.
const { data: claimTravelOptions } = await useAsyncData('reim-travel-options', () => api<LaravelPaginator<any>>('/travel-requests', { params: { per_page: 50 } }))
const claimTravels = computed<any[]>(() => paginatorMeta(claimTravelOptions.value?.data ? claimTravelOptions.value : []).items)

const showClaim = ref(false)
const claimSaving = ref(false)
const claimForm = reactive({
  travel_request_id: '' as string | number,
  actual_expense: '' as string | number,
  advance: '' as string | number,
  receipt_count: '' as string | number,
})
const showClaimConfirm = ref(false)
async function submitClaim() {
  if (!claimForm.travel_request_id || claimForm.actual_expense === '') {
    toast.show('Pilih travel request dan isi pengeluaran riil.', 'info', 'info')
    return
  }
  showClaimConfirm.value = false
  claimSaving.value = true
  try {
    await api('/reimbursements', {
      method: 'POST',
      body: {
        travel_request_id: Number(claimForm.travel_request_id),
        actual_expense: Number(claimForm.actual_expense),
        advance: claimForm.advance !== '' ? Number(claimForm.advance) : 0,
        receipt_count: claimForm.receipt_count !== '' ? Number(claimForm.receipt_count) : 0,
        // Status awal klaim mandiri; verifikasi & OCR dilakukan Finance.
        ocr_status: 'Belum Diverifikasi',
      },
    })
    showClaim.value = false
    claimForm.travel_request_id = ''
    claimForm.actual_expense = ''
    claimForm.advance = ''
    claimForm.receipt_count = ''
    toast.show('Klaim reimbursement berhasil diajukan. Menunggu audit finance.')
    await refreshNuxtData(['reimbursements', 'reimbursements-summary'])
  } catch {
    toast.show('Gagal mengajukan klaim. Periksa isian.', 'error', 'error')
  } finally {
    claimSaving.value = false
  }
}

function splitRoute(route: string): [string, string] {
  // Backend memisahkan asal → tujuan dengan "→". String aslinya pernah tersimpan
  // sebagai mojibake ("â†’") sehingga kolom Rute selalu menampilkan nilai yang sama.
  const parts = String(route ?? '').split(/\s*(?:→|â†’)\s*/).map(s => s.trim()).filter(Boolean)
  return [parts[0] || '-', parts[1] || parts[0] || '-']
}

const reimbursements = computed<ReimDisplay[]>(() =>
  paginatorMeta(listRes.value?.data ? listRes.value : []).items.map((r: any) => {
    const base = mapReimbursement(r)
    const [origin, destination] = splitRoute(r.travel_request?.route)
    const isReimburse = String(r.reconciliation ?? '').startsWith('+')
    const ocr = r.ocr_status ?? 'Valid'
    // Status & flag alur datang dari backend (FinanceFlow). JANGAN simpulkan
    // "giliran siapa" dari teks label — dulu `auditLabel.includes('Menunggu')`
    // membuat tombol Verifikasi tetap muncul setelah klaim terverifikasi,
    // sehingga diklik tidak mengubah apa pun (tombol "tidak bereaksi").
    const canVerify = r.can_verify === true
    const canSettle = r.can_settle === true
    const canReject = r.can_reject === true
    const decidedBy = r.decided_by?.name ?? ''
    const decidedAt = r.decided_at
    const settled = r.status === REIMBURSEMENT_STATUS.APPROVED
    const rejected = r.status === REIMBURSEMENT_STATUS.REJECTED

    const auditLabel = settled
      ? 'Sudah Disettle'
      : rejected ? 'Ditolak / Butuh Bukti'
        : canSettle ? 'Siap Disettle oleh Finance'
          : canVerify ? 'Menunggu Verifikasi Anda'
            : ocr === 'Deviasi Plafon' ? 'Deviasi Plafon (>14%)'
              : String(r.status ?? '-')
    return {
      ...base,
      origin, destination,
      travelDates: `${formatDateId(r.travel_request?.start_date)} - ${formatDateId(r.travel_request?.end_date)}`,
      reconciliationLabel: r.reconciliation ?? '-',
      reconciliationClass: isReimburse ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-surface-container text-on-surface',
      reconciliationIcon: isReimburse ? 'add_circle' : 'assignment_return',
      receiptLabel: `${r.receipt_count ?? 0} Resi (${ocr === 'Valid' ? 'OCR Valid' : ocr})`,
      receiptClass: ocr === 'Ditolak' ? 'bg-error-container text-error' : 'bg-surface-container-low text-[#3e4a3c]',
      receiptIcon: ocr === 'Valid' ? 'verified' : ocr === 'Ditolak' ? 'file_open' : 'receipt',
      receiptIconClass: ocr === 'Valid' ? 'text-primary' : ocr === 'Ditolak' ? 'text-error' : 'text-muted',
      auditLabel,
      canVerify,
      canSettle,
      canReject,
      settled,
      rejected,
      decidedByLabel: decidedBy ? `Sudah diverifikasi oleh ${decidedBy}${decidedAt ? ` · ${fmtWhen(decidedAt)}` : ''}` : (settled ? 'Sudah diselesaikan' : ''),
      auditClass: r.status === REIMBURSEMENT_STATUS.APPROVED
        ? 'bg-secondary-container text-[#2e6f3c]'
        : r.status === REIMBURSEMENT_STATUS.REJECTED || ocr === 'Deviasi Plafon' || ocr === 'Ditolak'
          ? 'bg-error-container text-error'
          : 'bg-surface-container text-on-surface',
      auditDotClass: r.status === REIMBURSEMENT_STATUS.APPROVED ? undefined : 'bg-[#54615b]',
      avatarAlt: `Foto ${base.employee.name}`,
      title: base.employee.department,
      _rawId: r.id,
      _requesterId: r.travel_request?.user_id,
    } as ReimDisplay & { _rawId: number; _requesterId: number }
  }),
)

const activeTab = ref('Semua Klaim')
const tabs = computed(() => {
  const all = reimbursements.value
  // Dua aksi BERBEDA: "Perlu Verifikasi" = masih di Menunggu Audit (aksi
  // Verifikasi), "Siap Settlement" = sudah terverifikasi (aksi Settlement).
  // Dulu keduanya dijumlahkan jadi satu sehingga tidak jelas mana giliran.
  const needVerify = all.filter(r => r.canVerify).length
  const ready = all.filter(r => r.canSettle).length
  const settled = all.filter(r => r.settled).length
  const revisi = all.filter(r => r.status === REIMBURSEMENT_STATUS.REJECTED).length
  return [
    { label: 'Semua Klaim', badge: `(${all.length})`, count: all.length },
    { label: 'Perlu Verifikasi', badge: `(${needVerify})`, count: needVerify, emphasis: 'text-primary' },
    { label: 'Siap Settlement', badge: `(${ready})`, count: ready, emphasis: 'text-primary' },
    { label: 'Perlu Revisi / Resubmit', badge: `(${revisi})`, count: revisi, emphasis: 'text-error' },
    { label: 'Selesai', badge: `(${settled})`, count: settled },
  ] as const
})

function showToast(msg: string) { toast.show(msg) }

// Klaim dengan rekonsiliasi negatif ("- Rp ... Setor Balik Kas") dari daftar
// yang dimuat. Angka rupiahnya memakai net summary (negatif = kas bon balik).
const setorBalikCount = computed(() => reimbursements.value.filter(r => r.reconciliationLabel.startsWith('-')).length)

const showSop = ref(false)
function contactHelpdesk() {
  if (import.meta.client) window.location.href = 'mailto:admin@sixago.local?subject=Helpdesk%20Audit%20Reimbursement'
}

const filtered = computed(() => {
  let list = reimbursements.value
  if (activeTab.value !== 'Semua Klaim') {
    // Filter tab ikut memakai flag backend yang sama dengan hitungan KPI di atas,
// supaya isi tab dan angkanya tidak pernah beda.
    if (activeTab.value.includes('Verifikasi')) list = list.filter(r => r.canVerify)
    else if (activeTab.value.includes('Settlement')) list = list.filter(r => r.canSettle)
    else if (activeTab.value.includes('Revisi')) list = list.filter(r => r.status === REIMBURSEMENT_STATUS.REJECTED)
    else if (activeTab.value.includes('Selesai')) list = list.filter(r => r.settled)
  }
  return list
})

function toggleSelect(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selected.value = s
}
function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  selected.value = checked ? new Set(filtered.value.map(r => r.id)) : new Set()
}
function rawIdOf(id: string) {
  return (reimbursements.value.find(r => r.id === id) as unknown as { _rawId: number } | undefined)?._rawId ?? 0
}
async function sendRevisionNotice(id: string) {
  const row: any = reimbursements.value.find(r => r.id === id)
  try {
    await api('/notifications', {
      method: 'POST',
      body: {
        user_id: row?._requesterId,
        title: `Revisi diperlukan untuk klaim ${id}`,
        message: 'Mohon lengkapi bukti nota dan ajukan ulang klaim Anda.',
        type: 'Finance', category: 'finance', reference_id: id,
      },
    })
    toast.show(`Notifikasi revisi untuk ${id} dikirim.`)
  } catch {
    toast.show('Gagal mengirim notifikasi revisi.', 'error', 'error')
  }
}
// Konfirmasi untuk aksi irreversible-ish (Verifikasi / Setujui Settlement).
// Dulu keduanya sekali klik — salah klik berarti klaim melompat tahap tanpa sadar.
const claimConfirm = ref<{ open: boolean; action: 'verify' | 'settlement'; id: string; title: string; desc: string; confirmLabel: string; saving: boolean }>({
  open: false, action: 'verify', id: '', title: '', desc: '', confirmLabel: '', saving: false,
})
function openClaimConfirm(r: ReimDisplay, action: 'verify' | 'settlement') {
  claimConfirm.value = {
    open: true,
    action,
    id: r.id,
    title: action === 'verify' ? 'Verifikasi Klaim?' : 'Setujui Settlement?',
    desc: action === 'verify'
      ? `Klaim ${r.id} akan ditandai "Menunggu Verifikasi Finance". Anda tidak bisa memverifikasi ulang klaim yang sama setelahnya.`
      : `Klaim ${r.id} akan ditandai "Disetujui" dan proses dianggap selesai — dana dilepas ke pemohon.`,
    confirmLabel: action === 'verify' ? 'Ya, Verifikasi' : 'Ya, Setujui Settlement',
    saving: false,
  }
}
async function submitClaimConfirm() {
  claimConfirm.value.saving = true
  try {
    await decideClaim(claimConfirm.value.id, claimConfirm.value.action)
    claimConfirm.value.open = false
  } finally {
    claimConfirm.value.saving = false
  }
}

async function decideClaim(id: string, action: 'verify' | 'reject' | 'settlement', note?: string) {
  try {
    const res = await api<{ message: string }>(`/reimbursements/${rawIdOf(id)}/verify`, { method: 'POST', body: { action, note: note || undefined } })
    toast.show(res.message)
    await refreshNuxtData(['reimbursements', 'reimbursements-summary'])
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal memverifikasi klaim.', 'error', 'error')
  }
}
// Penolakan wajib alasan (backend 422 bila kosong) — via modal, bukan sekali klik.
const showClaimReject = ref(false)
const rejectClaimId = ref('')
const rejectClaimNote = ref('')
const rejectClaimSaving = ref(false)
function openClaimReject(id: string) {
  rejectClaimId.value = id
  rejectClaimNote.value = ''
  showClaimReject.value = true
}
async function submitClaimReject() {
  if (rejectClaimNote.value.trim().length < 3) {
    toast.show('Alasan penolakan wajib diisi (minimal 3 karakter).', 'error', 'error')
    return
  }
  rejectClaimSaving.value = true
  try {
    await decideClaim(rejectClaimId.value, 'reject', rejectClaimNote.value.trim())
    showClaimReject.value = false
  } finally {
    rejectClaimSaving.value = false
  }
}
async function reloadData() {
  await refreshNuxtData(['reimbursements', 'reimbursements-summary'])
  toast.show('Data reimbursement dimuat ulang.')
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans mt-4">
    <!-- Header Banner & Action Group --> 
    <!-- KPI Reconciliation Analytics Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-surface-container-low transition-transform group-hover:scale-125" aria-hidden="true" />
        <div class="flex items-center justify-between relative z-10">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Klaim Diajukan</span>
          <div class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-primary-dark"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">receipt_long</span></div>
        </div>
        <div class="mt-4 relative z-10">
          <div class="text-2xl font-bold">{{ formatRp(Number(summary?.total_claimed ?? 0)) }}</div>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-muted"><span class="text-primary font-semibold text-xs">{{ filtered.length }} laporan</span><span>settlement masuk</span></div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-surface-container-low transition-transform group-hover:scale-125" aria-hidden="true" />
        <div class="flex items-center justify-between relative z-10">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Uang Muka Terpotong</span>
          <div class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">savings</span></div>
        </div>
        <div class="mt-4 relative z-10">
          <div class="text-2xl font-bold">{{ formatRp(Number(summary?.total_advance ?? 0)) }}</div>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-muted"><span class="text-secondary font-semibold">Saldo Kas Bon</span><span>dikompensasi</span></div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-secondary-container/40 transition-transform group-hover:scale-125" aria-hidden="true" />
        <div class="flex items-center justify-between relative z-10">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-primary-dark">Net Reimbursement</span>
          <div class="w-9 h-9 rounded-full bg-secondary-container text-[#2e6f3c] flex items-center justify-center"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">outbound</span></div>
        </div>
        <div class="mt-4 relative z-10">
          <div class="text-2xl font-bold text-primary-dark">{{ formatRp(Number(summary?.net_reimbursement ?? 0)) }}</div>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-muted"><span class="w-2 h-2 rounded-full bg-primary" aria-hidden="true" /><span>Perusahaan bayar ke karyawan</span></div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-surface-container/60 transition-transform group-hover:scale-125" aria-hidden="true" />
        <div class="flex items-center justify-between relative z-10">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-[#3e4a3c]">Sisa Kas Bon Balik</span>
          <div class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">assignment_return</span></div>
        </div>
        <div class="mt-4 relative z-10">
          <div class="text-2xl font-bold">{{ formatRp(Math.abs(Math.min(Number(summary?.net_reimbursement ?? 0), 0))) }}</div>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-muted"><span class="font-semibold text-on-surface">{{ setorBalikCount }} klaim</span><span>wajib setor balik</span></div>
        </div>
      </div>
    </div>

    <!-- Main Workflow Card Matrix -->
    <div class="flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="p-6 pb-3 flex flex-col gap-4">
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            v-for="t in tabs" :key="t.label"
            :class="activeTab===t.label ? 'bg-secondary-container text-[#2e6f3c] shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'"
            class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1"
            @click="activeTab=t.label"
          >
            {{ t.label }} <span :class="(t as any).emphasis ?? 'opacity-75'" class="ml-1 font-bold">{{ t.badge }}</span>
          </button>
        </div>
        <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1">
          <div class="relative flex-1 max-w-xl">
            <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-muted text-[18px] pointer-events-none" aria-hidden="true">search</span>
            <input v-model="searchQuery" aria-label="Cari klaim atau nama pegawai" class="w-full pl-11 pr-9 py-2.5 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 shadow-sm transition-all" placeholder="Cari No. Klaim, Travel Request ID, nama pegawai..." type="text">
            <button v-if="searchQuery" aria-label="Hapus pencarian" class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white hover:bg-surface-container flex items-center justify-center text-muted transition-colors" @click="searchQuery = ''"><span class="material-symbols-outlined text-[16px]">close</span></button>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <!-- Filter departemen/kategori/periode belum tersedia di API — hanya search + reload -->
            <button aria-label="Muat ulang data" title="Muat Ulang Data" class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container text-muted flex items-center justify-center transition-colors" @click="reloadData"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">sync</span></button>
            <button aria-label="Ajukan klaim reimbursement" class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:opacity-95 shadow-sm transition-all" @click="showClaim = true">
              <span class="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
              <span>Ajukan Klaim</span>
            </button>
          </div>
        </div>
      </div>

      <div class="w-full overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-container-low text-[#3e4a3c] text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10">
            <tr>
              <th class="py-3 px-6 w-12 text-center"><input :checked="selected.size===filtered.length && filtered.length>0" aria-label="Pilih semua" class="rounded accent-primary cursor-pointer w-4 h-4" type="checkbox" @change="toggleAll"></th>
              <th class="py-3 px-3 whitespace-nowrap">No. Klaim &amp; Ref TR</th>
              <th class="py-3 px-3">Karyawan Pemohon</th>
              <th class="py-3 px-3">Detail Perjalanan</th>
              <th class="py-3 px-3 text-right whitespace-nowrap">Pengeluaran Riil</th>
              <th class="py-3 px-3 text-right whitespace-nowrap">Kas Bon Diterima</th>
              <th class="py-3 px-3 text-center">Status Rekonsiliasi</th>
              <th class="py-3 px-3 text-center">Bukti Nota / Resi</th>
              <th class="py-3 px-3">Audit Status</th>
              <th class="py-3 px-6 text-right">Aksi Verifikasi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low">
            <tr v-for="r in filtered" :key="r.id" class="hover:bg-surface-container-low/50 transition-colors">
              <td class="py-3 px-6 text-center"><input :checked="selected.has(r.id)" :aria-label="`Pilih ${r.id}`" class="rounded accent-primary cursor-pointer w-4 h-4" type="checkbox" @change="toggleSelect(r.id)"></td>
              <td class="py-3 px-3 whitespace-nowrap">
                <div class="flex flex-col"><span class="text-sm font-bold text-primary-dark">{{ r.id }}</span><span class="text-xs text-muted">Ref: {{ r.requestId }}</span></div>
              </td>
              <td class="py-3 px-3">
                <div class="flex items-center gap-2">
                  <img v-if="r.employee.avatar" :src="r.employee.avatar" :alt="`Foto ${r.employee.name}`" class="w-10 h-10 rounded-full object-cover shadow-sm" loading="lazy" width="40" height="40" decoding="async">
                  <div v-else class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface text-sm font-bold" aria-hidden="true">AM</div>
                  <div class="flex flex-col"><span class="text-sm font-medium">{{ r.employee.name }}</span><span class="text-xs text-muted truncate">{{ r.title }}</span></div>
                </div>
              </td>
              <td class="py-3 px-3 whitespace-nowrap">
                <div class="flex flex-col">
                  <div class="flex items-center gap-1 text-sm font-medium"><span>{{ r.origin }}</span><span class="material-symbols-outlined text-[14px] text-muted" aria-hidden="true">arrow_forward</span><span>{{ r.destination }}</span></div>
                  <span class="text-xs text-muted">{{ r.travelDates }}</span>
                </div>
              </td>
              <td class="py-3 px-3 text-right font-semibold whitespace-nowrap">{{ formatRp(r.actualExpense) }}</td>
              <td class="py-3 px-3 text-right text-muted whitespace-nowrap">{{ formatRp(r.advance) }}</td>
              <td class="py-3 px-3 text-center whitespace-nowrap"><span :class="r.reconciliationClass" class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full"><span class="material-symbols-outlined text-[14px]" aria-hidden="true">{{ r.reconciliationIcon }}</span> {{ r.reconciliationLabel }}</span></td>
              <td class="py-3 px-3 text-center whitespace-nowrap"><span :class="r.receiptClass" class="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full"><span :class="r.receiptIconClass" class="material-symbols-outlined text-[16px]" aria-hidden="true">{{ r.receiptIcon }}</span> {{ r.receiptLabel }}</span></td>
              <td class="py-3 px-3 whitespace-nowrap">
                <span :class="r.auditClass" class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                  <span v-if="r.auditDotClass" :class="r.auditDotClass" class="w-1.5 h-1.5 rounded-full" aria-hidden="true" />
                  <span v-else class="material-symbols-outlined text-[14px]" aria-hidden="true">{{ r.status===REIMBURSEMENT_STATUS.APPROVED ? 'verified' : r.status===REIMBURSEMENT_STATUS.REJECTED ? 'block' : 'warning' }}</span>
                  {{ r.auditLabel }}
                </span>
              </td>
              <td class="py-3 px-6 text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Aksi dari flag backend, bukan dari teks label -->
                  <template v-if="r.canReject && canFinance">
                    <button aria-label="Tolak atau minta revisi nota" class="w-8 h-8 rounded-full bg-error-container text-error hover:bg-error hover:text-white flex items-center justify-center transition-colors" @click="openClaimReject(r.id)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
                  </template>

                  <button
                    v-if="r.canVerify && canFinance"
                    aria-label="Verifikasi klaim"
                    class="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-semibold hover:opacity-95 shadow-sm flex items-center gap-1"
                    @click="openClaimConfirm(r, 'verify')"
                  ><span class="material-symbols-outlined text-[16px]" aria-hidden="true">check</span> Verifikasi</button>

                  <button
                    v-else-if="r.canSettle && canFinance"
                    aria-label="Setujui settlement"
                    class="px-3 py-1.5 rounded-full bg-secondary text-white text-xs font-semibold hover:opacity-90 shadow-sm flex items-center gap-1"
                    @click="openClaimConfirm(r, 'settlement')"
                  ><span class="material-symbols-outlined text-[16px]" aria-hidden="true">task_alt</span> Setujui Settlement</button>

                  <span
                    v-else-if="r.decidedByLabel"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container text-[#2e6f3c] text-[11px] font-semibold max-w-[220px]"
                  >
                    <span class="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">verified</span>
                    <span class="truncate">{{ r.decidedByLabel }}</span>
                  </span>

                  <span v-else-if="!canFinance" class="text-[11px] text-muted text-right">Menunggu keputusan Finance</span>
                  <span v-else-if="r.rejected" class="text-[11px] text-muted text-right">Selesai</span>
                </div>
              </td>
            </tr>
            <tr v-if="filtered.length===0"><td colspan="10" class="p-0"><EmptyState icon="receipt_long" title="Tidak ada klaim cocok" :message="`Tidak ada hasil untuk &quot;${searchQuery}&quot;. Coba kata kunci lain.`"><BaseButton variant="outline" size="sm" class="mt-3" @click="searchQuery=''; activeTab='Semua Klaim'">Hapus filter</BaseButton></EmptyState></td></tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 bg-surface-container-low/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
        <span>Menampilkan <strong class="text-on-surface">{{ filtered.length }}</strong> laporan klaim aktif</span>
        <div class="flex items-center gap-1">
          <button disabled aria-label="Halaman sebelumnya" class="w-8 h-8 rounded-full bg-white text-muted flex items-center justify-center shadow-sm disabled:opacity-40"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span></button>
          <button aria-label="Halaman 1" class="w-8 h-8 rounded-full bg-primary text-white text-xs flex items-center justify-center shadow-sm">1</button>
          <button aria-label="Halaman 2" class="w-8 h-8 rounded-full bg-white text-on-surface hover:bg-surface-container text-xs flex items-center justify-center shadow-sm">2</button>
          <button aria-label="Halaman 3" class="w-8 h-8 rounded-full bg-white text-on-surface hover:bg-surface-container text-xs flex items-center justify-center shadow-sm">3</button>
          <button aria-label="Halaman berikutnya" class="w-8 h-8 rounded-full bg-white text-muted hover:text-on-surface flex items-center justify-center shadow-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span></button>
        </div>
      </div>
    </div>

    <!-- Interactive Drawer / Policy Callout Container -->
    <div class="rounded-xl bg-surface-container p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
      <div class="flex items-start gap-3 z-10 max-w-4xl">
        <div class="w-12 h-12 rounded-full bg-white flex items-center justify-center text-primary-dark shrink-0 shadow-sm"><span class="material-symbols-outlined text-[24px]" aria-hidden="true">gavel</span></div>
        <div class="flex flex-col gap-1">
          <span class="text-sm font-bold">Ketentuan &amp; Tata Tertib Settlement Finance</span>
          <p class="text-sm text-[#3e4a3c]">Wajib menyertakan struk resmi fisik atau e-receipt valid mencantumkan NIB/NPWP vendor dan diajukan maksimal <strong>3 hari kerja</strong> setelah kepulangan sesuai SOP Kebijakan Travel Korporat. Pelanggaran batas waktu dapat menangguhkan pencairan klaim berikutnya.</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 z-10 w-full md:w-auto justify-end flex-wrap">
        <BaseButton variant="outline" @click="showSop = true">Pelajari SOP Travel</BaseButton>
        <BaseButton variant="secondary" @click="contactHelpdesk">Hubungi Helpdesk Audit</BaseButton>
      </div>
    </div>

    <!-- Modal Ajukan Klaim -->
    <div v-if="showClaim" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showClaim = false">
      <form class="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto" @submit.prevent="showClaimConfirm = true">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Ajukan Klaim Reimbursement</h2>
          <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showClaim = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <p class="text-xs text-muted">Klaim tercatat <strong class="text-on-surface">Menunggu Audit</strong> dan diverifikasi Finance. Rekonsiliasi (reimbursable / setor balik) dihitung otomatis oleh sistem.</p>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="claimTr">Travel Request <span class="text-error">*</span></label>
          <select id="claimTr" v-model="claimForm.travel_request_id" required aria-label="Travel request" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white cursor-pointer">
            <option value="" disabled>Pilih travel request...</option>
            <option v-for="t in claimTravels" :key="t.id" :value="t.id">{{ t.request_no }} — {{ t.route }}</option>
          </select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="text-sm font-medium" for="claimActual">Pengeluaran Riil (Rp) <span class="text-error">*</span></label>
            <input id="claimActual" v-model="claimForm.actual_expense" required type="number" min="0" aria-label="Pengeluaran riil" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="9350000">
            <p v-if="claimForm.actual_expense !== ''" class="text-xs text-secondary font-semibold">= {{ formatRp(Number(claimForm.actual_expense || 0)) }}</p>
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium" for="claimAdvance">Uang Muka Diterima (Rp)</label>
            <input id="claimAdvance" v-model="claimForm.advance" type="number" min="0" aria-label="Uang muka diterima" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="5000000">
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="claimReceipts">Jumlah Resi / Nota</label>
          <input id="claimReceipts" v-model="claimForm.receipt_count" type="number" min="0" aria-label="Jumlah resi" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="12">
        </div>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="showClaim = false">Batal</button>
          <BaseButton variant="primary" type="submit" icon="send" :disabled="claimSaving">{{ claimSaving ? 'Menyimpan...' : 'Ajukan Klaim' }}</BaseButton>
        </div>
      </form>
    </div>
    <AppConfirmModal
      :open="showClaimConfirm"
      title="Ajukan klaim sebesar ini?"
      :message="`Realisasi ${claimForm.actual_expense !== '' ? formatRp(Number(claimForm.actual_expense || 0)) : '-'} dikurangi uang muka. Periksa lagi — kelebihan satu nol berarti 10× lipat.`"
      confirm-label="Ya, Ajukan"
      icon="receipt_long"
      :loading="claimSaving"
      @close="showClaimConfirm = false"
      @confirm="submitClaim"
    />

    <!-- Modal Tolak Klaim (alasan wajib) -->
    <div v-if="showClaimReject" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showClaimReject = false">
      <form class="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 flex flex-col space-y-4" @submit.prevent="submitClaimReject">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Tolak Klaim {{ rejectClaimId }}</h2>
          <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showClaimReject = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <p class="text-xs text-muted">Alasan wajib diisi (minimal 3 karakter) agar pemohon bisa memperbaiki bukti. Terekam di audit.</p>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted" for="claimRejectNote">Alasan Penolakan *</label>
          <textarea id="claimRejectNote" v-model="rejectClaimNote" required minlength="3" rows="3" aria-label="Alasan penolakan klaim" class="w-full p-3 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="Contoh: Resi tidak terbaca, mohon unggah ulang..." />
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="showClaimReject = false">Batal</button>
          <button type="submit" :disabled="rejectClaimSaving" class="px-5 py-2 rounded-full bg-error text-white text-sm font-semibold disabled:opacity-60">{{ rejectClaimSaving ? 'Memproses...' : 'Tolak Klaim' }}</button>
        </div>
      </form>
    </div>

    <!-- Modal konfirmasi Verifikasi / Setujui Settlement -->
    <div v-if="claimConfirm.open" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="claimConfirm.open = false">
      <div class="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 flex flex-col space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="claimConfirm.action === 'verify' ? 'bg-primary/10 text-primary' : 'bg-secondary/15 text-secondary'">
            <span class="material-symbols-outlined text-[24px]" aria-hidden="true">{{ claimConfirm.action === 'verify' ? 'verified' : 'task_alt' }}</span>
          </div>
          <h2 class="text-base font-bold">{{ claimConfirm.title }}</h2>
        </div>
        <p class="text-sm text-muted">{{ claimConfirm.desc }}</p>
        <div class="flex items-center justify-end gap-2">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="claimConfirm.open = false">Batal</button>
          <button
            type="button"
            :disabled="claimConfirm.saving"
            class="px-5 py-2 rounded-full text-white text-sm font-semibold disabled:opacity-60"
            :class="claimConfirm.action === 'verify' ? 'bg-primary' : 'bg-secondary'"
            @click="submitClaimConfirm"
          >{{ claimConfirm.saving ? 'Memproses...' : claimConfirm.confirmLabel }}</button>
        </div>
      </div>
    </div>

    <!-- Modal SOP Settlement -->
    <div v-if="showSop" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showSop = false">
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 flex flex-col space-y-3 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">SOP Settlement Finance</h2>
          <button aria-label="Tutup SOP" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showSop = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <ol class="text-sm space-y-2 list-decimal list-inside text-[#3e4a3c]">
          <li>Sertakan struk resmi fisik atau e-receipt valid yang mencantumkan NIB/NPWP vendor.</li>
          <li>Ajukan maksimal <strong>3 hari kerja</strong> setelah kepulangan.</li>
          <li>Kelebihan kas bon wajib disetor balik; kekurangan dibayar via reimbursement.</li>
          <li>Klaim melewati plafon otomatis berstatus Deviasi Plafon dan butuh review finance.</li>
          <li>Pelanggaran batas waktu dapat menangguhkan pencairan klaim berikutnya.</li>
        </ol>
        <div class="flex justify-end"><BaseButton variant="primary" size="sm" @click="showSop = false">Mengerti</BaseButton></div>
      </div>
    </div>

    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
