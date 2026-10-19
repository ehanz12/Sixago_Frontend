<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { AdvanceItem } from '~/types'
import { formatRp } from '~/utils/format'
import { formatDateId, mapAdvance, downloadExport } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { ADVANCE_STATUS } from '~/constants/domain'
import { useAppStore } from '~/stores/app'

type AdvanceDisplay = AdvanceItem & {
  travelId: string
  dateLabel: string
  slaLabel: string
  slaIcon: string
  slaClass: string
  purpose: string
  destination: string
  accountName: string
  statusLabel: string
  statusClass: string
  dotClass: string
  avatar: string
  avatarAlt: string
  title: string
  nik: string
  /** Flag alur finance dari backend (FinanceFlow) — bukan turunan statusLabel. */
  canDecide: boolean
  canDisburse: boolean
  disburseInfo: string
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
const { canFinance } = storeToRefs(useAppStore())
const config = useRuntimeConfig()
const storageBase = `${String(config.public.apiBase).replace(/\/api$/, '')}/storage`

const showDisburse = ref(false)
const disburseTarget = ref<(AdvanceDisplay & { _rawId: number }) | null>(null)
const disburseRef = ref('')
const disburseFile = ref<File | null>(null)
const disburseSaving = ref(false)

function openDisburse(a: AdvanceDisplay) {
  disburseTarget.value = a as AdvanceDisplay & { _rawId: number }
  disburseRef.value = ''
  disburseFile.value = null
  showDisburse.value = true
}

function onProofChange(e: Event) {
  const input = e.target as HTMLInputElement
  disburseFile.value = input.files?.[0] ?? null
}

async function submitDisburse() {
  if (!disburseTarget.value || !disburseRef.value.trim()) {
    showToast('Nomor referensi transfer wajib diisi.')
    return
  }
  disburseSaving.value = true
  try {
    const form = new FormData()
    form.append('transfer_ref', disburseRef.value.trim())
    if (disburseFile.value) form.append('proof', disburseFile.value)
    const res = await api<{ message: string }>(`/advances/${disburseTarget.value._rawId}/disburse`, { method: 'POST', body: form })
    showToast(res.message)
    showDisburse.value = false
    await reloadAdv()
  } catch { showToast('Gagal memproses pencairan.') }
  finally { disburseSaving.value = false }
}

const activeTab = ref('Semua')
const searchQuery = ref('')
const debouncedSearch = useDebounce(searchQuery, 300)
const departemen = ref('')
// Opsi wajib sama persis dengan nilai `method` di backend
// (AdvanceController@index memfilter where('method', ...) bila ≠ 'all').
const metode = ref('all')
const selected = ref<Set<string>>(new Set())
const toastMsg = ref('')
const toastVisible = ref(false)
const showCreate = ref(false)
const createForm = reactive({
  travel_request_id: '' as string | number,
  amount: '' as string | number,
  plafon: '' as string | number,
  account: '',
  account_name: '',
  method: 'Bank Transfer',
  purpose: '',
  destination: '',
})
const createSaving = ref(false)

// Plafon uang muka = plafon policy grade pemohon travel (otomatis, readonly).
type ApplicablePolicy = {
  policy_code: string
  grade: string
  user_grade: string
  days: number
  limit: number
}
const createPolicy = ref<ApplicablePolicy | null>(null)
const createPolicyLoading = ref(false)
watch(() => createForm.travel_request_id, async (id) => {
  createForm.plafon = ''
  createPolicy.value = null
  if (!id) return
  createPolicyLoading.value = true
  try {
    const res = await api<{ policy: ApplicablePolicy | null }>('/travel-policies/applicable', {
      params: { travel_request_id: Number(id) },
    })
    createPolicy.value = res.policy
    if (res.policy) createForm.plafon = res.policy.limit
  } catch {
    createPolicy.value = null
  } finally {
    createPolicyLoading.value = false
  }
})
const createOverPlafon = computed(() => {
  const amount = Number(createForm.amount || 0)
  const plafon = Number(createForm.plafon || 0)
  return amount > 0 && plafon > 0 && amount > plafon
})

const { data: listRes } = await useAsyncData('advances', () => api<LaravelPaginator<any>>('/advances', {
  params: { search: debouncedSearch.value.trim() || undefined, method: metode.value, per_page: 50 },
}), { watch: [debouncedSearch, metode] })
// Opsi departemen dari API (backend tidak punya filter departemen untuk
// advances, jadi filter tetap lokal — tapi opsinya data nyata).
const { data: advDeptRes } = await useAsyncData('adv-departments', () => api<LaravelPaginator<any>>('/departments', { params: { per_page: 100 } }))
const deptOptions = computed<string[]>(() => paginatorMeta(advDeptRes.value?.data ? advDeptRes.value : []).items.map((d: any) => String(d.name)))
const { data: summary } = await useAsyncData('advances-summary', () => api<{
  total_disbursed: number; pending_count: number; pending_amount: number; ready_count: number; ready_amount: number
}>('/advances-summary'))
const { data: travelOptions } = await useAsyncData('adv-travel-options', () => api<LaravelPaginator<any>>('/travel-requests', { params: { per_page: 50 } }))

const advances = computed<AdvanceDisplay[]>(() =>
  paginatorMeta(listRes.value?.data ? listRes.value : []).items.map((a: any) => {
    const base = mapAdvance(a)
    const statusLabel = a.status === ADVANCE_STATUS.READY ? 'Approved - Ready to Pay'
      : a.status === ADVANCE_STATUS.PAID ? 'Paid / Transferred' : a.status
    const sla = a.status === ADVANCE_STATUS.READY
      ? { slaLabel: 'Siap Transfer', slaIcon: 'timer', slaClass: 'text-primary' }
      : a.status === ADVANCE_STATUS.PAID
        ? { slaLabel: 'Tuntas Terkirim', slaIcon: 'done_all', slaClass: 'text-muted' }
        : a.status === ADVANCE_STATUS.REJECTED
          ? { slaLabel: 'Ditolak Otomatis', slaIcon: 'block', slaClass: 'text-error' }
          : { slaLabel: 'Menunggu Finance', slaIcon: 'schedule', slaClass: 'text-muted' }
    // Flag alur dari backend (FinanceFlow) — jangan simpulkan dari label.
    const canDecide = a.can_decide === true
    const canDisburse = a.can_disburse === true
    const decidedBy = a.decided_by?.name ?? ''
    const decidedAt = a.decided_at
    const disburseInfo = canDisburse ? 'Menunggu pencairan Anda'
      : decidedBy && a.status === ADVANCE_STATUS.PAID
        ? `Dicairkan oleh ${decidedBy}${decidedAt ? ` · ${fmtWhen(decidedAt)}` : ''}`
        : decidedBy && a.status === ADVANCE_STATUS.READY
          ? `Disetujui oleh ${decidedBy}${decidedAt ? ` · ${fmtWhen(decidedAt)}` : ''}`
          : decidedBy ? `Diputuskan oleh ${decidedBy}` : ''
    return {
      ...base,
      requestId: a.travel_request?.request_no ?? '-',
      travelId: a.travel_request?.request_no ?? '-',
      accountName: a.account_name ?? '',
      dateLabel: formatDateId(a.created_at),
      ...sla,
      statusLabel,
      canDecide,
      canDisburse,
      disburseInfo,
      statusClass: a.status === ADVANCE_STATUS.REJECTED ? 'bg-error-container text-[#93000a]'
        : a.status === ADVANCE_STATUS.PAID ? 'bg-secondary-container/50 text-[#2e6f3c]'
          : a.status === ADVANCE_STATUS.PENDING ? 'bg-surface-container text-[#3e4a3c]'
            : 'bg-secondary-container text-[#2e6f3c]',
      dotClass: a.status === ADVANCE_STATUS.REJECTED ? 'bg-error' : 'bg-primary',
      title: `${base.employee.department} • NIK ${base.employee.nik}`,
      nik: base.employee.nik,
      avatar: base.employee.avatar,
      avatarAlt: `Foto ${base.employee.name}`,
      _rawId: a.id,
      _transferRef: a.transfer_ref ?? '',
      _proofUrl: a.proof_path ? `${storageBase}/${a.proof_path}` : '',
    } as AdvanceDisplay & { _rawId: number; _transferRef: string; _proofUrl: string }
  }),
)

const tabs = computed(() => {
  const all = advances.value
  const pending = all.filter(a => a.status === ADVANCE_STATUS.PENDING).length
  const ready = all.filter(a => a.status === ADVANCE_STATUS.READY).length
  const paid = all.filter(a => a.status === ADVANCE_STATUS.PAID).length
  const rejected = all.filter(a => a.status === ADVANCE_STATUS.REJECTED).length
  return [
    { label: 'Semua', count: all.length },
    { label: 'Pending Review', count: pending },
    { label: 'Disetujui', count: ready },
    { label: 'Sudah Ditransfer (Paid)', count: paid },
    { label: 'Ditolak', count: rejected },
  ]
})

// Kartu ke-4 memakai hitungan Paid dari daftar yang dimuat (per_page=50).
// Tidak ada endpoint khusus "kas bon beredar" — labelnya jujur soal sumbernya.
const paidOnList = computed(() => advances.value.filter(a => a.status === ADVANCE_STATUS.PAID).length)

const filtered = computed(() => {
  let list = advances.value
  if (activeTab.value !== 'Semua') {
    if (activeTab.value === 'Pending Review') list = list.filter(a => a.statusLabel.includes('Pending'))
    else if (activeTab.value === 'Disetujui') list = list.filter(a => a.statusLabel.includes('Approved'))
    else if (activeTab.value.includes('Ditransfer')) list = list.filter(a => a.status === ADVANCE_STATUS.PAID)
    else if (activeTab.value === 'Ditolak') list = list.filter(a => a.statusLabel === ADVANCE_STATUS.REJECTED)
  }
  if (departemen.value) list = list.filter(a => a.employee.department.includes(departemen.value))
  return list
})

function toggleSelect(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selected.value = s
}
function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  selected.value = checked ? new Set(filtered.value.map(a => a.id)) : new Set()
}
function showToast(msg: string) {
  toastMsg.value = msg; toastVisible.value = true
  setTimeout(() => toastVisible.value = false, 3000)
}
function rawIdOf(id: string) {
  return (advances.value.find(a => a.id === id) as unknown as { _rawId: number } | undefined)?._rawId ?? 0
}
async function reloadAdv() { await refreshNuxtData(['advances', 'advances-summary']) }
function handleDisburse(a: AdvanceDisplay) {
  openDisburse(a)
}
async function decideAdvance(id: string, action: 'approve' | 'reject', note?: string) {
  try {
    const res = await api<{ message: string }>(`/advances/${rawIdOf(id)}/decide`, { method: 'POST', body: { action, note: note || undefined } })
    showToast(res.message)
    await reloadAdv()
  } catch (e: any) {
    showToast(e?.data?.message || 'Gagal memproses keputusan.')
  }
}
// Penolakan wajib alasan (backend 422 bila kosong) — via modal, bukan sekali klik.
const showReject = ref(false)
const rejectTarget = ref<AdvanceDisplay | null>(null)
const rejectNote = ref('')
const rejectSaving = ref(false)
function openReject(a: AdvanceDisplay) {
  rejectTarget.value = a
  rejectNote.value = ''
  showReject.value = true
}
async function submitReject() {
  if (!rejectTarget.value || rejectNote.value.trim().length < 3) {
    showToast('Alasan penolakan wajib diisi (minimal 3 karakter).')
    return
  }
  rejectSaving.value = true
  try {
    await decideAdvance(rejectTarget.value.id, 'reject', rejectNote.value.trim())
    showReject.value = false
  } finally {
    rejectSaving.value = false
  }
}
async function exportAdv() {
  await downloadExport('advances', 'uang-muka.csv')
  showToast('File uang-muka.csv berhasil diunduh.')
}

