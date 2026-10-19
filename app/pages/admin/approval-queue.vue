<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface QueueCard {
  id: string
  category: string
  badge: string
  badgeClass: string
  levelLabel: string
  levelClass?: string
  avatar?: string
  initials?: string
  name: string
  role: string
  dept: string
  routeIcon: string
  route: string
  date: string
  justificationTitle: string
  justification: string
  tags: { icon: string; label: string; cls: string }[]
  amountLabel: string
  amount: string
  amountSub: string
  budgetLabel: string
  budgetPct: string
  budgetWidth: string
  budgetDetailLeft: string
  budgetDetailRight: string
  attachmentLabel: string
  urgent?: boolean
  /**
   * Metadata keputusan dari backend (ApprovalChain::appendDecisionMeta).
   * can_decide = giliran Saya benar-benar (level + approver tujuan + delegasi).
   * Dulu gate hanya based role sehingga tombol muncul di baris milik approver lain.
   */
  canDecide: boolean
  blockReason: string
  decidedByMe: boolean
  myDecision: string
  waitingFor: string
}

import { formatRp } from '~/utils/format'
import { mapEmployee, formatDateId } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { POLICY_BADGE, QUEUE_STATUS, TRAVEL_STATUS } from '~/constants/domain'
import { downloadExport } from '~/composables/useMappers'

const api = useApi()
const searchQuery = ref('')
const debouncedSearch = useDebounce(searchQuery, 300)
const activeTab = ref<'all'|'urgent'|'travel'|'advance'>('all')
const selected = ref<Set<string>>(new Set())
const showDecision = ref(false)
const showDetail = ref(false)
const decisionContext = ref<{ action: string; id: string; queueId: number; name: string; amount: string }>({ action: 'Setujui', id: '', queueId: 0, name: '', amount: '' })
const detailContext = ref<{ id: string; name: string }>({ id: '', name: '' })
const toastMsg = ref('')
const toastVisible = ref(false)
const toastIcon = ref('check_circle')
const decisionNote = ref('')

const statusFilter = ref<'pending' | 'done'>('pending')

const queueParams = computed(() => ({
  type: activeTab.value,
  status: statusFilter.value === 'pending' ? QUEUE_STATUS.PENDING : 'approved,rejected',
  search: debouncedSearch.value.trim() || undefined,
  per_page: 20,
}))

function switchStatus(s: typeof statusFilter.value) {
  statusFilter.value = s
  selected.value = new Set()
}
const { data: queueRes } = await useAsyncData('approval-queue', () => api<LaravelPaginator<any>>('/approval-queue', { params: queueParams.value }), { watch: [queueParams] })

// KPI antrean: angka nyata, ter-scope per role oleh backend. Hitungan memakai
// per_page=1 (hanya meta.total yang dibaca) agar ringan.
const { data: pendingCountRes } = await useAsyncData('queue-pending-count', () => api<LaravelPaginator<any>>('/approval-queue', { params: { status: QUEUE_STATUS.PENDING, per_page: 1 } }))
const { data: urgentCountRes } = await useAsyncData('queue-urgent-count', () => api<LaravelPaginator<any>>('/approval-queue', { params: { status: QUEUE_STATUS.PENDING, type: 'urgent', per_page: 1 } }))
const { data: travelCountRes } = await useAsyncData('queue-travel-count', () => api<LaravelPaginator<any>>('/approval-queue', { params: { status: QUEUE_STATUS.PENDING, type: 'travel', per_page: 1 } }))
const { data: advanceCountRes } = await useAsyncData('queue-advance-count', () => api<LaravelPaginator<any>>('/approval-queue', { params: { status: QUEUE_STATUS.PENDING, type: 'advance', per_page: 1 } }))
const { data: trSummary } = await useAsyncData('queue-tr-summary', () => api<{ total: number; approved: number; by_status: Record<string, number> }>('/travel-requests-summary'))
const { data: doneSampleRes } = await useAsyncData('queue-done-sample', () => api<LaravelPaginator<any>>('/approval-queue', { params: { status: 'approved,rejected', per_page: 50 } }))

