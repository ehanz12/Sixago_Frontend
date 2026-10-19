<script setup lang="ts">
definePageMeta({ layout: 'admin' })
import type { TravelRequest } from '~/types'
import { initialsOf, transportIconName, statusPillClass, formatRpShort } from '~/utils/format'
import { mapTravelRequest, downloadExport } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { TRAVEL_STATUS } from '~/constants/domain'
import { useAppStore } from '~/stores/app'

const api = useApi()
const app = useAppStore()
const route = useRoute()
const { canBatchApproveTravel } = storeToRefs(app)
// Search global dari topbar mendarat sebagai ?q= — jadikan nilai awal filter.
// (Halaman ini mengirim ?search= ke API; ?q= hanya dibaca di sini.)
const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '')
watch(() => route.query.q, (q) => {
  searchQuery.value = typeof q === 'string' ? q : ''
})
const debouncedQuery = useDebounce(searchQuery, 300)
const activeStatus = ref('all')
const deptFilter = ref('')
const projectFilter = ref('')
const currentPage = ref(1)
const perPage = ref(10)
const selectedIds = ref<Set<string>>(new Set())
const selectAll = ref(false)
const toast = useToast()

const showAdvanced = ref(false)
const startFrom = ref('')
const startTo = ref('')

const queryParams = computed(() => ({
  status: activeStatus.value,
  search: debouncedQuery.value.trim() || undefined,
  department: deptFilter.value || undefined,
  project: projectFilter.value || undefined,
  start_from: startFrom.value || undefined,
  start_to: startTo.value || undefined,
  page: currentPage.value,
  per_page: perPage.value,
}))

const periodeLabel = computed(() => {
  if (startFrom.value || startTo.value) return `${startFrom.value || '…'} → ${startTo.value || '…'}`
  return 'Semua Periode'
})

function resetAdvanced() {
  startFrom.value = ''
  startTo.value = ''
}

const openMenuId = ref<string | null>(null)

// Penarikan pra-approval oleh pemohon: backend mengizinkan 'Cancelled' hanya
// saat Submitted + nol baris decided (409 bila sudah ada keputusan).
async function cancelRequest(r: TravelRequest) {
  openMenuId.value = null
  try {
    await api(`/travel-requests/${(r as unknown as { _rawId: number })._rawId}`, { method: 'PUT', body: { status: 'Cancelled' } })
    toast.show(`Pengajuan ${r.id} dibatalkan.`)
    await refreshNuxtData(['tr-list', 'tr-summary'])
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal membatalkan pengajuan.', 'error', 'error')
  }
}

const { data: listRes } = await useAsyncData('tr-list', () => api<LaravelPaginator<any>>('/travel-requests', { params: queryParams.value }), { watch: [queryParams] })
const { data: summaryRes } = await useAsyncData('tr-summary', () => api<{ total: number; by_status: Record<string, number> }>('/travel-requests-summary'))

// Opsi filter diambil dari API, bukan daftar hardcoded: backend mem-filter dengan
// LIKE pada departments.name / projects.name (TravelRequestController:41,44), jadi
// nilai yang dikirim harus nama aslinya.
const { data: deptRes } = await useAsyncData('tr-filter-depts', () => api<LaravelPaginator<any>>('/departments', { params: { per_page: 100 } }))
const { data: projRes } = await useAsyncData('tr-filter-projects', () => api<LaravelPaginator<any>>('/projects', { params: { per_page: 100 } }))
const deptOptions = computed(() => paginatorMeta(deptRes.value?.data ? deptRes.value : []).items as { id?: number; code?: string; name?: string }[])
const projectOptions = computed(() => paginatorMeta(projRes.value?.data ? projRes.value : []).items as { id?: number; code?: string; name?: string }[])

const listMeta = computed(() => paginatorMeta(listRes.value?.data ? listRes.value : []))
const displayRequests = computed<TravelRequest[]>(() => listMeta.value.items.map(mapTravelRequest))
const totalCount = computed(() => listMeta.value.total)
const lastPage = computed(() => listMeta.value.lastPage)