const deleteTarget = ref<AdvanceDisplay | null>(null)
const deleteSaving = ref(false)
function canDeleteAdvance(a: AdvanceDisplay) {
  return canFinance.value && a.status !== ADVANCE_STATUS.PAID && a.status !== ADVANCE_STATUS.REJECTED
}
function openDeleteAdvance(a: AdvanceDisplay) {
  deleteTarget.value = a
  deleteSaving.value = false
}
function closeDeleteAdvance() { deleteTarget.value = null }
async function submitDeleteAdvance() {
  if (!deleteTarget.value) return
  deleteSaving.value = true
  try {
    await api(`/advances/${rawIdOf(deleteTarget.value.id)}`, { method: 'DELETE' })
    showToast(`Uang muka ${deleteTarget.value.id} dihapus.`)
    closeDeleteAdvance()
    await reloadAdv()
  } catch (e: any) {
    if (e?.status === 403) showToast('Hanya Finance Approver dan Super Admin yang dapat menghapus uang muka.')
    else showToast(e?.data?.message || 'Gagal menghapus uang muka.')
  } finally {
    deleteSaving.value = false
  }
}
const showCreateConfirm = ref(false)
async function submitCreate() {
  showCreateConfirm.value = false
  if (createOverPlafon.value) {
    showToast(`Nominal melebihi plafon policy (${formatRp(Number(createForm.plafon || 0))}).`)
    return
  }
  createSaving.value = true
  try {
    await api('/advances', {
      method: 'POST',
      body: {
        travel_request_id: Number(createForm.travel_request_id),
        amount: Number(createForm.amount),
        plafon: Number(createForm.plafon || 0),
        account: createForm.account || undefined,
        account_name: createForm.account_name || undefined,
        method: createForm.method,
        purpose: createForm.purpose || undefined,
        destination: createForm.destination || undefined,
      },
    })
    showCreate.value = false
    showToast('Pengajuan uang muka berhasil dibuat.')
    await reloadAdv()
  } catch { showToast('Gagal membuat pengajuan. Periksa isian.') }
  finally { createSaving.value = false }
}