function queueTotal(res: unknown): number {
  return paginatorMeta((res as any)?.data ? (res as LaravelPaginator<any>) : []).total
}
const queueKpi = computed(() => {
  const pending = queueTotal(pendingCountRes.value)
  const urgent = queueTotal(urgentCountRes.value)
  const travel = queueTotal(travelCountRes.value)
  const advance = queueTotal(advanceCountRes.value)
  const byStatus = (trSummary.value?.by_status ?? {}) as Record<string, number>
  const approved = Number(trSummary.value?.approved ?? 0)
  const rejected = Number(byStatus[TRAVEL_STATUS.REJECTED] ?? 0)
  const total = Number(trSummary.value?.total ?? 0)
  // Kecepatan respons: rata-rata selisih decided_at - created_at dari
  // riwayat yang dimuat (maks 50). Bukan benchmark global.
  const doneItems = paginatorMeta(doneSampleRes.value?.data ? doneSampleRes.value : []).items as any[]
  const decided = doneItems.filter(d => d.decided_at && d.created_at)
  const avgHours = decided.length
    ? decided.reduce((s, d) => s + (new Date(d.decided_at).getTime() - new Date(d.created_at).getTime()) / 3600000, 0) / decided.length
    : null
  return { pending, urgent, travel, advance, approved, rejected, total, avgHours, sampleSize: decided.length }
})
const QUEUE_KPI_KEYS = ['approval-queue', 'queue-pending-count', 'queue-urgent-count', 'queue-travel-count', 'queue-advance-count', 'queue-tr-summary', 'queue-done-sample']

function initialsOfName(name: string) { return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() }

const cards = computed<QueueCard[]>(() =>
  paginatorMeta(queueRes.value?.data ? queueRes.value : []).items.map((q: any) => {
    const emp = mapEmployee(q.travel_request?.user)
    const isAdvance = q.type === 'Uang Muka'
    const category = q.urgent ? `urgent ${isAdvance ? 'advance' : 'travel'}` : (isAdvance ? 'advance' : 'travel')
    return {
      id: q.travel_request?.request_no ?? `#Q-${q.id}`,
      queueId: q.id,
      category,
      badge: q.urgent ? 'Prioritas Tinggi' : isAdvance ? 'Kas Bon / Uang Muka Operasional' : 'Prioritas Normal',
      badgeClass: q.urgent ? 'bg-error-container text-[#93000a]' : isAdvance ? 'bg-[#D8E6DE] text-[#3D4944]' : 'bg-secondary-container text-[#0b5223]',
      levelLabel: q.level ?? '-',
      levelClass: 'text-secondary font-bold',
      avatar: emp.avatar || undefined,
      initials: emp.avatar ? undefined : initialsOfName(emp.name),
      name: emp.name,
      role: emp.role,
      dept: emp.department,
      routeIcon: isAdvance ? 'account_balance' : 'flight_takeoff',
      route: q.travel_request?.route ?? '-',
      date: q.travel_request ? `${formatDateId(q.travel_request.start_date)} - ${formatDateId(q.travel_request.end_date)}` : '-',
      justificationTitle: 'Keperluan Perjalanan:',
      justification: q.justification ?? q.travel_request?.purpose ?? '-',
      tags: q.urgent ? [{ icon: 'bolt', label: 'Urgent', cls: 'bg-error-container text-[#93000a]' }] : [],
      amountLabel: isAdvance ? 'JUMLAH PENCAIRAN UANG MUKA' : 'ESTIMASI BIAYA PERJALANAN',
      amount: formatRp(Number(q.amount ?? 0)),
      amountSub: formatRp(Number(q.travel_request?.cost ?? 0)),
      budgetLabel: '', budgetPct: '', budgetWidth: '', budgetDetailLeft: '', budgetDetailRight: '',
      attachmentLabel: `${q.travel_request?.documents?.length ?? 0} Lampiran`,
      urgent: !!q.urgent,
      queueStatus: q.status ?? QUEUE_STATUS.PENDING,
      decidedByName: q.decided_by?.name ?? '',
      onBehalfName: q.on_behalf_of?.name ?? '',
      policyStatus: q.travel_request?.policy_status ?? '',
      canDecide: q.can_decide === true,
      blockReason: q.block_reason ?? '',
      decidedByMe: q.decided_by_me === true,
      myDecision: q.my_decision ?? '',
      waitingFor: q.waiting_for ?? '',
    } as QueueCard & { queueId: number; queueStatus: string; decidedByName: string; onBehalfName: string; policyStatus: string }
  }),
)