const statusTabs = computed(() => {
  const by = (summaryRes.value?.by_status ?? {}) as Record<string, number>
  const total = summaryRes.value?.total ?? 0
  const count = (k: string) => by[k] ?? 0
  return [
    { key: 'all', label: 'Semua', count: total },
    { key: TRAVEL_STATUS.DRAFT, label: 'Draft', count: count(TRAVEL_STATUS.DRAFT) },
    { key: TRAVEL_STATUS.SUBMITTED, label: 'Submitted', count: count(TRAVEL_STATUS.SUBMITTED) },
    { key: TRAVEL_STATUS.IN_REVIEW, label: 'In Review', count: count(TRAVEL_STATUS.IN_REVIEW) },
    { key: TRAVEL_STATUS.APPROVED, label: 'Approved', count: count(TRAVEL_STATUS.APPROVED) },
    { key: TRAVEL_STATUS.REJECTED, label: 'Rejected', count: count(TRAVEL_STATUS.REJECTED) },
    { key: TRAVEL_STATUS.COMPLETED, label: 'Completed', count: count(TRAVEL_STATUS.COMPLETED) },
  ]
})

const kpi = computed(() => {
  const by = (summaryRes.value?.by_status ?? {}) as Record<string, number>
  const total = summaryRes.value?.total ?? 0
  const pending = (by[TRAVEL_STATUS.SUBMITTED] ?? 0) + (by[TRAVEL_STATUS.IN_REVIEW] ?? 0)
  const approved = by[TRAVEL_STATUS.APPROVED] ?? 0
  return {
    total,
    pending,
    inReview: by[TRAVEL_STATUS.IN_REVIEW] ?? 0,
    approved,
    approvedPct: total > 0 ? `${Math.round((approved / total) * 1000) / 10}%` : '0%',
    commitment: formatRpShort(Number((summaryRes.value as any)?.total_commitment ?? 0)),
  }
})

function resetPage() { currentPage.value = 1; selectedIds.value = new Set(); selectAll.value = false }
watch([activeStatus, debouncedQuery, deptFilter, projectFilter, startFrom, startTo], resetPage)
watch(displayRequests, () => {
  selectAll.value = selectedIds.value.size === displayRequests.value.length && displayRequests.value.length > 0
})

function toggleSelectAll() {
  if (selectAll.value) selectedIds.value = new Set(displayRequests.value.map(r => r.id))
  else selectedIds.value = new Set()
}
function toggleRow(id: string) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
  selectAll.value = s.size === displayRequests.value.length && displayRequests.value.length > 0
}
function initials(name: string) { return initialsOf(name) }
function transportIcon(t: string) { return transportIconName(t) }
function statusPill(status: string) { return statusPillClass(status) }
function rawIds() {
  return displayRequests.value
    .filter(r => selectedIds.value.has(r.id))
    .map(r => (r as unknown as { _rawId: number })._rawId)
}
async function batchApprove() {
  if (selectedIds.value.size === 0) { toast.show('Pilih minimal 1 request untuk batch approve.', 'info', 'info'); return }
  try {
    const res = await api<{ message: string }>('/travel-requests/batch-approve', { method: 'POST', body: { ids: rawIds() } })
    toast.show(res.message)
    selectedIds.value = new Set(); selectAll.value = false
    await refreshNuxtData(['tr-list', 'tr-summary'])
  } catch (e: any) {
    // Backend tidak atomik: item yang gagal 403/409 menghentikan sisanya (ApprovalChain:159-167).
    toast.show(e?.data?.message || 'Gagal batch approve. Sebagian pengajuan mungkin tidak bisa diputus oleh role Anda.', 'error', 'error')
  }
}
async function exportData() {
  await downloadExport('travel-requests', 'travel-requests.csv')
  toast.show('File travel-requests.csv berhasil diunduh.')
}
function goToPage(p: number) {
  if (p >= 1 && p <= lastPage.value) currentPage.value = p
}
</script>

