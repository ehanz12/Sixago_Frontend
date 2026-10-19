<script setup lang="ts">
definePageMeta({ layout: 'admin' })
import type { TravelRequest } from '~/types'
import { formatRpShort, statusPillClass } from '~/utils/format'
import { mapTravelRequest } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { TRAVEL_STATUS } from '~/constants/domain'
import { useAppStore } from '~/stores/app'

const api = useApi()
const toast = useToast()
const appStore = useAppStore()
const { canBatchApproveTravel } = storeToRefs(appStore)

const roleKey = computed<'employee' | 'manager' | 'head' | 'finance' | 'admin'>(() => {
  const r = appStore.user?.role ?? ''
  if (r === 'Super Admin') return 'admin'
  if (r === 'Finance Approver') return 'finance'
  if (r === 'Division Head') return 'head'
  if (r === 'Line Manager') return 'manager'
  return 'employee'
})
const filterQuery = ref('')
const debouncedQuery = useDebounce(filterQuery, 300)
const activeTab = ref('Semua')

const { data: stats } = await useAsyncData('dashboard-stats', () => api<{
  total_requests: number; pending_approval: number; total_commitment: number; active_projects: number
}>('/dashboard/stats'))
const { data: summary } = await useAsyncData('dashboard-summary', () => api<Record<string, number>>('/travel-requests-summary'))
const { data: recentRes } = await useAsyncData('dashboard-recent', () => api<LaravelPaginator<any>>('/travel-requests', { params: { per_page: 10 } }))
const { data: advSummary } = await useAsyncData('dashboard-adv', () => api<{ pending_count: number; pending_amount: number; ready_count: number; ready_amount: number; total_disbursed: number }>('/advances-summary'))
const { data: reimSummary } = await useAsyncData('dashboard-reim', () => {
  if (roleKey.value !== 'finance' && roleKey.value !== 'admin') return Promise.resolve(null)
  return api<{ pending_count: number }>('/reimbursements-summary')
}, { server: false, watch: [roleKey] })
const reimPending = computed(() => reimSummary.value?.pending_count ?? 0)
const { data: deptRes } = await useAsyncData('dashboard-depts', () => {
  if (roleKey.value !== 'head') return Promise.resolve(null)
  return api<LaravelPaginator<any>>('/departments', { params: { per_page: 50 } })
}, { server: false, watch: [roleKey] })
const { data: usersRes } = await useAsyncData('dashboard-users', () => {
  if (roleKey.value !== 'admin') return Promise.resolve(null)
  return api<LaravelPaginator<any>>('/users', { params: { per_page: 1 } })
}, { server: false, watch: [roleKey] })

const byStatus = computed<Record<string, number>>(() => (summary.value as any)?.by_status ?? {})
const empCounts = computed(() => ({
  total: (summary.value as any)?.total ?? 0,
  pending: (byStatus.value[TRAVEL_STATUS.SUBMITTED] ?? 0) + (byStatus.value[TRAVEL_STATUS.IN_REVIEW] ?? 0),
  approved: byStatus.value[TRAVEL_STATUS.APPROVED] ?? 0,
  rejected: byStatus.value[TRAVEL_STATUS.REJECTED] ?? 0,
}))
const ownDept = computed<any | null>(() => {
  const code = appStore.user?.department?.code
  if (!code) return null
  const items = paginatorMeta(deptRes.value?.data ? deptRes.value : []).items
  return items.find((d: any) => d.code === code) ?? null
})
const ownDeptPct = computed(() => {
  if (!ownDept.value?.budget_total) return 0
  return Math.round((Number(ownDept.value.budget_used ?? 0) / Number(ownDept.value.budget_total)) * 100)
})
const totalUsers = computed(() => paginatorMeta(usersRes.value?.data ? usersRes.value : []).total)
const { data: chartsRes } = await useAsyncData('dashboard-charts', () => api<{
  monthly: { label: string; total: number }[]
  by_department: { name: string; total: number }[]
}>('/dashboard/charts'))

const DONUT_COLORS = ['#006E22', '#28B446', '#5CE06C', '#2A6B38', '#92A099', '#C9B458']
const DONUT_C = 2 * Math.PI * 38

const chartMonths = computed(() => (chartsRes.value?.monthly ?? []).slice(-6))
const chartMax = computed(() => Math.max(1, ...chartMonths.value.map(m => m.total)))
const chartBars = computed(() => chartMonths.value.map((m, i) => {
  const h = Math.round((m.total / chartMax.value) * 125)
  return { ...m, x: 70 + i * 72, h, y: 155 - h }
}))
const chartTotalYear = computed(() => (chartsRes.value?.monthly ?? []).reduce((s, m) => s + m.total, 0))