const filtered = computed(() => cards.value)

// Hanya baris yang benar-benar giliran saya yang boleh dipilih/dibatch —
// klik pada baris milik approver lain akan ditolak backend dengan 403.
const decidableCards = computed(() => filtered.value.filter(c => c.canDecide))
const batchCount = computed(() => selected.value.size)

function toggleSelect(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selected.value = s
}
function toggleSelectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  selected.value = checked ? new Set(decidableCards.value.map(c => c.id)) : new Set()
}
const queueSearchInput = ref<HTMLInputElement | null>(null)
function focusQueueSearch() {
  queueSearchInput.value?.focus()
}
function queueIdOf(id: string) {
  return (cards.value.find(c => c.id === id) as unknown as { queueId: number } | undefined)?.queueId ?? 0
}
function openDecision(action: string, id: string, name: string, amount: string) {
  decisionContext.value = { action, id, queueId: queueIdOf(id), name, amount }
  decisionNote.value = ''
  showDecision.value = true
}
function closeDecision() { showDecision.value = false }
async function submitDecision() {
  const ctx = decisionContext.value
  // Penolakan wajib alasan (backend 422 bila kosong) — modal tetap terbuka.
  if (ctx.action === 'Tolak' && decisionNote.value.trim().length < 3) {
    showToast('Alasan penolakan wajib diisi (minimal 3 karakter).', 'error')
    return
  }
  showDecision.value = false
  try {
    const res = await api<{ message: string }>(`/approval-queue/${ctx.queueId}/decide`, {
      method: 'POST', body: { action: ctx.action === 'Tolak' ? 'reject' : 'approve', note: decisionNote.value || undefined },
    })
    showToast(res.message, ctx.action === 'Tolak' ? 'cancel' : 'check_circle')
    await refreshNuxtData(QUEUE_KPI_KEYS)
  } catch (e: any) {
    showToast(e?.data?.message || 'Gagal mengirim keputusan. Coba lagi.', 'error')
  }
}
function applyPreset(t: string) { decisionNote.value = t }
const detailCard = ref<QueueCard | null>(null)
function openDetail(id: string, name: string) {
  detailContext.value = { id, name }
  detailCard.value = cards.value.find(c => c.id === id) ?? null
  showDetail.value = true
}
function closeDetail() { showDetail.value = false }
async function approveDirect(id: string) {
  try {
    const res = await api<{ message: string }>(`/approval-queue/${queueIdOf(id)}/decide`, { method: 'POST', body: { action: 'approve' } })
    showToast(res.message, 'check_circle')
    await refreshNuxtData(QUEUE_KPI_KEYS)
  } catch {
    showToast('Gagal menyetujui pengajuan.', 'error')
  }
}
async function batchApprove() {
  if (selected.value.size===0) { showToast('Pilih setidaknya 1 permohonan untuk disetujui massal.', 'info'); return }
  try {
    const ids = [...selected.value].map(queueIdOf).filter(Boolean)
    const res = await api<{ message: string }>('/approval-queue/batch-approve', { method: 'POST', body: { ids } })
    selected.value = new Set()
    showToast(res.message, 'done_all')
    await refreshNuxtData(QUEUE_KPI_KEYS)
  } catch {
    showToast('Batch approve gagal. Coba lagi.', 'error')
  }
}
async function exportQueue() {
  await downloadExport('travel-requests', 'antrian-approval.csv')
  showToast('File antrian-approval.csv berhasil diunduh.', 'file_download')
}
function showToast(msg: string, icon='check_circle') {
  toastMsg.value = msg; toastIcon.value = icon; toastVisible.value = true
  setTimeout(()=> toastVisible.value=false, 3800)
}
function switchTab(t: typeof activeTab.value) { activeTab.value = t; selected.value = new Set() }
</script>