<template>
  <div class="flex flex-col w-full space-y-6 pb-7 mt-4">
    <!-- Breadcrumb & Header -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <div class="flex items-center gap-1.5 text-muted text-xs mb-1">
                 
        </div>
              
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button aria-label="Filter lanjutan" :class="showAdvanced ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-white text-on-surface'" class="inline-flex items-center gap-1.5 px-4 py-2 hover:bg-surface-container-low text-sm font-medium rounded-full shadow-sm transition-all" @click="showAdvanced = !showAdvanced">
          <span class="material-symbols-outlined text-[18px] text-muted">tune</span> <span>Filter Lanjutan</span>
        </button>
        <button aria-label="Export data" class="inline-flex items-center gap-1.5 px-4 py-2 bg-secondary text-white hover:opacity-95 text-sm font-medium rounded-full shadow-sm transition-all" @click="exportData">
          <span class="material-symbols-outlined text-[18px]">download</span> <span>Export Data XLS/CSV</span>
        </button>
        <NuxtLink to="/admin/travel-requests/create" class="inline-flex items-center gap-1.5 px-5 py-2 bg-primary-container text-[#003e0f] hover:opacity-95 text-sm font-bold rounded-full shadow-md transition-all">
          <span class="material-symbols-outlined text-[18px]">add</span> <span>+ Buat Request Perjalanan</span>
        </NuxtLink>
      </div>
    </div>

    <!-- KPI Pulse Bar -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
        <div><p class="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Permohonan</p><p class="text-2xl font-bold mt-1">{{ kpi.total }} <span class="text-xs text-secondary font-medium">Bulan Ini</span></p></div>
        <div class="w-11 h-11 rounded-full bg-surface-container-low flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[24px]">flight_takeoff</span></div>
      </div>
      <div class="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
        <div><p class="text-[11px] font-semibold text-muted uppercase tracking-wider">Menunggu Approval</p><p class="text-2xl font-bold mt-1">{{ kpi.pending }} <span class="text-xs bg-error-container/60 text-[#93000a] px-2 py-0.5 rounded-full">{{ kpi.inReview }} In-Review</span></p></div>
        <div class="w-11 h-11 rounded-full bg-surface-container-low flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[24px]">hourglass_top</span></div>
      </div>
      <div class="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
        <div><p class="text-[11px] font-semibold text-muted uppercase tracking-wider">Disetujui (Approved)</p><p class="text-2xl font-bold mt-1">{{ kpi.approved }} <span class="text-xs text-primary font-medium">{{ kpi.approvedPct }}</span></p></div>
        <div class="w-11 h-11 rounded-full bg-secondary-container/40 flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[24px]">verified</span></div>
      </div>
      <div class="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
        <div><p class="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Komitmen Budget</p><p class="text-2xl font-bold mt-1">{{ kpi.commitment }}</p></div>
        <div class="w-11 h-11 rounded-full bg-surface-container-low flex items-center justify-center text-muted"><span class="material-symbols-outlined text-[24px]">account_balance_wallet</span></div>
      </div>
    </div>

    <!-- Controls Shell -->
    <div class="bg-white rounded-xl shadow-sm p-4 space-y-4">
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          v-for="t in statusTabs" :key="t.key"
          :class="activeStatus===t.key ? 'bg-secondary-container text-[#2e6f3c] shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'"
          class="px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
          @click="activeStatus=t.key"
        >
          <span>{{ t.label }}</span>
          <span :class="activeStatus===t.key ? 'bg-white text-on-surface' : t.key===TRAVEL_STATUS.IN_REVIEW ? 'bg-error-container/60 text-[#93000a] font-bold' : t.key===TRAVEL_STATUS.APPROVED ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-white text-muted'" class="px-2 py-0.5 rounded-full text-xs">{{ t.count }}</span>
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-12 gap-2 pt-1">
        <div class="md:col-span-5 relative">
          <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[20px]">search</span>
          <input v-model="searchQuery" aria-label="Cari request" class="w-full pl-10 pr-4 py-2 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-container transition-all" placeholder="Cari nomor request, nama karyawan, tujuan, atau project..." type="text">
        </div>
        <div class="md:col-span-2 relative">
          <select v-model="deptFilter" aria-label="Filter departemen" class="w-full appearance-none pl-4 pr-8 py-2 rounded-full bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-container cursor-pointer">
            <option value="">Semua Departemen</option>
            <option v-for="d in deptOptions" :key="d.id ?? d.name" :value="d.name">{{ d.code }} — {{ d.name }}</option>
          </select>
          <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none text-[18px]">expand_more</span>
        </div>
        <div class="md:col-span-3 relative">
          <select v-model="projectFilter" aria-label="Filter proyek" class="w-full appearance-none pl-4 pr-8 py-2 rounded-full bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-container cursor-pointer">
            <option value="">Semua Proyek Strategis</option>
            <option v-for="p in projectOptions" :key="p.id ?? p.name" :value="p.name">{{ p.code }} — {{ p.name }}</option>
          </select>
          <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none text-[18px]">expand_more</span>
        </div>
        <div class="md:col-span-2">
          <button aria-label="Pilih periode" class="w-full flex items-center justify-between px-4 py-2 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface text-sm transition-colors" @click="showAdvanced = !showAdvanced">
            <span class="flex items-center gap-1.5 text-muted"><span class="material-symbols-outlined text-[18px]">calendar_today</span><span class="text-on-surface font-medium">{{ periodeLabel }}</span></span>
            <span class="material-symbols-outlined text-[18px] text-muted">arrow_drop_down</span>
          </button>
        </div>
      </div>
      <div v-if="showAdvanced" class="grid grid-cols-1 md:grid-cols-12 gap-2 pt-1 border-t border-surface-container-low">
        <div class="md:col-span-5 flex items-center gap-2 pt-2">
          <label class="text-xs text-muted whitespace-nowrap" for="advFrom">Berangkat dari</label>
          <input id="advFrom" v-model="startFrom" type="date" aria-label="Tanggal mulai" class="w-full px-4 py-2 rounded-full bg-surface-container-low text-sm focus:outline-none focus:bg-white">
        </div>
        <div class="md:col-span-5 flex items-center gap-2 pt-2">
          <label class="text-xs text-muted whitespace-nowrap" for="advTo">sampai</label>
          <input id="advTo" v-model="startTo" type="date" aria-label="Tanggal sampai" class="w-full px-4 py-2 rounded-full bg-surface-container-low text-sm focus:outline-none focus:bg-white">
        </div>
        <div class="md:col-span-2 flex items-end pt-2">
          <button class="w-full px-4 py-2 rounded-full bg-surface-container-low hover:bg-surface-container text-xs font-medium transition-colors" @click="resetAdvanced">Reset Filter</button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div v-if="selectedIds.size>0" class="px-6 py-2 bg-secondary-container/30 flex items-center justify-between">
        <div class="flex items-center gap-2 text-[#2e6f3c] text-sm font-medium"><span class="material-symbols-outlined text-[20px]">check_box</span><span>{{ selectedIds.size }} Travel Request Dipilih</span></div>
        <div class="flex items-center gap-2">
          <button v-if="canBatchApproveTravel" class="px-4 py-1 rounded-full bg-primary-container text-[#003e0f] text-xs font-semibold hover:opacity-90" @click="batchApprove">Batch Approve</button>
          <button class="px-4 py-1 rounded-full bg-white text-error text-xs font-semibold hover:bg-error-container" @click="selectedIds=new Set(); selectAll=false">Tolak Pilihan</button>
        </div>
      </div>
      <div class="w-full overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low/70 text-muted text-[11px] font-semibold uppercase tracking-wider">
              <th class="py-2.5 pl-6 pr-2 w-12 text-center"><input v-model="selectAll" aria-label="Pilih semua" class="rounded accent-primary w-4 h-4 cursor-pointer" type="checkbox" @change="toggleSelectAll"></th>
              <th class="py-2.5 px-2">No. Request</th>
              <th class="py-2.5 px-2">Pemohon</th>
              <th class="py-2.5 px-2">Proyek &amp; Keperluan</th>
              <th class="py-2.5 px-2">Rute &amp; Moda</th>
              <th class="py-2.5 px-2">Periode (Durasi)</th>
              <th class="py-2.5 px-2 text-right">Estimasi Biaya</th>
              <th class="py-2.5 px-2 text-center">Status Approval</th>
              <th class="py-2.5 pr-6 pl-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low text-sm">
            <tr v-for="r in displayRequests" :key="r.id" class="hover:bg-surface-container-low/50 transition-colors">
              <td class="py-4 pl-6 pr-2 text-center"><input :checked="selectedIds.has(r.id)" aria-label="Pilih baris" class="w-4 h-4 rounded accent-primary cursor-pointer" type="checkbox" @change="toggleRow(r.id)"></td>
              <td class="py-4 px-2"><div class="flex flex-col"><NuxtLink :to="`/admin/travel-requests/${r.id.replace('#','')}`" class="text-sm font-bold text-secondary hover:underline">{{ r.id }}</NuxtLink><span class="text-xs text-muted">{{ r.createdAt }}</span></div></td>
              <td class="py-4 px-2">
                <div class="flex items-center gap-2">
                  <img v-if="r.employee.avatar" :src="r.employee.avatar" :alt="`Foto ${r.employee.name}`" class="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" width="36" height="36" decoding="async">
                  <div v-else class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-xs font-bold shrink-0">{{ initials(r.employee.name) }}</div>
                  <div class="flex flex-col min-w-0"><span class="text-sm font-medium truncate">{{ r.employee.name }}</span><span class="text-xs text-muted truncate">{{ r.employee.department }}</span></div>
                </div>
              </td>
              <td class="py-4 px-2"><div class="flex flex-col max-w-xs"><span class="text-sm font-medium line-clamp-1">{{ r.project }}</span><span class="text-xs text-muted line-clamp-1">{{ r.purpose ?? r.projectCode }}</span></div></td>
              <td class="py-4 px-2">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-full bg-surface-container-low flex items-center justify-center text-primary shrink-0"><span class="material-symbols-outlined text-[16px]">{{ transportIcon(r.transport) }}</span></span>
                  <div class="flex flex-col"><span class="text-sm font-medium">{{ r.route }}</span><span class="text-xs text-muted">{{ r.transport }}</span></div>
                </div>
              </td>
              <td class="py-4 px-2"><div class="flex flex-col"><span class="text-sm">{{ r.startDate }} - {{ r.endDate }}</span><span class="text-xs text-secondary font-medium">{{ r.duration }}</span></div></td>
              <td class="py-4 px-2 text-right"><span class="text-sm font-bold">{{ r.costLabel }}</span><span class="block text-xs text-muted">{{ r.status===TRAVEL_STATUS.APPROVED ? 'Campaign Q2' : r.status===TRAVEL_STATUS.COMPLETED ? 'Reimburse Tol & Bensin' : 'Beban Proyek' }}</span></td>
              <td class="py-4 px-2 text-center">
                <span :class="statusPill(r.status)" class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold">
                  <span v-if="r.status===TRAVEL_STATUS.IN_REVIEW" class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span v-else-if="r.status===TRAVEL_STATUS.APPROVED" class="w-2 h-2 rounded-full bg-primary" />
                  <span v-else-if="r.status===TRAVEL_STATUS.REJECTED" class="w-2 h-2 rounded-full bg-error" />
                  <span v-else-if="r.status===TRAVEL_STATUS.COMPLETED" class="material-symbols-outlined text-[14px] text-secondary">task_alt</span>
                  <span v-else class="w-2 h-2 rounded-full bg-current" />
                  <span>{{ r.status }}</span>
                </span>
              </td>
              <td class="py-4 pr-6 pl-2 text-right">
                <div class="flex items-center justify-end gap-1">
                  <NuxtLink :to="`/admin/travel-requests/${r.id.replace('#','')}`" aria-label="Lihat detail" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-secondary-container text-on-surface flex items-center justify-center transition-colors"><span class="material-symbols-outlined text-[18px]">visibility</span></NuxtLink>
                  <NuxtLink :to="`/admin/travel-requests/${r.id.replace('#','')}`" aria-label="Ubah parameter" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-surface-container text-muted hover:text-on-surface flex items-center justify-center transition-colors"><span class="material-symbols-outlined text-[18px]">edit</span></NuxtLink>
                  <div class="relative">
                    <button aria-label="Opsi lainnya" :aria-expanded="openMenuId === r.id" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-surface-container text-muted flex items-center justify-center transition-colors" @click="openMenuId = openMenuId === r.id ? null : r.id"><span class="material-symbols-outlined text-[18px]">more_vert</span></button>
                    <div v-if="openMenuId === r.id" class="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-surface-container-low py-1 z-20 text-left">
                      <NuxtLink :to="`/admin/travel-requests/${r.id.replace('#','')}`" class="block px-4 py-2 text-xs hover:bg-surface-container-low" @click="openMenuId = null">Lihat Detail</NuxtLink>
                      <button v-if="app.isOwnRequest((r as unknown as { _rawUserId?: number })._rawUserId) && r.status === TRAVEL_STATUS.SUBMITTED" class="block w-full text-left px-4 py-2 text-xs text-error hover:bg-error-container" @click="cancelRequest(r)">Batalkan Pengajuan</button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-if="displayRequests.length===0"><td colspan="9" class="py-12 text-center text-sm text-muted">Tidak ada data yang sesuai filter. Coba ubah kata kunci atau filter status.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-4">
          <span class="text-sm text-muted">Menampilkan <span class="text-on-surface font-semibold">{{ displayRequests.length }}</span> dari <span class="text-on-surface font-semibold">{{ totalCount }}</span> request</span>
          <div class="flex items-center gap-1.5 text-xs text-muted"><span>Baris per halaman:</span><select v-model="perPage" aria-label="Baris per halaman" class="bg-surface-container-low text-on-surface rounded-full px-2 py-0.5 text-xs focus:outline-none cursor-pointer"><option :value="10">10</option><option :value="25">25</option><option :value="50">50</option></select></div>
        </div>
        <div class="flex items-center gap-1 self-center">
          <button aria-label="Sebelumnya" :disabled="currentPage <= 1" class="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-surface-container-low hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed" @click="goToPage(currentPage - 1)"><span class="material-symbols-outlined text-[18px]">chevron_left</span></button>
          <span class="text-sm text-muted px-2">Halaman {{ currentPage }} dari {{ lastPage }}</span>
          <button aria-label="Berikutnya" :disabled="currentPage >= lastPage" class="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-surface-container-low hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed" @click="goToPage(currentPage + 1)"><span class="material-symbols-outlined text-[18px]">chevron_right</span></button>
        </div>
      </div>
    </div>
    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