const deptDist = computed(() => {
  const rows = chartsRes.value?.by_department ?? []
  const total = rows.reduce((s, r) => s + r.total, 0) || 1
  let offset = 0
  return rows.map((r, i) => {
    const frac = r.total / total
    const seg = { ...r, pct: Math.round(frac * 100), color: DONUT_COLORS[i % DONUT_COLORS.length], len: frac * DONUT_C, offset: -offset }
    offset += frac * DONUT_C
    return seg
  })
})
const deptTotal = computed(() => (chartsRes.value?.by_department ?? []).reduce((s, r) => s + r.total, 0))

const travelRequests = computed<TravelRequest[]>(() =>
  paginatorMeta(recentRes.value?.data ? recentRes.value : []).items.map(mapTravelRequest),
)

const tabs = computed(() => {
  const total = stats.value?.total_requests ?? 0
  const wait = stats.value?.pending_approval ?? 0
  const approved = (summary.value as any)?.approved ?? 0
  return [`Semua (${total})`, `Menunggu (${wait})`, `Disetujui (${approved})`, 'Selesai']
})

const tableTitle = computed(() => roleKey.value === 'employee' ? 'Pengajuan Saya' : 'Daftar Pengajuan Perjalanan Terkini')
const tableSubtitle = computed(() => {
  if (roleKey.value === 'employee') return 'Pantau status pengajuan perjalanan dinas Anda.'
  if (roleKey.value === 'manager') return 'Tinjau dan setujui pengajuan tim Anda.'
  if (roleKey.value === 'head') return 'Tinjau pengajuan divisi Anda.'
  if (roleKey.value === 'finance') return 'Tinjau pengajuan terkait verifikasi dan pencairan.'
  return `Tinjau kepatuhan kebijakan korporat, jadwal tiket, dan aksi persetujuan cepat.${totalUsers.value ? ` ${totalUsers.value} pengguna terdaftar.` : ''}`
})

const filteredRequests = computed(() => {
  let list = travelRequests.value
  if (activeTab.value.startsWith('Menunggu')) list = list.filter(r => r.status === TRAVEL_STATUS.SUBMITTED || r.status === TRAVEL_STATUS.IN_REVIEW)
  else if (activeTab.value.startsWith('Disetujui')) list = list.filter(r => r.status === TRAVEL_STATUS.APPROVED)
  else if (activeTab.value === 'Selesai') list = list.filter(r => r.status === 'Completed')
  const q = debouncedQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.employee.name.toLowerCase().includes(q) ||
      r.route.toLowerCase().includes(q),
    )
  }
  return list
})

const isLoading = computed(() => !recentRes.value)
const advPending = computed(() => advSummary.value?.pending_count ?? 0)
const advPendingAmount = computed(() => formatRpShort(Number(advSummary.value?.pending_amount ?? 0)))

function rawIdOf(r: TravelRequest) { return (r as unknown as { _rawId: number })._rawId }



async function quickApprove(id: string) {
  const found = travelRequests.value.find(r => r.id === id)
  if (!found) return
  try {
    await api('/travel-requests/batch-approve', { method: 'POST', body: { ids: [rawIdOf(found)] } })
    toast.show(`Pengajuan ${id} disetujui.`)
    await refreshNuxtData(['dashboard-recent', 'dashboard-stats', 'dashboard-summary'])
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menyetujui pengajuan.', 'error', 'error')
  }
}
function statusBadgeClass(status: string) { return statusPillClass(status) }
</script>