</script>

<template>
  <div class="flex flex-col w-full space-y-6 pb-8 font-sans">
    <!-- Page Header & Action Bar -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mt-4">
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 text-xs font-medium text-muted">

        </div>

      </div>
      <div class="flex items-center gap-2 self-start lg:self-center flex-wrap">
        <button aria-label="Ekspor Data Excel atau CSV" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-on-surface hover:bg-surface-container-low shadow-sm transition-all text-sm font-medium" @click="exportAdv">
          <span class="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">file_download</span>
          <span>Ekspor Data (Excel/CSV)</span>
        </button>
        <button aria-label="Ajukan Uang Muka Baru" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:opacity-95 active:scale-95 transition-all" @click="showCreate = true">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
          <span>Ajukan Uang Muka Baru</span>
        </button>
      </div>
    </div>

    <!-- Financial Metrics Bento Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-secondary-container/20 group-hover:scale-110 transition-transform" aria-hidden="true" />
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Disbursed Bulan Ini</span>
          <div class="w-9 h-9 rounded-full bg-secondary-container/40 flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">payments</span>
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-bold tracking-tight">{{ formatRp(Number(summary?.total_disbursed ?? 0)) }}</div>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-xs text-muted">Akumulasi status Paid</span>
          </div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-surface-container/60 group-hover:scale-110 transition-transform" aria-hidden="true" />
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Menunggu Approval Finance</span>
          <div class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-[#3e4a3c]">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">pending_actions</span>
          </div>
        </div>
        <div class="mt-4">
          <div class="flex items-baseline gap-1.5"><span class="text-2xl font-bold">{{ summary?.pending_count ?? 0 }}</span><span class="text-sm text-muted">Permohonan ({{ formatRp(Number(summary?.pending_amount ?? 0)) }})</span></div>
          <div class="mt-1"><span class="text-xs bg-surface-container text-[#3e4a3c] px-2 py-0.5 rounded-full font-medium">Review SLA &lt; 24 Jam</span></div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-surface-container/60 group-hover:scale-110 transition-transform" aria-hidden="true" />
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Siap Ditransfer / Otorisasi</span>
          <div class="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center text-primary-dark">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">account_balance</span>
          </div>
        </div>
        <div class="mt-4">
          <div class="flex items-baseline gap-1.5"><span class="text-2xl font-bold">{{ summary?.ready_count ?? 0 }}</span><span class="text-sm text-muted">Pengajuan ({{ formatRp(Number(summary?.ready_amount ?? 0)) }})</span></div>
          <div class="mt-1"><span class="text-xs bg-surface-container text-on-surface px-2 py-0.5 rounded-full font-medium">Pending Disbursement</span></div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-error-container/20 group-hover:scale-110 transition-transform" aria-hidden="true" />
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Sudah Ditransfer</span>
          <div class="w-9 h-9 rounded-full bg-secondary-container/40 flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">done_all</span>
          </div>
        </div>
        <div class="mt-4">
          <div class="flex items-baseline gap-1.5"><span class="text-2xl font-bold">{{ paidOnList }}</span><span class="text-sm text-muted">Kas Bon Paid</span></div>
          <div class="mt-1"><span class="text-xs bg-surface-container text-[#3e4a3c] px-2 py-0.5 rounded-full font-medium">Dari daftar yang dimuat</span></div>
        </div>
      </div>
    </div>

    <!-- Operational Filter & Navigation Controls -->
    <div class="p-6 rounded-xl bg-white shadow-sm space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-1 p-1 bg-surface-container-low rounded-full overflow-x-auto">
          <button
            v-for="t in tabs" :key="t.label"
            :class="activeTab===t.label ? 'bg-white text-on-surface shadow-sm' : 'text-muted hover:text-on-surface'"
            class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5"
            @click="activeTab=t.label"
          >
            <span>{{ t.label }}</span>
            <span class="bg-surface-container text-[#3e4a3c] text-xs px-1.5 py-0.2 rounded-full">{{ t.count }}</span>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-2 pt-1">
        <div class="lg:col-span-5 relative">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-muted text-[18px]" aria-hidden="true">search</span>
          <input v-model="searchQuery" aria-label="Cari No. ADV atau nama karyawan" class="w-full pl-11 pr-4 py-2 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white shadow-sm transition-all" placeholder="Cari No. ADV, nama karyawan, atau ID Travel Request..." type="text">
        </div>
        <div class="lg:col-span-3">
          <div class="relative">
            <select v-model="departemen" aria-label="Filter departemen" class="w-full px-4 py-2 rounded-full bg-surface-container-low text-on-surface text-sm appearance-none focus:outline-none focus:bg-white cursor-pointer pr-8 shadow-sm">
              <option value="">Semua Departemen</option>
              <option v-for="d in deptOptions" :key="d" :value="d">{{ d }}</option>
            </select>
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[18px] pointer-events-none" aria-hidden="true">expand_more</span>
          </div>
        </div>
        <div class="lg:col-span-4">
          <div class="relative">
            <select v-model="metode" aria-label="Filter metode pencairan" class="w-full px-4 py-2 rounded-full bg-surface-container-low text-on-surface text-sm appearance-none focus:outline-none focus:bg-white cursor-pointer pr-8 shadow-sm">
              <option value="all">Semua Metode</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Corporate Card">Corporate Card</option>
            </select>
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[18px] pointer-events-none" aria-hidden="true">expand_more</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Multi-Column Table -->
    <div class="rounded-xl bg-white shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm border-collapse">
          <thead>
            <tr class="bg-surface-container-low text-muted text-[11px] font-semibold uppercase tracking-wider">
              <th class="py-3 px-6 w-12"><input :checked="selected.size===filtered.length && filtered.length>0" aria-label="Pilih semua" class="rounded accent-primary cursor-pointer w-4 h-4" type="checkbox" @change="toggleAll"></th>
              <th class="py-3 px-3 whitespace-nowrap">No. Advance &amp; Travel ID</th>
              <th class="py-3 px-3 whitespace-nowrap">Pengajuan &amp; SLA</th>
              <th class="py-3 px-3 whitespace-nowrap">Pemohon &amp; Jabatan</th>
              <th class="py-3 px-3 whitespace-nowrap">Keperluan &amp; Tujuan Dinas</th>
              <th class="py-3 px-3 text-right whitespace-nowrap">Nominal &amp; Plafon</th>
              <th class="py-3 px-3 whitespace-nowrap">Rekening Penerima</th>
              <th class="py-3 px-3 whitespace-nowrap">Status Approval</th>
              <th class="py-3 px-6 text-center whitespace-nowrap">Aksi Cepat</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low">
            <tr v-for="a in filtered" :key="a.id" class="hover:bg-surface-container-low/50 transition-colors group">
              <td class="py-3 px-6"><input :checked="selected.has(a.id)" :aria-label="`Pilih ${a.id}`" class="rounded accent-primary cursor-pointer w-4 h-4" type="checkbox" @change="toggleSelect(a.id)"></td>
              <td class="py-3 px-3">
                <div class="flex flex-col">
                  <span class="text-sm font-bold text-on-surface">{{ a.id }}</span>
                  <span class="mt-0.5 inline-flex self-start bg-surface-container text-[#3e4a3c] text-xs px-1.5 py-0.5 rounded-full">{{ a.travelId }}</span>
                </div>
              </td>
              <td class="py-3 px-3">
                <div class="flex flex-col">
                  <span class="font-medium text-on-surface">{{ a.dateLabel }}</span>
                  <span :class="a.slaClass" class="text-xs flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]" aria-hidden="true">{{ a.slaIcon }}</span> {{ a.slaLabel }}</span>
                </div>
              </td>
              <td class="py-3 px-3">
                <div class="flex items-center gap-2">
                  <img :src="a.avatar" :alt="a.avatarAlt" class="w-9 h-9 rounded-full object-cover shrink-0">
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium truncate">{{ a.employee.name }}</span>
                    <span class="text-xs text-muted truncate">{{ a.title }}</span>
                  </div>
                </div>
              </td>
              <td class="py-3 px-3">
                <div class="flex flex-col max-w-[200px]">
                  <span class="text-sm font-medium truncate">{{ a.purpose }}</span>
                  <span class="text-xs text-muted flex items-center gap-0.5"><span class="material-symbols-outlined text-[14px]" aria-hidden="true">location_on</span> {{ a.destination }}</span>
                </div>
              </td>
              <td class="py-3 px-3 text-right">
                <div class="flex flex-col">
          <span :class="a.status===ADVANCE_STATUS.REJECTED ? 'text-error' : 'text-on-surface'" class="text-sm font-bold">{{ formatRp(a.amount) }}</span>
          <span :class="a.status===ADVANCE_STATUS.REJECTED ? 'text-error' : 'text-muted'" class="text-xs">{{ a.plafon ? `Plafon: ${formatRp(a.plafon)}` : 'Settlement Lama Tertahan' }}</span>
                </div>
              </td>
              <td class="py-3 px-3">
                <div class="flex flex-col text-xs">
                  <span class="text-sm font-medium text-on-surface">{{ a.account }}</span>
                  <span class="text-muted">{{ a.accountName }}</span>
                </div>
              </td>
              <td class="py-3 px-3">
                <span :class="a.statusClass" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                  <span :class="a.dotClass" class="w-1.5 h-1.5 rounded-full" aria-hidden="true" /> {{ a.statusLabel }}
                </span>
              </td>
              <td class="py-3 px-6">
                <div class="flex items-center justify-center gap-1.5 flex-wrap">
                  <!-- Gate pakai flag backend (FinanceFlow), bukan statusLabel.
                       Dulu `statusLabel === PENDING` membandingkan LABEL dengan
                       STATUS — kebetulan sama, tapi rapuh. -->
                  <template v-if="a.canDisburse && canFinance">
                    <button aria-label="Otorisasi dan transfer dana" class="h-8 px-3 rounded-full bg-primary text-white text-xs font-semibold flex items-center gap-1 hover:opacity-90 shadow-sm transition-all" @click="handleDisburse(a)"><span class="material-symbols-outlined text-[15px]" aria-hidden="true">send_money</span><span>Disburse</span></button>
                    <button aria-label="Lihat detail nota dan tiket" class="w-8 h-8 rounded-full bg-surface-container-low text-muted hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-all"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">visibility</span></button>
                  </template>
                  <template v-else-if="a.canDecide && canFinance">
                    <button aria-label="Setujui pengajuan uang muka" class="w-8 h-8 rounded-full bg-secondary-container/60 text-secondary hover:bg-primary hover:text-white flex items-center justify-center transition-all" @click="decideAdvance(a.id, 'approve')"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">check</span></button>
                    <button aria-label="Tolak pengajuan" class="w-8 h-8 rounded-full bg-error-container/40 text-error hover:bg-error hover:text-white flex items-center justify-center transition-all" @click="openReject(a)"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span></button>
                    <button aria-label="Lihat detail pratinjau" class="w-8 h-8 rounded-full bg-surface-container-low text-muted hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-all"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">visibility</span></button>
                  </template>
                  <template v-else>
                    <span
                      v-if="a.disburseInfo"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container/60 text-[#2e6f3c] text-[11px] font-semibold max-w-[240px]"
                    >
                      <span class="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">verified</span>
                      <span class="truncate">{{ a.disburseInfo }}</span>
                    </span>
                    <a v-if="a.status===ADVANCE_STATUS.PAID && (a as any)._proofUrl" :href="(a as any)._proofUrl" target="_blank" rel="noopener" aria-label="Lihat bukti transfer" class="h-8 px-2.5 rounded-full bg-surface-container-low text-on-surface text-xs font-medium flex items-center gap-1 hover:bg-surface-container transition-all"><span class="material-symbols-outlined text-[15px] text-primary" aria-hidden="true">receipt</span><span>{{ (a as any)._transferRef || 'Bukti Transfer' }}</span></a>
                    <span v-else-if="a.status===ADVANCE_STATUS.PAID" class="h-8 px-2.5 rounded-full bg-surface-container-low text-on-surface text-xs font-medium flex items-center gap-1"><span class="material-symbols-outlined text-[15px] text-primary" aria-hidden="true">receipt</span><span>{{ (a as any)._transferRef || 'Terkirim' }}</span></span>
                    <button aria-label="Lihat detail pratinjau" class="w-8 h-8 rounded-full bg-surface-container-low text-muted hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-all"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">visibility</span></button>
                  </template>
                  <button v-if="canDeleteAdvance(a)" :aria-label="`Hapus uang muka ${a.id}`" class="w-8 h-8 rounded-full bg-error-container/40 text-error hover:bg-error hover:text-white flex items-center justify-center transition-all" @click="openDeleteAdvance(a)"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span></button>
                </div>
              </td>
            </tr>
            <tr v-if="filtered.length===0">
              <td colspan="9" class="py-10 text-center text-sm text-muted">Tidak ada data uang muka yang sesuai filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-xs text-muted flex-wrap">
          <span>Menampilkan 1-{{ filtered.length }} dari 23 total permohonan</span>
          <span class="hidden sm:inline w-1 h-1 rounded-full bg-tertiary" aria-hidden="true" />
          <div class="flex items-center gap-1">
            <span>Baris per halaman:</span>
            <select aria-label="Baris per halaman" class="bg-white text-on-surface text-xs px-2 py-1 rounded-full shadow-sm focus:outline-none cursor-pointer">
              <option>10</option><option>25</option><option>50</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button disabled aria-label="Halaman sebelumnya" class="w-8 h-8 rounded-full bg-white text-muted flex items-center justify-center shadow-sm disabled:opacity-40"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span></button>
          <button aria-label="Halaman 1" class="w-8 h-8 rounded-full bg-primary text-white text-xs flex items-center justify-center shadow-sm">1</button>
          <button aria-label="Halaman 2" class="w-8 h-8 rounded-full bg-white text-on-surface hover:bg-surface-container text-xs flex items-center justify-center shadow-sm">2</button>
          <button aria-label="Halaman 3" class="w-8 h-8 rounded-full bg-white text-on-surface hover:bg-surface-container text-xs flex items-center justify-center shadow-sm">3</button>
          <button aria-label="Halaman berikutnya" class="w-8 h-8 rounded-full bg-white text-muted hover:text-on-surface flex items-center justify-center shadow-sm"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span></button>
        </div>
      </div>
    </div>

    <!-- Ringkasan pencairan -->
    <div class="p-6 rounded-xl bg-white shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-secondary-container/40 flex items-center justify-center text-secondary shrink-0">
          <span class="material-symbols-outlined text-[24px]" aria-hidden="true">account_balance_wallet</span>
        </div>
        <div>
          <h4 class="text-sm font-bold">Ringkasan Kas Bon Operasional</h4>
          <p class="text-sm text-muted">{{ summary?.pending_count ?? 0 }} menunggu finance ({{ formatRp(Number(summary?.pending_amount ?? 0)) }}) • {{ summary?.ready_count ?? 0 }} siap dicairkan ({{ formatRp(Number(summary?.ready_amount ?? 0)) }}).</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        <button class="px-5 py-2.5 rounded-full bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-low transition-all" @click="exportAdv">Unduh Rekap Pencairan (CSV)</button>
      </div>
    </div>

    <!-- Modal Ajukan Uang Muka -->
    <div v-if="showCreate" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showCreate = false">
      <form class="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto" @submit.prevent="showCreateConfirm = true">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Ajukan Uang Muka Baru</h2>
          <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showCreate = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">Travel Request</label>
          <select v-model="createForm.travel_request_id" required aria-label="Travel request" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none cursor-pointer">
            <option value="" disabled>Pilih travel request...</option>
            <option v-for="t in (travelOptions?.data ?? [])" :key="t.id" :value="t.id">{{ t.request_no }} — {{ t.route }}</option>
          </select>
          <p v-if="createPolicy" class="text-xs text-secondary pt-0.5">
            Plafon otomatis: Policy <strong>{{ createPolicy.policy_code }}</strong> (grade {{ createPolicy.user_grade }}) — maks <strong>{{ formatRp(createPolicy.limit) }}</strong> / {{ createPolicy.days }} hari.
          </p>
          <p v-else-if="createPolicyLoading" class="text-xs text-muted pt-0.5">Menghitung plafon policy...</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Nominal (Rp)</label>
            <input v-model="createForm.amount" required type="number" min="0" aria-label="Nominal" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none" placeholder="5000000">
            <p v-if="createForm.amount !== ''" class="text-xs text-secondary font-semibold">= {{ formatRp(Number(createForm.amount || 0)) }}</p>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Plafon (Rp) — otomatis</label>
            <input v-model="createForm.plafon" readonly type="number" min="0" aria-label="Plafon" class="w-full px-4 py-2 rounded-xl bg-surface-container text-sm focus:outline-none cursor-not-allowed" :placeholder="createPolicyLoading ? 'Menghitung...' : 'Dari policy grade'">
          </div>
        </div>
        <p v-if="createOverPlafon" class="text-xs text-error font-semibold" role="alert">Nominal melebihi plafon policy. Turunkan ke ≤ {{ formatRp(Number(createForm.plafon || 0)) }}.</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Rekening</label>
            <input v-model="createForm.account" type="text" aria-label="Rekening" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none" placeholder="BCA • 7100-••••-8720">
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Atas Nama</label>
            <input v-model="createForm.account_name" type="text" aria-label="Atas nama" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none" placeholder="a.n Nama">
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">Metode</label>
          <select v-model="createForm.method" aria-label="Metode" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none cursor-pointer">
            <option>Bank Transfer</option>
            <option>Corporate Card</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">Keperluan</label>
          <input v-model="createForm.purpose" type="text" aria-label="Keperluan" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none" placeholder="Keperluan penggunaan dana">
        </div>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">Tujuan Dinas</label>
          <input v-model="createForm.destination" type="text" aria-label="Tujuan" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none" placeholder="Kota tujuan">
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="showCreate = false">Batal</button>
          <button type="submit" :disabled="createSaving || createOverPlafon" class="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60">{{ createSaving ? 'Menyimpan...' : 'Ajukan' }}</button>
        </div>
      </form>
    </div>
    <AppConfirmModal
      :open="showCreateConfirm"
      title="Ajukan uang muka sebesar ini?"
      :message="`Nominal ${createForm.amount !== '' ? formatRp(Number(createForm.amount || 0)) : '-'} via ${createForm.method}. Periksa lagi — kelebihan satu nol berarti 10× lipat.`"
      confirm-label="Ya, Ajukan"
      icon="payments"
      :loading="createSaving"
      @close="showCreateConfirm = false"
      @confirm="submitCreate"
    />

    <!-- Modal Pencairan + Bukti Transfer -->
    <div v-if="showDisburse" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showDisburse = false">
      <form class="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 flex flex-col space-y-4" @submit.prevent="submitDisburse">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Pencairan {{ disburseTarget?.id }}</h2>
          <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showDisburse = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <p class="text-xs text-muted">Nominal {{ disburseTarget ? formatRp(disburseTarget.amount) : '' }} ke {{ disburseTarget?.account }}. Wajib cantumkan nomor referensi bank; lampirkan file bukti bila ada.</p>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">Nomor Referensi Bank *</label>
          <input v-model="disburseRef" required type="text" aria-label="Nomor referensi" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="Contoh: TRX-BCA-98210492">
        </div>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">File Bukti Transfer (PDF/gambar, maks 10MB)</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" aria-label="Bukti transfer" class="w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-surface-container-low file:text-sm" @change="onProofChange">
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="showDisburse = false">Batal</button>
          <button type="submit" :disabled="disburseSaving" class="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60">{{ disburseSaving ? 'Memproses...' : 'Catat Pencairan' }}</button>
        </div>
      </form>
    </div>

    <!-- Modal Tolak (alasan wajib) -->
    <div v-if="showReject" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showReject = false">
      <form class="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 flex flex-col space-y-4" @submit.prevent="submitReject">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Tolak {{ rejectTarget?.id }}</h2>
          <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showReject = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <p class="text-xs text-muted">Nominal {{ rejectTarget ? formatRp(rejectTarget.amount) : '' }}. Alasan wajib diisi (minimal 3 karakter) dan terekam di audit.</p>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted" for="rejectNote">Alasan Penolakan *</label>
          <textarea id="rejectNote" v-model="rejectNote" required minlength="3" rows="3" aria-label="Alasan penolakan" class="w-full p-3 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="Contoh: Plafon kas bon proyek sudah habis..." />
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="showReject = false">Batal</button>
          <button type="submit" :disabled="rejectSaving" class="px-5 py-2 rounded-full bg-error text-white text-sm font-semibold disabled:opacity-60">{{ rejectSaving ? 'Memproses...' : 'Tolak Pengajuan' }}</button>
        </div>
      </form>
    </div>

    <AppConfirmModal
      :open="deleteTarget !== null"
      title="Hapus uang muka ini?"
      :message="`Uang muka ${deleteTarget?.id ?? ''} sebesar ${deleteTarget ? formatRp(deleteTarget.amount) : ''} akan dihapus permanen. Status Paid atau Rejected tidak bisa dihapus.`"
      variant="danger"
      confirm-label="Ya, Hapus"
      icon="delete"
      :loading="deleteSaving"
      @close="closeDeleteAdvance"
      @confirm="submitDeleteAdvance"
    />

    <!-- Toast -->
    <div :class="toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'" class="fixed bottom-6 right-6 z-50 bg-inverse-surface text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 transition-all">
      <span class="material-symbols-outlined text-primary-fixed text-[20px]" aria-hidden="true">check_circle</span>
      <span class="text-sm font-medium">{{ toastMsg }}</span>
    </div>
  </div>
</template>