<template>
  <div class="flex flex-col w-full space-y-6 pb-10">
    <!-- Header & KPI -->
    <div class="flex flex-col gap-6 mt-4">
      <div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div class="flex flex-col">
          <div class="flex items-center gap-2 mb-1">

          </div>

        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button v-if="batchCount > 0" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:opacity-95 transition-all" @click="batchApprove">
            <span class="material-symbols-outlined text-[18px]">done_all</span>
            <span>Batch Approve Terpilih ({{ batchCount }})</span>
          </button>
          <button aria-label="Export daftar" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-on-surface shadow-sm hover:bg-surface-container-low transition-all text-sm font-semibold" @click="exportQueue"><span class="material-symbols-outlined text-muted text-[18px]">file_download</span><span>Export Daftar (CSV)</span></button>
          <button aria-label="Fokus ke pencarian" title="Fokus ke pencarian" class="w-10 h-10 rounded-full bg-surface-container-low text-on-surface flex items-center justify-center hover:bg-surface-container transition-colors" @click="focusQueueSearch"><span class="material-symbols-outlined text-[20px]">tune</span></button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div class="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-secondary-container/40 blur-xl pointer-events-none" />
          <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Perlu Tindakan</span><div class="w-8 h-8 rounded-full bg-secondary-container text-[#0b5223] flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">hourglass_top</span></div></div>
          <div class="mt-4 flex items-baseline gap-2"><span class="text-4xl font-bold leading-none">{{ queueKpi.pending }}</span><span class="text-sm text-error font-semibold flex items-center"><span class="material-symbols-outlined text-[16px]">priority_high</span> {{ queueKpi.urgent }} Urgent</span></div>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Disetujui Minggu Ini</span><div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">check_circle</span></div></div>
          <div class="mt-4 flex items-baseline gap-2"><span class="text-4xl font-bold leading-none">{{ queueKpi.approved }}</span><span class="text-sm text-secondary font-semibold flex items-center"><span class="material-symbols-outlined text-[16px]">trending_up</span> dari {{ queueKpi.total }} pengajuan</span></div>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Ditolak / Dikembalikan</span><div class="w-8 h-8 rounded-full bg-error-container text-[#93000a] flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">cancel</span></div></div>
          <div class="mt-4 flex items-baseline gap-2"><span class="text-4xl font-bold leading-none">{{ queueKpi.rejected }}</span><span class="text-sm text-muted">Rasio {{ queueKpi.total ? ((queueKpi.rejected / queueKpi.total) * 100).toFixed(1) : '0.0' }}%</span></div>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Kecepatan Respons</span><div class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">speed</span></div></div>
          <div class="mt-3 flex items-center justify-between">
            <div><div class="text-2xl font-bold">{{ queueKpi.avgHours === null ? '—' : `${queueKpi.avgHours.toFixed(1)}` }} <span class="text-sm font-normal text-muted">Jam</span></div><span class="text-xs text-secondary font-semibold">{{ queueKpi.sampleSize === 0 ? 'Belum ada riwayat putusan' : `Dari ${queueKpi.sampleSize} riwayat terakhir` }}</span></div>
            <div class="w-20 h-10"><svg class="w-full h-full text-primary-container" fill="none" preserveAspectRatio="none" viewBox="0 0 100 40"><path d="M0 32 Q25 28 40 18 T80 8 T100 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.5" /><circle cx="100" cy="4" fill="currentColor" r="3" /></svg></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters Tabs & Search -->
    <div class="bg-white p-4 rounded-xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="flex items-center gap-1 overflow-x-auto pb-1">
          <button :class="activeTab==='all' ? 'bg-secondary-container text-[#0b5223] shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'" class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all" @click="switchTab('all')">Semua Antrian ({{ queueKpi.pending }})</button>
          <button :class="activeTab==='urgent' ? 'bg-secondary-container text-[#0b5223] shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'" class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all" @click="switchTab('urgent')"><span class="inline-block w-2 h-2 rounded-full bg-error mr-1.5" />Urgensi Tinggi ({{ queueKpi.urgent }})</button>
          <button :class="activeTab==='travel' ? 'bg-secondary-container text-[#0b5223] shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'" class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all" @click="switchTab('travel')">Travel Request ({{ queueKpi.travel }})</button>
          <button :class="activeTab==='advance' ? 'bg-secondary-container text-[#0b5223] shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'" class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all" @click="switchTab('advance')">Permintaan Uang Muka ({{ queueKpi.advance }})</button>
        <span class="w-px h-6 bg-surface-container mx-1 shrink-0" aria-hidden="true" />
        <button :class="statusFilter==='pending' ? 'bg-secondary text-white shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'" class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all" @click="switchStatus('pending')">Menunggu</button>
        <button :class="statusFilter==='done' ? 'bg-secondary text-white shadow-sm' : 'bg-surface-container-low text-[#3e4a3c] hover:bg-surface-container'" class="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all" @click="switchStatus('done')">Riwayat</button>
      </div>
      <div class="flex items-center gap-2 flex-1 max-w-md justify-end">
        <div class="relative w-full">
          <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[18px]">search</span>
          <input ref="queueSearchInput" v-model="searchQuery" aria-label="Cari antrian" class="w-full pl-10 pr-4 py-1.5 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:shadow-sm transition-all" placeholder="Cari pemohon, divisi, nomor TR/ADV..." type="text">
        </div>
        <label v-if="statusFilter === 'pending' && decidableCards.length > 0" class="flex items-center gap-1.5 text-muted text-xs cursor-pointer select-none whitespace-nowrap pl-2"><input aria-label="Pilih semua" class="w-4 h-4 rounded accent-primary cursor-pointer" type="checkbox" :checked="selected.size===decidableCards.length && decidableCards.length>0" @change="toggleSelectAll"><span>Pilih Semua</span></label>
      </div>
    </div>

    <!-- Cards List -->
    <div class="flex flex-col space-y-4">
      <div v-for="c in filtered" :key="c.id" class="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2">
          <div class="flex flex-wrap items-center gap-2">
            <input v-if="c.canDecide" :checked="selected.has(c.id)" aria-label="Pilih item" class="w-4 h-4 rounded accent-primary cursor-pointer" type="checkbox" @change="toggleSelect(c.id)">
            <span :class="c.badgeClass" class="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">{{ c.category.includes('advance') ? 'payments' : 'bolt' }}</span>{{ c.badge }}</span>
            <span v-if="(c as any).queueStatus === QUEUE_STATUS.APPROVED" class="px-2.5 py-0.5 rounded-full bg-secondary-container text-[#0b5223] text-xs font-semibold">Disetujui</span>
            <span v-else-if="(c as any).queueStatus === QUEUE_STATUS.REJECTED" class="px-2.5 py-0.5 rounded-full bg-error-container text-[#93000a] text-xs font-semibold">Ditolak</span>
            <span v-if="(c as any).onBehalfName" class="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface text-xs font-medium" :title="`Diputus oleh ${(c as any).decidedByName}`">Plt a/n {{ (c as any).onBehalfName }}</span>
            <span v-if="String((c as any).policyStatus ?? '').includes(POLICY_BADGE.DEV_PREFIX)" class="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold" :title="`Estimasi melebihi plafon grade pemohon`">{{ (c as any).policyStatus }}</span>
            <span class="text-sm text-muted tracking-wide">#{{ c.id }}</span>
            <span v-if="c.id==='TR-2025-104'" class="text-xs text-muted">• Diajukan 4 jam lalu oleh Sistem Escalation</span>
            <span v-else-if="c.id==='TR-2025-107'" class="text-xs text-muted">• Diajukan Kemarin pukul 16:30</span>
            <span v-else-if="c.id==='ADV-2025-042'" class="text-xs text-muted">• Terkait TR Disetujui: #TR-2025-098</span>
            <span v-else class="text-xs text-muted">• Diajukan Hari Ini</span>
          </div>
          <div class="flex items-center gap-2 bg-surface-container-low px-4 py-1 rounded-full">
            <span class="text-xs text-on-surface font-medium">{{ c.category.includes('advance') ? 'Tahap Finance:' : 'Tahap Approval:' }}</span>
            <span :class="c.levelClass" class="text-xs">{{ c.levelLabel }}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-7 flex flex-col space-y-2">
            <div class="flex items-start gap-4">
              <img v-if="c.avatar" :src="c.avatar" :alt="`Foto ${c.name}`" class="w-14 h-14 rounded-full object-cover shadow-sm shrink-0">
              <div v-else class="w-14 h-14 rounded-full bg-secondary-container text-[#0b5223] flex items-center justify-center font-bold shadow-sm shrink-0">{{ c.initials }}</div>
              <div class="flex flex-col">
                <div class="flex items-center gap-2 flex-wrap"><span class="text-base font-bold">{{ c.name }}</span><span class="px-2 py-0.5 rounded-full bg-surface-container text-xs">{{ c.role }}</span></div>
                <span class="text-xs text-muted">{{ c.dept }}</span>
                <div class="mt-3 flex flex-wrap items-center gap-4 p-3 rounded-xl bg-surface-container-low">
                  <div v-if="!c.category.includes('advance')" class="flex items-center gap-1.5 text-on-surface text-sm font-semibold">
                    <span class="material-symbols-outlined text-primary text-[20px]">{{ c.routeIcon }}</span>
                    <span>{{ c.route }}</span>
                    <span class="material-symbols-outlined text-muted text-[18px]">arrow_forward</span>
                    <span v-if="c.id==='TR-2025-104'">Surabaya (SUB)</span>
                    <span v-else-if="c.id==='TR-2025-107'">Medan (KNO)</span>
                    <span v-else-if="c.id==='TR-2025-110'">Balikpapan (BPN)</span>
                  </div>
                  <div v-else class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[18px]">account_balance</span></div>
                    <div class="flex flex-col"><span class="text-xs text-muted">Rekening Transfer Penerima:</span><span class="text-sm font-semibold">{{ c.route }}</span></div>
                  </div>
                  <div v-if="!c.category.includes('advance')" class="flex items-center gap-1.5 text-muted text-xs"><span class="material-symbols-outlined text-[16px]">calendar_month</span><span>{{ c.date }}</span></div>
                </div>
              </div>
            </div>
            <div class="pl-0 lg:pl-[72px] space-y-1 mt-1">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-muted">{{ c.justificationTitle }}</div>
              <p class="text-sm leading-relaxed">{{ c.justification }}</p>
              <div v-if="c.tags.length" class="flex flex-wrap items-center gap-2 pt-1">
                <span v-for="tag in c.tags" :key="tag.label" :class="tag.cls" class="inline-flex items-center gap-1 text-xs px-3 py-0.5 rounded-full font-semibold"><span class="material-symbols-outlined text-[14px]">{{ tag.icon }}</span> {{ tag.label }}</span>
              </div>
            </div>
          </div>
          <div class="lg:col-span-5 bg-surface-container-low p-4 rounded-xl flex flex-col justify-between space-y-4">
            <div class="space-y-1">
              <div class="flex items-center justify-between text-muted text-[11px] font-semibold uppercase tracking-wider"><span>{{ c.amountLabel }}</span><span :class="c.id==='TR-2025-110' ? 'text-error' : 'text-secondary'">{{ c.id==='TR-2025-110' ? '+18% dari Rata-rata' : c.id.includes('ADV') ? 'Ready for Disbursement' : 'Tipe: Emergency Fix' }}</span></div>
              <div class="flex items-baseline justify-between">
                <span class="text-2xl font-bold">{{ c.amount }}</span>
                <span class="text-xs text-muted"><template v-if="c.id.includes('ADV')"> </template>Kas Bon Diajukan: <strong class="text-on-surface">{{ c.amountSub }}</strong><template v-if="c.id==='TR-2025-110'">{{ c.amountSub }}</template></span>
              </div>
            </div>
            <div v-if="c.budgetWidth" class="space-y-1">
              <div class="flex items-center justify-between text-xs"><span class="text-muted">{{ c.budgetLabel }}</span><span class="text-secondary font-bold">{{ c.budgetPct }}</span></div>
              <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden"><div class="h-full bg-primary rounded-full" :style="`width:${c.budgetWidth}`" /></div>
              <div v-if="c.budgetDetailLeft" class="flex justify-between text-[11px] text-muted"><span>{{ c.budgetDetailLeft }}</span><span>{{ c.budgetDetailRight }}</span></div>
            </div>
            <div v-if="c.id==='ADV-2025-042'" class="p-3 rounded-xl bg-white text-muted text-xs flex items-center gap-2"><span class="material-symbols-outlined text-primary text-[18px]">info</span><span>Settlement laporan realisasi wajib diserahkan maks. 3 hari kerja setelah kepulangan.</span></div>
            <div v-if="c.id==='ADV-2025-045'" class="p-3 rounded-xl bg-white text-muted text-xs flex items-center gap-2"><span class="material-symbols-outlined text-primary text-[18px]">verified</span><span>Uang Muka sebelumnya telah terselesaikan (settled 100%).</span></div>
            <div class="pt-1 flex items-center justify-between">
              <a href="#" class="text-primary text-sm font-medium flex items-center gap-1 hover:underline" @click.prevent="openDetail(c.id, c.name)"><span>{{ c.id.includes('ADV') ? 'Detail Surat Perintah Tugas' : c.id==='TR-2025-110' ? 'Lihat Rekomendasi Tarif Alternatif' : c.id==='TR-2025-107' ? 'Tinjau Proposal & Rincian Tiket' : 'Lihat Dokumen & Tiket Lengkap' }}</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></a>
              <span class="text-xs text-muted flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">receipt</span> {{ c.attachmentLabel }}</span>
            </div>
          </div>
        </div>
        <div class="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-surface-container-low/50 -mx-6 -mb-6 p-4 rounded-b-xl">
          <div class="flex-1 max-w-lg"><input aria-label="Catatan persetujuan" class="w-full px-4 py-1.5 rounded-full bg-white text-on-surface placeholder:text-muted text-xs focus:outline-none focus:shadow-sm" :placeholder="c.id.includes('ADV') ? 'Catatan release transfer ke Bank...' : 'Tulis catatan persetujuan untuk Finance / Pemohon (opsional)...'" type="text"></div>
          <div v-if="c.canDecide" class="flex items-center gap-2 justify-end">
            <button class="flex items-center gap-1 px-4 py-1.5 rounded-full bg-white text-error hover:bg-error-container hover:text-[#93000a] text-sm font-medium transition-all shadow-sm" @click="openDecision('Tolak', c.id, c.name, c.amount)"><span class="material-symbols-outlined text-[18px]">close</span><span>Tolak</span></button>
            <button class="flex items-center gap-1 px-5 py-1.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:opacity-95 transition-all" @click="approveDirect(c.id)"><span class="material-symbols-outlined text-[18px]">check</span><span>{{ c.id.includes('ADV') ? 'Setujui Pencairan Uang Muka' : c.id==='TR-2025-110' ? 'Setujui Override (Approve)' : 'Setujui (Approve)' }}</span></button>
          </div>
          <div v-else class="flex items-center gap-2 justify-end flex-wrap text-xs">
            <span v-if="c.decidedByMe" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold" :class="c.myDecision === QUEUE_STATUS.REJECTED ? 'bg-error-container text-[#93000a]' : 'bg-secondary-container text-[#0b5223]'">
              <span class="material-symbols-outlined text-[15px]">{{ c.myDecision === QUEUE_STATUS.REJECTED ? 'block' : 'check_circle' }}</span>
              {{ c.myDecision === QUEUE_STATUS.REJECTED ? 'Anda Yang Menolak' : 'Sudah Anda Setujui' }}
            </span>
            <span v-if="c.queueStatus === QUEUE_STATUS.PENDING && !c.decidedByMe" class="flex items-center gap-1.5 text-muted">
              <span class="material-symbols-outlined text-[15px]">hourglass_top</span>
              Menunggu persetujuan {{ c.waitingFor || `approver level ${c.levelLabel}` }} — giliran Anda sudah lewat.
            </span>
            <span v-else-if="!c.decidedByMe">Diputus oleh {{ c.decidedByName || '-' }}<template v-if="c.onBehalfName"> (Plt a/n {{ c.onBehalfName }})</template> — terekam di tab Riwayat.</span>
          </div>
        </div>
      </div>
      <div v-if="filtered.length===0" class="bg-white rounded-xl p-12 text-center shadow-sm">
        <span class="material-symbols-outlined text-[48px] text-muted">search_off</span>
        <p class="text-sm text-muted mt-2">Tidak ada antrian yang cocok dengan filter "{{ searchQuery }}" pada kategori {{ activeTab }}.</p>
      </div>
    </div>

    <!-- Decision Modal -->
    <div v-if="showDecision" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="closeDecision">
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 flex flex-col space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div :class="decisionContext.action==='Tolak' ? 'bg-error-container text-[#93000a]' : 'bg-primary/10 text-primary'" class="w-10 h-10 rounded-full flex items-center justify-center"><span class="material-symbols-outlined text-[24px]">{{ decisionContext.action==='Tolak' ? 'cancel' : 'verified' }}</span></div>
            <div><h2 class="text-base font-bold">{{ decisionContext.action==='Tolak' ? 'Konfirmasi Penolakan Pengajuan' : 'Konfirmasi Keputusan Otorisasi' }}</h2><p class="text-xs text-muted">Permohonan #{{ decisionContext.id }} • {{ decisionContext.name }} ({{ decisionContext.amount }})</p></div>
          </div>
          <button aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="closeDecision"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div class="space-y-1">
          <label class="text-[11px] font-semibold uppercase tracking-wider text-muted">Pilih Template Catatan Cepat:</label>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="t in ['Sesuai kebijakan perjalanan dinas perusahaan','Budget departemen telah diverifikasi & dialokasikan','Harap lampirkan tiket perbandingan tarif maskapai lebih hemat','Disetujui bersyarat: hotel downgrade ke standard rate']" :key="t" class="px-3 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface text-xs transition-all text-left" @click="applyPreset(t)">{{ t }}</button>
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-[11px] font-semibold uppercase tracking-wider text-muted">Catatan Keputusan Resmi (Terekam di Audit Log){{ decisionContext.action === 'Tolak' ? ' — wajib diisi *' : '' }}:</label>
          <textarea v-model="decisionNote" :required="decisionContext.action === 'Tolak'" aria-label="Catatan keputusan" class="w-full p-3 rounded-xl bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:shadow-sm" :placeholder="decisionContext.action==='Tolak' ? 'Wajib mencantumkan alasan penolakan agar pemohon dapat memperbaiki dokumen...' : 'Tuliskan catatan persetujuan untuk Finance atau instruksi delegasi...'" rows="4" />
        </div>
        <p class="flex items-center gap-2 text-xs text-muted"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">mail</span><span>Notifikasi dalam aplikasi selalu dikirim; email mengikuti preferensi notifikasi pemohon.</span></p>
        <div class="pt-2 flex items-center justify-end gap-2">
          <button class="px-5 py-1.5 rounded-full bg-surface-container-low text-on-surface text-sm font-medium hover:bg-surface-container" @click="closeDecision">Batal</button>
          <button :class="decisionContext.action==='Tolak' ? 'bg-error text-white' : 'bg-primary-container text-[#003e0f]'" class="flex items-center gap-1.5 px-5 py-1.5 rounded-full text-sm font-semibold shadow-sm hover:opacity-95" @click="submitDecision"><span class="material-symbols-outlined text-[18px]">send</span><span>{{ decisionContext.action==='Tolak' ? 'Konfirmasi & Tolak Pengajuan' : 'Kirim Persetujuan Resmi' }}</span></button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="showDetail" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="closeDetail">
      <div class="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-2">
          <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-secondary-container text-[#0b5223] flex items-center justify-center"><span class="material-symbols-outlined text-[22px]">description</span></div><div><h2 class="text-base font-bold">Rincian Dokumen &amp; Tiket</h2><p class="text-xs text-muted">ID: #{{ detailContext.id }} • Pemohon: {{ detailContext.name }}</p></div></div>
          <button aria-label="Tutup detail" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="closeDetail"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 rounded-xl bg-surface-container-low space-y-1"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Rute Perjalanan</span><div class="text-sm font-bold">{{ detailCard?.route ?? '-' }}</div><div class="text-xs text-muted">{{ detailCard?.date ?? '-' }}</div></div>
          <div class="p-4 rounded-xl bg-surface-container-low space-y-1"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Estimasi Biaya</span><div class="text-sm font-bold">{{ detailCard?.amount ?? '-' }}</div><div class="text-xs text-muted">{{ detailCard?.amountLabel ?? '' }}</div></div>
        </div>
        <div class="space-y-2 pt-2"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Justifikasi</span>
          <p class="text-sm leading-relaxed">{{ detailCard?.justification ?? '-' }}</p>
          <div class="flex items-center gap-2 text-xs text-muted"><span class="material-symbols-outlined text-[16px]">verified</span><span>Level {{ detailCard?.levelLabel ?? '-' }} • Status: {{ (detailCard as any)?.queueStatus ?? QUEUE_STATUS.PENDING }}</span></div>
        </div>
        <div class="pt-4 flex items-center justify-end"><button class="px-5 py-1.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:opacity-95" @click="closeDetail">Tutup Rincian</button></div>
      </div>
    </div>

    <!-- Toast -->
    <div :class="toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'" class="fixed bottom-6 right-6 z-50 bg-[#27313F] text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 transition-all duration-300">
      <span class="material-symbols-outlined text-[#7AFD85] text-[20px]">{{ toastIcon }}</span>
      <span class="text-sm font-medium">{{ toastMsg }}</span>
    </div>
  </div>
</template>