<template>
  <div class="flex flex-col w-full space-y-6 pb-6 mt-4">
    <!-- KPI skeleton -->
    <section v-if="isLoading" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      <SkeletonKpi v-for="i in 4" :key="i" />
    </section>

    <!-- KPI: Employee -->
    <section v-else-if="roleKey === 'employee'" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Pengajuan Saya</span>
            <div class="text-3xl font-bold tracking-tight text-on-surface mt-1">{{ empCounts.total }} <span class="text-sm font-normal text-muted">Pengajuan</span></div>
          </div>
          <div class="w-12 h-12 rounded-full bg-secondary-container/60 flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[24px]">travel</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <NuxtLink to="/admin/travel-requests/create" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">
            <span class="material-symbols-outlined text-[14px]">add</span> Buat Baru
          </NuxtLink>
          <span class="text-xs text-muted">Perjalanan dinas saya</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Menunggu</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-error">{{ empCounts.pending }} <span class="text-sm font-normal text-muted">Pengajuan</span></div>
          </div>
          <div class="w-12 h-12 rounded-full bg-error-container/60 flex items-center justify-center text-error">
            <span class="material-symbols-outlined text-[24px]">hourglass_top</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-[#93000a] text-xs font-semibold">Dalam antrean approval</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Disetujui</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-secondary">{{ empCounts.approved }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-secondary-container/40 flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-[24px]">verified</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="text-xs text-muted">Siap diberangkatkan</span>
          <span class="text-xs text-secondary font-semibold">Real-time</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Ditolak</span>
            <div class="text-3xl font-bold tracking-tight mt-1">{{ empCounts.rejected }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-muted">
            <span class="material-symbols-outlined text-[24px]">cancel</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="text-xs text-muted">Perbaiki &amp; ajukan ulang</span>
        </div>
      </div>
    </section>

    <!-- KPI: Division Head (budget departemen) -->
    <section v-else-if="roleKey === 'head'" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Budget Departemen Terpakai</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-secondary">{{ formatRpShort(Number(ownDept?.budget_used ?? 0)) }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-primary-dark">
            <span class="material-symbols-outlined text-[24px]">account_balance_wallet</span>
          </div>
        </div>
        <div class="mt-3 space-y-1.5">
          <div class="w-full bg-surface-container rounded-full h-2 overflow-hidden">
            <div class="bg-primary-container h-full rounded-full" :style="{ width: `${Math.min(ownDeptPct, 100)}%` }" />
          </div>
          <div class="flex items-center justify-between text-muted text-xs">
            <span class="text-xs font-semibold text-on-surface">{{ ownDeptPct }}% Terpakai</span>
            <span>{{ ownDept?.name ?? '—' }}</span>
          </div>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Sisa Plafon Departemen</span>
            <div class="text-3xl font-bold tracking-tight text-on-surface mt-1">{{ formatRpShort(Number(ownDept?.budget_total ?? 0) - Number(ownDept?.budget_used ?? 0)) }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-secondary-container/60 flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[24px]">savings</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="text-xs text-muted">Plafon: {{ formatRpShort(Number(ownDept?.budget_total ?? 0)) }}</span>
          <span class="text-xs text-secondary font-semibold">Real-time</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Antrean Level 2</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-error">{{ stats?.pending_approval ?? '…' }} <span class="text-sm font-normal text-muted">Menunggu</span></div>
          </div>
          <div class="w-12 h-12 rounded-full bg-error-container/60 flex items-center justify-center text-error">
            <span class="material-symbols-outlined text-[24px]">hourglass_top</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <NuxtLink to="/admin/approval-queue" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">Buka antrean <span class="material-symbols-outlined text-[14px]">arrow_forward</span></NuxtLink>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Proyek Aktif</span>
            <div class="text-3xl font-bold tracking-tight text-on-surface mt-1">{{ (stats as any)?.active_projects ?? '…' }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-muted">
            <span class="material-symbols-outlined text-[24px]">folder_shared</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="text-xs text-muted">Portofolio berjalan</span>
          <span class="text-xs text-secondary font-semibold">Real-time</span>
        </div>
      </div>
    </section>

    <!-- KPI: Finance -->
    <section v-else-if="roleKey === 'finance'" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Verifikasi Pending</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-error">{{ reimPending }} <span class="text-sm font-normal text-muted">Klaim</span></div>
          </div>
          <div class="w-12 h-12 rounded-full bg-error-container/60 flex items-center justify-center text-error">
            <span class="material-symbols-outlined text-[24px]">fact_check</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <NuxtLink to="/admin/reimbursement" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-[#93000a] text-xs font-semibold">Verifikasi <span class="material-symbols-outlined text-[14px]">arrow_forward</span></NuxtLink>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Kas Bon Pending</span>
            <div class="text-3xl font-bold tracking-tight mt-1">{{ advPendingAmount }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-muted">
            <span class="material-symbols-outlined text-[24px]">price_change</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface text-xs font-semibold">{{ advPending }} Pengajuan</span>
          <span class="text-xs text-muted">Verifikasi Finance</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Siap Disburse</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-secondary">{{ formatRpShort(Number(advSummary?.ready_amount ?? 0)) }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-secondary-container/40 flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-[24px]">send_money</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <NuxtLink to="/admin/uang-muka" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">{{ advSummary?.ready_count ?? 0 }} Siap <span class="material-symbols-outlined text-[14px]">arrow_forward</span></NuxtLink>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Disbursed</span>
            <div class="text-3xl font-bold tracking-tight text-on-surface mt-1">{{ formatRpShort(Number(advSummary?.total_disbursed ?? 0)) }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-secondary-container/60 flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[24px]">payments</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="text-xs text-muted">Akumulasi pencairan tercatat</span>
          <span class="text-xs text-secondary font-semibold">Real-time</span>
        </div>
      </div>
    </section>

    <!-- KPI: Manager & Admin (default) -->
    <section v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Travel Request</span>
            <div class="text-3xl font-bold tracking-tight text-on-surface mt-1">{{ stats?.total_requests ?? '…' }} <span class="text-sm font-normal text-muted">Pengajuan</span></div>
          </div>
          <div class="w-12 h-12 rounded-full bg-secondary-container/60 flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[24px]">travel</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span v-if="roleKey === 'admin'" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">
            <span class="material-symbols-outlined text-[14px]">group</span> {{ totalUsers }} Pengguna
          </span>
          <span v-else class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">
            <span class="material-symbols-outlined text-[14px]">group</span> Tim Saya
          </span>
          <span class="text-xs text-muted">Data sesuai hak akses</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Menunggu Approval</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-error">{{ stats?.pending_approval ?? '…' }} <span class="text-sm font-normal text-muted">Menunggu</span></div>
          </div>
          <div class="w-12 h-12 rounded-full bg-error-container/60 flex items-center justify-center text-error">
            <span class="material-symbols-outlined text-[24px]">hourglass_top</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-[#93000a] text-xs font-semibold">Perlu tindakan segera</span>
          <span class="text-xs text-muted">{{ stats?.pending_approval ?? 0 }} dalam antrean</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Budget Q2 Terpakai</span>
            <div class="text-3xl font-bold tracking-tight mt-1 text-secondary">{{ formatRpShort(Number(stats?.total_commitment ?? 0)) }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-primary-dark">
            <span class="material-symbols-outlined text-[24px]">account_balance_wallet</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="text-xs text-muted">Estimasi seluruh pengajuan tercatat</span>
          <span class="text-xs text-secondary font-semibold">Real-time</span>
        </div>
      </div>
      <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Kas Bon Pending</span>
            <div class="text-3xl font-bold tracking-tight mt-1">{{ advPendingAmount }}</div>
          </div>
          <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-muted">
            <span class="material-symbols-outlined text-[24px]">price_change</span>
          </div>
        </div>
        <div class="mt-4 pt-3 flex items-center justify-between">
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface text-xs font-semibold">{{ advPending }} Pengajuan Kas Bon</span>
          <span class="text-xs text-muted">Verifikasi Finance</span>
        </div>
      </div>
    </section>

    <!-- Visualizations 60/40 (disembunyikan untuk employee) -->
    <section v-if="roleKey !== 'employee'" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-7 bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-secondary" />
              <h2 class="text-base font-bold text-on-surface">Tren Pengeluaran Perjalanan Dinas 2025</h2>
            </div>
            <p class="text-xs text-muted mt-0.5">Realisasi biaya perjalanan dinas 6 bulan terakhir (IDR)</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-primary-container" /><span class="text-xs text-muted">Realisasi</span></div>
          </div>
        </div>
        <div class="w-full h-64 relative pt-4 flex flex-col justify-end overflow-x-auto">
          <svg class="w-full min-w-[520px] h-full overflow-visible" viewBox="0 0 520 200">
            <line stroke="#E5EEFF" stroke-dasharray="3 3" stroke-width="1" x1="40" x2="500" y1="20" y2="20" />
            <text fill="#54615B" font-family="Plus Jakarta Sans" font-size="10" text-anchor="end" x="32" y="24">300M</text>
            <line stroke="#E5EEFF" stroke-dasharray="3 3" stroke-width="1" x1="40" x2="500" y1="65" y2="65" />
            <text fill="#54615B" font-family="Plus Jakarta Sans" font-size="10" text-anchor="end" x="32" y="69">200M</text>
            <line stroke="#E5EEFF" stroke-dasharray="3 3" stroke-width="1" x1="40" x2="500" y1="110" y2="110" />
            <text fill="#54615B" font-family="Plus Jakarta Sans" font-size="10" text-anchor="end" x="32" y="114">100M</text>
            <line stroke="#D9E3F6" stroke-width="1.5" x1="40" x2="500" y1="155" y2="155" />
            <text fill="#54615B" font-family="Plus Jakarta Sans" font-size="10" text-anchor="end" x="32" y="158">0</text>
            <g v-for="b in chartBars" :key="b.label" class="cursor-pointer">
              <rect fill="#28B446" :height="b.h" rx="4" width="34" :x="b.x" :y="b.y"><title>{{ b.label }}: {{ formatRpShort(b.total) }}</title></rect>
              <text fill="#121C2A" font-family="Plus Jakarta Sans" font-size="11" font-weight="600" text-anchor="middle" :x="b.x + 17" y="174">{{ b.label }}</text>
            </g>
            <text v-if="!chartBars.length" fill="#54615B" font-size="12" text-anchor="middle" x="270" y="100">Belum ada data</text>
          </svg>
        </div>
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-surface-container-low gap-2">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-secondary text-[20px]">verified</span>
            <span class="text-xs text-on-surface">Total realisasi 12 bulan terakhir: <strong>{{ formatRpShort(chartTotalYear) }}</strong></span>
          </div>
          <NuxtLink to="/admin/travel-requests" class="text-xs font-semibold text-secondary hover:underline flex items-center gap-0.5 shrink-0">Lihat Daftar Lengkap <span class="material-symbols-outlined text-[14px]">arrow_forward</span></NuxtLink>
        </div>
      </div>
      <div class="lg:col-span-5 bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-primary-container" /><h2 class="text-base font-bold text-on-surface">Distribusi Biaya per Divisi</h2></div>
            <p class="text-xs text-muted mt-0.5">Alokasi pembelanjaan dinas periode berjalan</p>
          </div>
          <span class="text-xs px-2.5 py-1 rounded-full bg-surface-container text-muted">Real-time</span>
        </div>
        <div class="flex flex-col sm:flex-row items-center gap-6">
          <div class="relative w-44 h-44 flex items-center justify-center shrink-0">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="transparent" r="38" stroke="#E6EEFF" stroke-width="12" />
              <circle
                v-for="s in deptDist" :key="s.name"
                cx="50" cy="50" fill="transparent" r="38" :stroke="s.color"
                :stroke-dasharray="`${s.len} ${DONUT_C}`" :stroke-dashoffset="s.offset" stroke-width="12"
              ><title>{{ s.name }}: {{ formatRpShort(s.total) }}</title></circle>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span class="text-xs text-muted">Total</span>
              <span class="text-lg font-bold text-on-surface tracking-tight">{{ formatRpShort(deptTotal) }}</span>
              <span class="text-xs text-secondary font-semibold">{{ deptDist.length }} Unit</span>
            </div>
          </div>
          <div class="w-full space-y-1">
            <div v-for="s in deptDist" :key="s.name" class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors">
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full" :style="{ background: s.color }" /><span class="text-sm font-medium">{{ s.name }}</span></div>
              <div class="text-right"><span class="text-sm font-semibold">{{ s.pct }}%</span><span class="block text-xs text-muted">{{ formatRpShort(s.total) }}</span></div>
            </div>
            <p v-if="!deptDist.length" class="text-xs text-muted text-center py-2">Belum ada data</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Recent Travel Requests Table -->
    <section class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div class="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 class="text-base font-bold text-on-surface">{{ tableTitle }}</h2>
          <p class="text-xs text-muted">{{ tableSubtitle }}</p>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <NuxtLink to="/admin/travel-requests/create" class="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold hover:opacity-95 transition-all whitespace-nowrap">
            <span class="material-symbols-outlined text-[18px]">add</span><span>Buat Request</span>
          </NuxtLink>
          <div class="flex items-center bg-surface-container-low p-1 rounded-full overflow-x-auto">
            <button
              v-for="t in tabs" :key="t"
              :class="activeTab===t ? 'bg-white text-on-surface shadow-sm' : 'text-muted hover:text-on-surface'"
              class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap"
              @click="activeTab=t"
            >{{ t }}</button>
          </div>
          <div class="relative min-w-[220px]">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[18px] pointer-events-none">search</span>
            <input v-model="filterQuery" aria-label="Filter request ID atau nama" class="w-full pl-9 pr-9 py-1.5 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Filter request ID/nama..." type="text">
            <button v-if="filterQuery" aria-label="Hapus filter" class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white hover:bg-surface-container flex items-center justify-center text-muted transition-colors" @click="filterQuery = ''">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      </div>
      <div class="w-full overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="sticky top-0 z-10">
            <tr class="bg-surface-container-low text-muted text-[11px] font-semibold uppercase tracking-wider">
              <th class="py-3.5 px-6">ID Request</th>
              <th class="py-3.5 px-4">Pegawai</th>
              <th class="py-3.5 px-4">Rute &amp; Transportasi</th>
              <th class="py-3.5 px-4">Jadwal Perjalanan</th>
              <th class="py-3.5 px-4 text-right">Estimasi Biaya</th>
              <th class="py-3.5 px-4 text-center">Status Kebijakan</th>
              <th class="py-3.5 px-6 text-center">Tindakan</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low text-sm">
            <tr v-for="r in filteredRequests" :key="r.id" class="hover:bg-surface-container-low/40 transition-colors">
              <td class="py-4 px-6">
                <div class="flex flex-col">
                  <NuxtLink :to="`/admin/travel-requests/${r.id.replace('#','')}`" class="text-sm font-bold text-secondary hover:underline">{{ r.id }}</NuxtLink>
                  <span class="text-xs text-muted">{{ r.createdAt }}</span>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center gap-3">
                  <img v-if="r.employee.avatar" :src="r.employee.avatar" :alt="`Foto ${r.employee.name}`" class="w-9 h-9 rounded-full object-cover" loading="lazy" width="36" height="36" decoding="async">
                  <div v-else class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-xs font-bold shrink-0">{{ r.employee.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('') }}</div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium truncate">{{ r.employee.name }}</span>
                    <span class="text-xs text-muted truncate">{{ r.employee.department }}</span>
                  </div>
                </div>
              </td>
              <td class="py-4 px-4">
                <span class="text-sm font-semibold">{{ r.route }}</span>
                <span class="block text-xs text-muted flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">flight</span> {{ r.transport }}</span>
              </td>
              <td class="py-4 px-4">
                <span class="text-sm">{{ r.startDate }} - {{ r.endDate }}</span>
                <span class="block text-xs text-muted">{{ r.duration }} ({{ r.project }})</span>
              </td>
              <td class="py-4 px-4 text-right">
                <span class="text-sm font-bold">{{ r.costLabel }}</span>
                <span class="block text-xs text-secondary">Estimasi Proyek</span>
              </td>
              <td class="py-4 px-4 text-center">
                <span :class="statusBadgeClass(r.status)" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                  <span class="w-1.5 h-1.5 rounded-full bg-current" /> {{ r.status }}
                </span>
              </td>
              <td class="py-4 px-6 text-center">
                <div class="flex items-center justify-center gap-2">
                  <button v-if="canBatchApproveTravel" aria-label="Setujui cepat" class="w-8 h-8 rounded-full bg-secondary-container text-[#2e6f3c] flex items-center justify-center hover:bg-primary-container hover:text-white transition-all" @click="quickApprove(r.id)"><span class="material-symbols-outlined text-[18px]">check</span></button>
                  <!-- Penolakan hanya lewat jalur approval (decide) — PUT Rejected selalu 403 -->
                  <NuxtLink :to="`/admin/travel-requests/${r.id.replace('#','')}`" aria-label="Lihat detail pengajuan" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container hover:text-on-surface transition-all"><span class="material-symbols-outlined text-[18px]">visibility</span></NuxtLink>
                </div>
              </td>
            </tr>
            <tr v-if="filteredRequests.length===0">
              <td colspan="7" class="p-0">
                <EmptyState icon="search_off" title="Tidak ada pengajuan cocok" :message="`Tidak ada hasil untuk &quot;${filterQuery}&quot;. Coba kata kunci lain atau ubah tab.`">
                  <BaseButton variant="outline" size="sm" class="mt-3" @click="filterQuery = ''; activeTab = tabs[0]">Hapus filter</BaseButton>
                </EmptyState>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 bg-surface-container-low/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
        <div class="flex items-center gap-2"><span>Menampilkan <strong>1 - {{ filteredRequests.length }}</strong> dari <strong>{{ stats?.total_requests ?? 0 }}</strong> tiket perjalanan</span><span class="opacity-40">•</span><span>Data sesuai hak akses</span></div>
        <NuxtLink to="/admin/travel-requests" class="flex items-center gap-1 px-4 py-2 rounded-full bg-white text-on-surface text-xs font-semibold hover:bg-surface-container shadow-sm transition-colors">Lihat semua <span class="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span></NuxtLink>
      </div>
    </section>

    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
