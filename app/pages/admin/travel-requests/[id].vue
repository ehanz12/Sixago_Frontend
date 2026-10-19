<script setup lang="ts">
definePageMeta({ layout: 'admin' })
import type { TravelRequest } from '~/types'
import { formatRp, statusPillClass } from '~/utils/format'
import { useAppStore } from '~/stores/app'

function statusBadgeClass(status: string) { return statusPillClass(status) }

/**
 * Backend mengembalikan file_url sebagai path root-relative "/storage/..."
 * (TravelDocumentController:54). Kalau dipakai langsung sebagai href, browser
 * akan Menyelesaikannya ke origin Nuxt (port 3000), bukan ke origin API.
 */
const runtimeConfig = useRuntimeConfig()
const storageBase = `${String(runtimeConfig.public.apiBase).replace(/\/api$/, '')}/storage`
function docHref(url?: string | null) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${storageBase}/${String(url).replace(/^\/+/, '')}`
}
const canUploadDoc = computed(() => {
  const me = useAppStore()
  if (!detail.value) return false
  return me.isSuperAdmin || me.canFinance || String((detail.value as any).user_id) === String(me.user?.id)
})
// Pemohon hanya boleh edit field + hapus + batalkan pra-approval.
// Ubah status lain (Rejected/Approved/...) selalu 403 dari backend.
const isOwnerOrSA = computed(() => {
  const me = useAppStore()
  if (!detail.value) return false
  return me.isSuperAdmin || String((detail.value as any).user_id) === String(me.user?.id)
})
// Batalkan tampil hanya saat penarikan masih sah: Submitted (In Review berarti
// sudah ada baris decided → backend menjawab 409).
const canCancelOwn = computed(() => isOwnerOrSA.value && found.value.status === TRAVEL_STATUS.SUBMITTED)

const showDeleteConfirm = ref(false)
const deleteSaving = ref(false)
async function deleteRequest() {
  deleteSaving.value = true
  try {
    await api(`/travel-requests/${(detail.value as any).id}`, { method: 'DELETE' })
    showDeleteConfirm.value = false
    toast.show(`Pengajuan ${displayId.value} dihapus.`)
    await navigateTo('/admin/travel-requests')
  } catch (e: any) {
    // 409 bila masih punya approval/uang muka/reimbursement/dokumen.
    toast.show(e?.data?.message || 'Gagal menghapus pengajuan.', 'error', 'error')
  } finally {
    deleteSaving.value = false
  }
}
async function cancelOwnRequest() {
  try {
    await api(`/travel-requests/${(detail.value as any).id}`, { method: 'PUT', body: { status: TRAVEL_STATUS.CANCELLED } })
    toast.show(`Pengajuan ${displayId.value} dibatalkan.`)
    await refreshNuxtData(`tr-detail-${idParam.value}`)
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal membatalkan pengajuan.', 'error', 'error')
  }
}

const docForm = reactive({ title: '', type: 'tiket' })
const docFile = ref<File | null>(null)
const docSaving = ref(false)
function onDocFile(e: Event) {
  docFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}
async function uploadDoc() {
  if (!docForm.title.trim()) {
    toast.show('Judul dokumen wajib diisi.', 'info', 'info')
    return
  }
  docSaving.value = true
  try {
    const form = new FormData()
    form.append('travel_request_id', String((detail.value as any).id))
    form.append('title', docForm.title.trim())
    form.append('type', docForm.type)
    if (docFile.value) form.append('file', docFile.value)
    await api('/travel-documents', { method: 'POST', body: form })
    docForm.title = ''
    docFile.value = null
    toast.show('Dokumen berhasil diunggah.')
    await refreshNuxtData(`tr-detail-${idParam.value}`)
  } catch {
    toast.show('Gagal mengunggah dokumen.', 'error', 'error')
  } finally {
    docSaving.value = false
  }
}
import { mapTravelRequest } from '~/composables/useMappers'
import { useApi } from '~/composables/useApi'
import { POLICY_BADGE, QUEUE_STATUS, TRAVEL_STATUS } from '~/constants/domain'

const api = useApi()
const route = useRoute()
const idParam = computed(() => String(route.params.id).replace(/^#/, ''))
const displayId = computed(() => `#${idParam.value}`)

const { data: detail } = await useAsyncData(`tr-detail-${idParam.value}`, () =>
  api<any>(`/travel-requests/no/${idParam.value}`),
)
const toast = useToast()
if (!detail.value) toast.show(`Data ${displayId.value} tidak ditemukan.`, 'error', 'search_off')

const found = computed<TravelRequest>(() =>
  detail.value ? mapTravelRequest(detail.value) : ({
    id: displayId.value,
    employee: { id: '', name: '-', nik: '-', email: '', department: '-', costCenter: '', grade: '-', role: '-', manager: '-', avatar: '', status: 'Aktif' },
    project: '-', projectCode: '', route: '-', transport: '-', startDate: '-', endDate: '-', duration: '-',
    cost: 0, costLabel: '-', status: 'Draft', createdAt: '-',
  } as TravelRequest),
)
const approvals = computed<any[]>(() => detail.value?.approvals ?? [])

const CHAIN_TITLES: Record<string, string> = {
  '1': 'Line Manager', '2': 'Head of Dept', '3': 'Finance & Treasury', '4': 'CFO', 'Auto': 'Ticketing & Cash',
}
function fmtDateTime(v: any): string {
  if (!v) return '-'
  try {
    return new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return String(v) }
}
const chainSteps = computed(() => {
  const rows = [...approvals.value].sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
  return rows.map((q: any, i: number) => {
    const auto = q.level === 'Auto'
    const lvl = auto ? 'Auto' : String(q.level ?? '').split(' ')[0]
    const decided = q.decided_by
    const onBehalf = q.on_behalf_of
    const approver = q.approver
    return {
      id: q.id,
      stepNo: String(i + 1).padStart(2, '0'),
      title: auto ? 'Ticketing & Cash' : (CHAIN_TITLES[lvl] ?? `Level ${lvl}`),
      subtitle: auto ? 'Travel Desk' : (decided?.name ?? approver?.name ?? '-'),
      status: q.status ?? QUEUE_STATUS.PENDING,
      note: q.note ?? '',
      when: fmtDateTime(q.decided_at),
      onBehalfName: onBehalf?.name ?? '',
      levelLabel: auto ? 'Otomatis' : q.level,
    }
  })
})
const chainDone = computed(() => chainSteps.value.filter(s => s.status === QUEUE_STATUS.APPROVED || s.status === QUEUE_STATUS.REJECTED).length)
// Sisa SLA dari baris antrean yang sedang pending (sla_due_at dihitung backend
// saat level diaktifkan). Tidak ada baris pending = tidak ada SLA berjalan.
const pendingSla = computed(() => {
  const p = approvals.value.find((q: any) => q.status === QUEUE_STATUS.PENDING && q.sla_due_at)
  if (!p) return null
  const ms = new Date(p.sla_due_at).getTime() - Date.now()
  if (ms <= 0) return 'Terlewati'
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} Menit Tersisa`
  if (h < 48) return `${h} Jam Tersisa`
  return `${Math.floor(h / 24)} Hari Tersisa`
})
const isUrgent = computed(() => approvals.value.some((q: any) => q.urgent))
const documents = computed<any[]>(() => detail.value?.documents ?? [])
const advances = computed<any[]>(() => detail.value?.advances ?? [])
const reimbursements = computed<any[]>(() => detail.value?.reimbursements ?? [])
const firstAdvance = computed(() => advances.value[0])

const activeTab = ref<'biaya' | 'dokumen' | 'reimbursement' | 'audit'>('biaya')
const note = ref('')
const showModal = ref<null | 'approve' | 'reject' | 'revision'>(null)
const modalNote = ref('')

function printSummary() {
  if (import.meta.client) window.print()
}

const showEdit = ref(false)
const editForm = reactive({ route: '', transport: '', cost: '' as string | number, purpose: '' })
const editSaving = ref(false)

function openEditTravel() {
  const d: any = detail.value ?? {}
  editForm.route = d.route ?? ''
  editForm.transport = d.transport ?? ''
  editForm.cost = d.cost ?? ''
editForm.purpose = d.purpose ?? ''
showEdit.value = true
}

async function saveEditTravel() {
  editSaving.value = true
  try {
    await api(`/travel-requests/${(detail.value as any).id}`, {
      method: 'PUT',
      body: {
        route: editForm.route || undefined,
        transport: editForm.transport || undefined,
        cost: editForm.cost !== '' ? Number(editForm.cost) : undefined,
        purpose: editForm.purpose || undefined,
      },
    })
    showEdit.value = false
    toast.show(`Pengajuan ${displayId.value} berhasil diperbarui.`)
    await refreshNuxtData(`tr-detail-${idParam.value}`)
  } catch {
    toast.show('Gagal memperbarui pengajuan.', 'error', 'error')
  } finally {
    editSaving.value = false
  }
}

function switchTab(t: typeof activeTab.value) { activeTab.value = t }
function openModal(type: 'approve' | 'reject' | 'revision') { modalNote.value = note.value; showModal.value = type }
/**
 * Baris antrean yang MENJADI GILIRAN SAYA. Bukan sekadar baris pending
 * pertama — dulu ini mengirim approve ke baris approver lain (403).
 * can_decide dihitung backend (ApprovalChain::eligibility).
 */
function myPendingRow(): any | undefined { return approvals.value.find((a: any) => a.can_decide === true) }
function otherPendingRow(): any | undefined {
  return approvals.value.find((a: any) => a.status === QUEUE_STATUS.PENDING && a.can_decide !== true)
}
function pendingApproval() { return myPendingRow() }
async function confirmModal() {
  const t = showModal.value
  const text = modalNote.value || note.value
  // Penolakan wajib alasan (backend 422 bila kosong) — modal tetap terbuka.
  if (t === 'reject' && text.trim().length < 3) {
    toast.show('Alasan penolakan wajib diisi (minimal 3 karakter).', 'error', 'error')
    return
  }
  showModal.value = null
  try {
    if (t === 'approve' || t === 'reject') {
      const queue = pendingApproval()
      if (queue) {
        const res = await api<{ message: string }>(`/approval-queue/${queue.id}/decide`, {
          method: 'POST', body: { action: t === 'approve' ? 'approve' : 'reject', note: text || undefined },
        })
        toast.show(res.message)
      } else {
        // Tidak ada jalur bypass: TravelRequestController:117 menyatakan perubahan
        // status hanya lewat /approval-queue/{id}/decide, dan update() hanya
        // mengizinkan pemilik atau Super Admin (itu pula sebabnya penulisan
        // status langsung di sini akan selalu 403 untuk approver).
        toast.show('Tidak ada tahap approval yang menunggu pada pengajuan ini.', 'info', 'info')
        return
      }
    } else {
      await api('/notifications', {
        method: 'POST',
        body: {
          user_id: (detail.value as any).user_id, title: `Revisi diperlukan untuk ${displayId.value}`,
          message: text || 'Mohon perbaiki dokumen pengajuan Anda.', type: 'Approval', category: 'approval', reference_id: displayId.value,
        },
      })
      toast.show(`Instruksi revisi untuk ${displayId.value} dikirim.`, 'info', 'history')
    }
    await refreshNuxtData(`tr-detail-${idParam.value}`)
  } catch (e: any) {
    // ApprovalChain:159-167 melempar 403 (bukan approver yang sah / level tidak
    // cocok) dan 409 (sudah diputus) — tampilkan alasan sebenarnya.
    toast.show(e?.data?.message || 'Gagal memproses keputusan. Coba lagi.', 'error', 'error')
  } finally {
    note.value = ''
    modalNote.value = ''
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-6">
    <!-- Breadcrumb & SLA — clean -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
      <nav class="flex items-center gap-1.5 text-muted text-xs" aria-label="Breadcrumb">
        <NuxtLink to="/admin/travel-requests" class="hover:text-primary transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">flight_takeoff</span><span>Travel Requests</span></NuxtLink>
        <span class="opacity-40">/</span>
        <span class="text-sm font-semibold text-on-surface">{{ displayId }}</span>
        <span class="opacity-40">/</span>
        <span class="text-secondary text-xs bg-secondary-container/60 px-2 py-0.5 rounded-full font-semibold">Detail Perjalanan</span>
      </nav>
      <div v-if="pendingSla" class="flex items-center gap-2 self-start md:self-auto bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
        <span class="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span class="text-xs text-amber-900">SLA Review: <strong>{{ pendingSla }}</strong></span>
      </div>
    </div>

    <!-- Status Header Banner — clean card with BaseButton -->
    <BaseCard padding="p-6" class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-4">
        <div class="w-14 h-14 rounded-xl bg-secondary-container/40 text-secondary flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[32px]">assignment_turned_in</span></div>
        <div class="flex flex-col">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-xl font-bold tracking-tight">Permohonan {{ displayId }}</h1>
            <span :class="statusBadgeClass(found.status)" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"><span class="w-2 h-2 rounded-full bg-current" /> {{ found.status.toUpperCase() }}</span>
            <span v-if="found.policyStatus && found.policyStatus !== found.status" :class="String(found.policyStatus).includes(POLICY_BADGE.DEV_PREFIX) ? 'text-xs text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold' : 'text-xs text-muted bg-surface-container-low px-2.5 py-0.5 rounded-full'">{{ found.policyStatus }}</span>
            <span class="bg-surface-container-low text-muted text-xs px-2.5 py-0.5 rounded-full">Prioritas: {{ isUrgent ? 'Tinggi' : 'Normal' }}</span>
          </div>
          <p class="text-sm text-muted mt-1">Diajukan {{ found.createdAt }} • Proyek: <span class="text-on-surface font-medium">{{ found.project }}</span></p>
        </div>
      </div>
      <div class="flex items-center flex-wrap gap-2">
        <BaseButton variant="outline" icon="download" @click="printSummary">Unduh PDF</BaseButton>
        <BaseButton v-if="isOwnerOrSA" variant="secondary" icon="edit_document" @click="openEditTravel">Ubah</BaseButton>
        <!-- Tolak via jalur decide (approver); pemohon memakai Batalkan Pengajuan di bawah -->
        <BaseButton v-if="myPendingRow()" variant="danger" icon="cancel" @click="openModal('reject')">Tolak</BaseButton>
        <BaseButton v-if="canCancelOwn" variant="danger" icon="cancel" @click="cancelOwnRequest">Batalkan Pengajuan</BaseButton>
        <BaseButton v-if="isOwnerOrSA" variant="danger" icon="delete" @click="showDeleteConfirm = true">Hapus</BaseButton>
      </div>
    </BaseCard>

    <!-- Bento: Pemohon & Itinerary -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <BaseCard padding="p-6" class="lg:col-span-5 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-2">
            <span class="text-[11px] font-semibold text-muted tracking-wider uppercase">Informasi Pemohon</span>
            <span class="text-xs text-primary font-semibold bg-primary-fixed/30 px-2 py-0.5 rounded-full">Verified</span>
          </div>
          <div class="flex items-center gap-4 mt-2">
            <div class="relative shrink-0">
              <img :src="found.employee.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAoXSJjQkFwuWLJPgRs2C2paiIpxgIAmS9mt_1kqM7knc7OWcomY_g1nc3j61n-oAfB0m0X827ZKVi0_Lfvngg2i7kBpHTlD4uHiu1wR1ezk7PA0NVzYYEc0ve3r-YU2dRttpP7M0geX1Q764RGc3hNH-vHDPSQ1SAOBK-4gwU_pCd86jSAU21brb9Pli-YilzEkkBl9S_NGx1UJASqmDwI0ftbebOACtqWwxu35JDLT05bFL3-gWY2AQ'" :alt="`Foto ${found.employee.name}`" class="w-20 h-20 rounded-full object-cover shadow-sm" loading="lazy" width="80" height="80" decoding="async">
              <div class="absolute bottom-0 right-0 w-6 h-6 bg-primary-container text-[#003e0f] rounded-full flex items-center justify-center"><span class="material-symbols-outlined text-[14px]">shield</span></div>
            </div>
            <div class="flex flex-col min-w-0">
              <h2 class="text-lg font-bold truncate">{{ found.employee.name }}</h2>
              <p class="text-sm text-secondary">NIK: {{ found.employee.nik }}</p>
              <p class="text-xs text-muted truncate">{{ found.employee.role }}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-6 pt-4 bg-surface-container-low/70 p-4 rounded-xl">
            <div><span class="text-xs text-muted block">Departemen</span><span class="text-sm font-medium mt-0.5 block">{{ found.employee.department }}</span></div>
            <div><span class="text-xs text-muted block">Cost Center</span><span class="text-sm font-medium mt-0.5 block">{{ found.employee.costCenter }}</span></div>
            <div class="col-span-2 pt-1"><span class="text-xs text-muted block">Atasan Langsung</span><div class="flex items-center gap-2 mt-1"><span class="material-symbols-outlined text-secondary text-[18px]">account_circle</span><span class="text-sm font-medium">{{ found.employee.manager }}</span></div></div>
          </div>
        </div>
        <div class="mt-4 pt-2 flex items-center justify-between text-xs text-muted">
          <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">schedule</span> Durasi: {{ found.duration }}</span>
          <span class="text-xs text-secondary font-semibold">Estimasi: {{ found.costLabel }}</span>
        </div>
      </BaseCard>
      <BaseCard padding="p-6" class="lg:col-span-7 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-2">
            <span class="text-[11px] font-semibold text-muted tracking-wider uppercase">Rencana Itinerary &amp; Tujuan</span>
            <span class="text-xs text-on-surface bg-surface-container px-2.5 py-0.5 rounded-full font-medium">{{ found.projectCode || 'Tanpa Kode Proyek' }}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div class="bg-surface-container-low p-4 rounded-xl flex flex-col justify-between">
              <span class="text-[11px] font-semibold text-muted uppercase tracking-wider">Rute</span>
              <div class="my-2"><p class="text-lg font-bold">{{ found.route }}</p><p class="text-xs text-muted">{{ found.startDate }} — {{ found.endDate }}</p></div>
              <span class="text-xs text-secondary bg-white px-2 py-0.5 rounded-full self-start font-semibold">{{ found.duration }}</span>
            </div>
            <div class="bg-surface-container-low p-4 rounded-xl flex flex-col justify-between">
              <span class="text-[11px] font-semibold text-muted uppercase tracking-wider">Moda</span>
              <div class="my-2"><p class="text-sm font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-primary text-[18px]">flight</span> {{ found.transport }}</p><p class="text-xs text-muted">Sesuai isian pengajuan</p></div>
              <span class="text-xs text-muted">Tiket diterbitkan travel desk</span>
            </div>
            <div class="bg-surface-container-low p-4 rounded-xl flex flex-col justify-between">
              <span class="text-[11px] font-semibold text-muted uppercase tracking-wider">Estimasi Biaya</span>
              <div class="my-2"><p class="text-lg font-bold text-primary">{{ found.costLabel }}</p><p class="text-xs text-muted">Total estimasi diajukan</p></div>
              <span v-if="found.policyStatus" class="text-xs text-secondary bg-white px-2 py-0.5 rounded-full self-start font-semibold">{{ found.policyStatus }}</span>
              <span v-if="found.policyCode" class="text-[11px] text-muted">Policy: {{ found.policyCode }}</span>
            </div>
          </div>
          <div class="mt-4 bg-surface-container p-4 rounded-xl">
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-primary text-[22px] mt-0.5">verified_user</span>
              <div><span class="text-sm font-semibold block">Tujuan &amp; Keperluan:</span><p class="text-sm text-[#3e4a3c] mt-0.5">{{ (found as any).purpose || '—' }}</p></div>
            </div>
          </div>
        </div>
        <div class="mt-4 pt-2 flex flex-wrap items-center justify-between text-xs gap-2">
          <div class="flex items-center gap-2 text-muted"><span class="material-symbols-outlined text-[16px]">calendar_month</span><span>Jadwal: <strong class="text-on-surface">{{ found.startDate }} — {{ found.endDate }}</strong></span></div>
          <div class="flex items-center gap-2 text-muted"><span class="material-symbols-outlined text-[16px]">domain</span><span>Proyek: {{ found.project }}</span></div>
        </div>
      </BaseCard>
    </div>

    <!-- Stepper — cleaner -->
    <BaseCard padding="p-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div><h2 class="text-base font-bold">Tahapan Persetujuan Berjenjang</h2><p class="text-xs text-muted">Alur otorisasi multi-layer sesuai Master Policy Tier-1</p></div>
        <div class="flex items-center gap-2 bg-secondary-container/40 px-3 py-1 rounded-full self-start"><span class="material-symbols-outlined text-[18px] text-secondary">sync</span><span class="text-xs text-secondary font-semibold">Progres: {{ chainSteps.length ? `${chainDone}/${chainSteps.length}` : '0/0' }}</span></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div class="flex flex-col bg-surface-container-low/60 rounded-xl p-4">
          <div class="flex items-center justify-between mb-1"><span class="w-8 h-8 rounded-full bg-primary-container text-[#003e0f] flex items-center justify-center shadow-sm"><span class="material-symbols-outlined text-[18px]">check</span></span><span class="text-xs text-secondary font-bold">STEP 01</span></div>
          <span class="text-sm font-semibold mt-1">Pengajuan Dibuat</span><span class="text-xs text-muted">{{ found.employee.name }}</span><div class="mt-2 pt-1 text-[11px] text-muted">{{ found.createdAt }}</div>
        </div>
        <div
          v-for="s in chainSteps" :key="s.id"
          class="flex flex-col rounded-xl p-4 relative overflow-hidden"
          :class="s.status === QUEUE_STATUS.PENDING
            ? 'bg-amber-50/70 border border-amber-200'
            : s.status === QUEUE_STATUS.REJECTED
              ? 'bg-error-container/40 border border-error/30'
              : s.status === QUEUE_STATUS.APPROVED
                ? 'bg-surface-container-low/60'
                : 'bg-surface-container-low/30 opacity-60'"
        >
          <div v-if="s.status === QUEUE_STATUS.PENDING" class="absolute top-0 right-0 w-12 h-12 bg-amber-200/40 rounded-bl-full pointer-events-none" />
          <div class="flex items-center justify-between mb-1">
            <span
              class="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
              :class="s.status === QUEUE_STATUS.APPROVED
                ? 'bg-primary-container text-[#003e0f]'
                : s.status === QUEUE_STATUS.REJECTED
                  ? 'bg-error text-white'
                  : s.status === QUEUE_STATUS.PENDING
                    ? 'bg-amber-500 text-white'
                    : 'bg-surface-container text-muted'"
            ><span class="material-symbols-outlined text-[18px]">{{ s.status === QUEUE_STATUS.APPROVED ? 'check' : s.status === QUEUE_STATUS.REJECTED ? 'close' : s.status === QUEUE_STATUS.PENDING ? 'hourglass_top' : 'radio_button_unchecked' }}</span></span>
            <span
              class="text-xs font-bold"
              :class="s.status === QUEUE_STATUS.PENDING ? 'text-amber-800' : s.status === QUEUE_STATUS.APPROVED ? 'text-secondary' : s.status === QUEUE_STATUS.REJECTED ? 'text-error' : 'text-muted'"
            >{{ s.status === QUEUE_STATUS.PENDING ? 'AKTIF' : `STEP ${s.stepNo}` }}</span>
          </div>
          <span class="text-sm font-semibold mt-1" :class="(s.status === QUEUE_STATUS.QUEUED || s.status === QUEUE_STATUS.CANCELLED) ? 'text-muted' : s.status === QUEUE_STATUS.PENDING ? 'text-amber-950' : ''">{{ s.title }}</span>
          <span class="text-xs" :class="s.status === QUEUE_STATUS.PENDING ? 'text-amber-900' : 'text-muted'">{{ s.subtitle }}</span>
          <div v-if="s.status === QUEUE_STATUS.APPROVED || s.status === QUEUE_STATUS.REJECTED" class="mt-2 pt-1 text-[11px] bg-white/80 p-1.5 rounded-lg">
            <span class="font-semibold block" :class="s.status === QUEUE_STATUS.APPROVED ? 'text-secondary' : 'text-error'">{{ s.status === QUEUE_STATUS.APPROVED ? 'Approved' : 'Rejected' }} • {{ s.when }}</span>
            <span v-if="s.onBehalfName" class="italic">Plt a/n {{ s.onBehalfName }}</span>
            <span v-if="s.note" class="italic block">"{{ s.note }}"</span>
          </div>
          <div v-else-if="s.status === QUEUE_STATUS.PENDING" class="mt-2 pt-1 text-[11px] bg-white/80 p-1.5 rounded-lg text-amber-900">{{ s.levelLabel === 'Otomatis' ? 'Diproses otomatis oleh sistem' : `Menunggu keputusan (${s.levelLabel})` }}</div>
          <div v-else class="mt-2 pt-1 text-[11px] text-muted">{{ s.status === QUEUE_STATUS.CANCELLED ? 'Dibatalkan (rantai dihentikan)' : `Menunggu giliran (${s.levelLabel})` }}</div>
        </div>
        <div v-if="!chainSteps.length" class="flex flex-col bg-surface-container-low/30 rounded-xl p-4 opacity-60">
          <span class="text-sm text-muted">Belum ada tahapan antrean.</span>
        </div>
      </div>
    </BaseCard>

    <!-- Tabs — clean underline -->
    <BaseCard padding="p-0">
      <div class="px-6 pt-4 bg-surface-container-low/40 flex items-center gap-2 overflow-x-auto border-b border-surface-container-low">
        <button :class="activeTab==='biaya' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-on-surface border-b-2 border-transparent'" class="pb-3 px-4 text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors" @click="switchTab('biaya')"><span class="material-symbols-outlined text-[20px]">payments</span>Rincian Biaya</button>
        <button :class="activeTab==='dokumen' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-on-surface border-b-2 border-transparent'" class="pb-3 px-4 text-sm font-semibold flex items-center gap-2 shrink-0" @click="switchTab('dokumen')"><span class="material-symbols-outlined text-[20px]">attach_file</span>Dokumen <span class="w-5 h-5 rounded-full bg-surface-container text-on-surface text-xs flex items-center justify-center">{{ documents.length }}</span></button>
        <button :class="activeTab==='reimbursement' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-on-surface border-b-2 border-transparent'" class="pb-3 px-4 text-sm font-semibold flex items-center gap-2 shrink-0" @click="switchTab('reimbursement')"><span class="material-symbols-outlined text-[20px]">receipt_long</span>Reimbursement</button>
        <button :class="activeTab==='audit' ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-on-surface border-b-2 border-transparent'" class="pb-3 px-4 text-sm font-semibold flex items-center gap-2 shrink-0" @click="switchTab('audit')"><span class="material-symbols-outlined text-[20px]">history_edu</span>Audit Log</button>
      </div>
      <div v-if="activeTab==='biaya'" class="p-6 space-y-6">
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div class="xl:col-span-8 flex flex-col">
            <div class="flex items-center justify-between mb-2"><h3 class="text-base font-bold">Tabel Estimasi Biaya</h3><span class="text-xs text-muted">IDR</span></div>
            <div class="overflow-x-auto rounded-xl border border-surface-container-low">
              <table class="w-full text-left">
                <thead><tr class="bg-surface-container-low text-muted text-[11px] font-semibold uppercase tracking-wider"><th class="py-3 px-4">Komponen</th><th class="py-3 px-4">Rate</th><th class="py-3 px-4">Regulasi</th><th class="py-3 px-4 text-right">Subtotal</th></tr></thead>
                <tbody class="text-sm divide-y divide-surface-container-low/50">
                  <!-- Rincian per komponen belum dicatat di pengajuan — yang
                    tersimpan hanya total estimasi. Jangan tampilkan angka contoh. -->
                  <tr class="hover:bg-surface-container-low/40"><td class="py-3 px-4 font-medium flex items-center gap-2"><span class="material-symbols-outlined text-primary text-[18px]">payments</span> Estimasi Total Perjalanan</td><td class="py-3 px-4 text-muted">{{ found.route }}</td><td class="py-3 px-4"><span v-if="found.policyStatus" class="bg-secondary-container/50 text-secondary text-xs px-2 py-0.5 rounded-full font-semibold">{{ found.policyStatus }}</span><span v-else class="bg-surface-container text-muted text-xs px-2 py-0.5 rounded-full">Tanpa badge policy</span></td><td class="py-3 px-4 text-right font-semibold">{{ found.costLabel }}</td></tr>
                </tbody>
                <tfoot><tr class="bg-surface-container text-sm font-bold"><td class="py-3 px-4" colspan="3">Total Anggaran Diajukan</td><td class="py-3 px-4 text-right text-primary text-lg">{{ found.costLabel }}</td></tr></tfoot>
              </table>
            </div>
          </div>
          <div class="xl:col-span-4 flex flex-col gap-4">
            <div class="bg-surface-container-low p-6 rounded-xl flex flex-col justify-between h-full">
              <div>
                <div class="flex items-center justify-between pb-2"><span class="text-[11px] font-semibold text-muted uppercase tracking-wider">Uang Muka</span><span :class="firstAdvance ? 'bg-secondary-container/60 text-secondary' : 'bg-surface-container text-muted'" class="text-xs px-2.5 py-0.5 rounded-full font-bold">{{ firstAdvance ? firstAdvance.status : 'Belum Diajukan' }}</span></div>
                <div v-if="firstAdvance" class="mt-4"><span class="text-xs text-muted block">Nominal {{ firstAdvance.request_no }}</span><span class="text-3xl font-bold leading-tight block mt-1">{{ formatRp(Number(firstAdvance.amount ?? 0)) }}</span><p class="text-xs text-muted mt-1">{{ firstAdvance.purpose || 'Uang muka perjalanan dinas.' }}</p></div>
                <div v-else class="mt-4"><span class="text-xs text-muted block">Nominal Diajukan</span><span class="text-3xl font-bold leading-tight block mt-1">—</span><p class="text-xs text-muted mt-1">Belum ada pengajuan uang muka untuk perjalanan ini.</p></div>
                <div v-if="firstAdvance" class="mt-4 bg-white p-4 rounded-xl space-y-2"><span class="text-[11px] font-semibold text-muted uppercase tracking-wider block">Rekening Tujuan</span><div class="flex items-center gap-2"><div class="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary font-bold"><span class="material-symbols-outlined text-[20px]">account_balance</span></div><div><span class="text-sm font-medium block">{{ firstAdvance.account || '—' }}</span><span class="text-xs text-muted font-mono">a/n {{ firstAdvance.account_name || found.employee.name }}</span></div></div></div>
              </div>
              <div class="mt-6 pt-2 bg-surface-container p-3 rounded-lg flex items-center gap-2"><span class="material-symbols-outlined text-secondary text-[18px]">info</span><span class="text-xs">Laporan max 7 hari kerja setelah kepulangan.</span></div>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab==='dokumen'" class="p-6">
        <form v-if="canUploadDoc" class="mb-4 p-4 rounded-xl bg-surface-container-low grid grid-cols-1 md:grid-cols-12 gap-2 items-end" @submit.prevent="uploadDoc">
          <div class="md:col-span-4 space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted" for="docTitle">Judul Dokumen</label>
            <input id="docTitle" v-model="docForm.title" required type="text" aria-label="Judul dokumen" class="w-full px-4 py-2 rounded-xl bg-white text-sm focus:outline-none" placeholder="Contoh: E-ticket CGK-SUB">
          </div>
          <div class="md:col-span-3 space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted" for="docType">Tipe</label>
            <select id="docType" v-model="docForm.type" aria-label="Tipe dokumen" class="w-full px-4 py-2 rounded-xl bg-white text-sm focus:outline-none cursor-pointer">
              <option value="tiket">Tiket</option>
              <option value="hotel">Hotel</option>
              <option value="nota">Nota/Kuitansi</option>
              <option value="pendukung">Pendukung</option>
            </select>
          </div>
          <div class="md:col-span-3 space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted" for="docFile">Berkas (maks 10MB)</label>
            <input id="docFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" aria-label="Berkas dokumen" class="w-full text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-white file:text-xs" @change="onDocFile">
          </div>
          <div class="md:col-span-2">
            <BaseButton variant="primary" size="sm" type="submit" icon="upload" :disabled="docSaving" class="w-full">{{ docSaving ? 'Mengunggah...' : 'Unggah' }}</BaseButton>
          </div>
        </form>
        <EmptyState v-if="documents.length === 0" icon="description" title="Belum ada dokumen" message="Belum ada berkas pendukung untuk pengajuan ini." />
        <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div v-for="doc in documents" :key="doc.id" class="bg-surface-container-low p-4 rounded-xl flex flex-col justify-between hover:bg-surface-container transition-colors">
            <div><div class="flex items-center justify-between mb-2"><span class="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center"><span class="material-symbols-outlined text-[24px]">description</span></span><span class="bg-white text-muted text-xs px-2 py-0.5 rounded-full font-mono">{{ doc.type }}</span></div><h4 class="text-sm font-semibold truncate">{{ doc.title }}</h4><p class="text-xs text-muted mt-0.5">OCR: {{ doc.ocr_status || '-' }}</p></div>
            <div class="flex items-center gap-2 mt-4 pt-2"><a v-if="doc.file_url" :href="docHref(doc.file_url)" target="_blank" rel="noopener"><BaseButton variant="outline" size="sm" class="flex-1" icon="visibility">Preview</BaseButton></a></div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab==='reimbursement'" class="p-6 space-y-3">
        <EmptyState v-if="reimbursements.length === 0 && advances.length === 0" icon="pending_actions" title="Fase Pengeluaran Belum Dibuka" :message="`Karyawan dapat mengunggah nota setelah perjalanan (${found.startDate}).`" />
        <div v-for="a in advances" :key="`adv-${a.id}`" class="bg-surface-container-low p-4 rounded-xl flex items-center justify-between">
          <div><span class="text-sm font-semibold">Uang Muka {{ a.request_no }}</span><p class="text-xs text-muted">{{ a.purpose }} • {{ a.status }}</p></div>
          <span class="text-sm font-bold">{{ formatRp(Number(a.amount)) }}</span>
        </div>
        <div v-for="r in reimbursements" :key="`reim-${r.id}`" class="bg-surface-container-low p-4 rounded-xl flex items-center justify-between">
          <div><span class="text-sm font-semibold">Reimbursement {{ r.request_no }}</span><p class="text-xs text-muted">{{ r.reconciliation }} • {{ r.status }}</p></div>
          <span class="text-sm font-bold">{{ formatRp(Number(r.actual_expense)) }}</span>
        </div>
      </div>
      <div v-else class="p-6 space-y-3">
        <EmptyState v-if="approvals.length === 0" icon="history_edu" title="Belum ada jejak approval" message="Riwayat keputusan akan tercatat di sini." />
        <div v-for="a in approvals" :key="a.id" class="flex items-start gap-4">
          <div class="w-8 h-8 rounded-full bg-primary-container text-[#003e0f] flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[18px]">done_all</span></div>
          <div class="bg-surface-container-low p-4 rounded-xl flex-1"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><span class="text-sm font-semibold">{{ a.type }} — {{ a.level }} • {{ a.status }}</span><span class="text-xs text-muted">{{ a.updated_at }}</span></div><p class="text-xs text-muted mt-1">{{ a.justification }}</p></div>
        </div>
      </div>
    </BaseCard>

    <!-- Bottom Approver Action Panel — clean with BaseButton -->
    <BaseCard padding="p-6" class="border border-primary/10">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[28px]">rate_review</span></div>
          <div><h4 class="text-base font-bold">Tindakan Persetujuan</h4><p class="text-xs text-muted">Anda sebagai <strong class="text-on-surface">{{ useAppStore().userName }} ({{ useAppStore().userRole }})</strong>. Keputusan menentukan pencairan dana.</p></div>
        </div>
        <div class="flex-1 max-w-xl">
          <div class="relative">
            <input v-model="note" aria-label="Catatan persetujuan" class="w-full pl-4 pr-10 py-2.5 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 shadow-sm transition-all" placeholder="Catatan persetujuan / kode GL / alasan penolakan..." type="text">
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[18px]">edit_note</span>
          </div>
        </div>
        <div v-if="myPendingRow()" class="flex items-center flex-wrap gap-2 justify-end">
          <BaseButton variant="outline" icon="history" @click="openModal('revision')">Minta Revisi</BaseButton>
          <BaseButton variant="danger" icon="close" @click="openModal('reject')">Tolak</BaseButton>
          <BaseButton variant="primary" icon="check_circle" @click="openModal('approve')">Setujui</BaseButton>
        </div>
        <div v-else class="text-xs text-muted max-w-xl text-right">
          <template v-if="otherPendingRow()">
            <p class="font-semibold text-on-surface">Menunggu persetujuan {{ otherPendingRow()?.approver?.name || 'approver level berikutnya' }} ({{ otherPendingRow()?.level }}).</p>
            <p class="mt-0.5">Level Anda sudah diputuskan. Tombol hanya muncul pada approver yang sedang menjadi giliran.</p>
          </template>
          <p v-else-if="approvals.some((a: any) => a.decided_by_me)">Keputusan Anda sudah tercatat. Pengajuan sedang diproses tahap selanjutnya.</p>
          <p v-else>Hanya approver berwenang yang dapat memutus pengajuan ini.</p>
        </div>
      </div>
    </BaseCard>

    <!-- Confirm Modals — clean, not prompt() -->
    <AppConfirmModal :open="showModal==='approve'" title="Setujui Pengajuan?" :message="`Anda akan menyetujui ${displayId} dan meneruskan ke Travel Desk untuk pencairan.`" confirm-label="Ya, Setujui" icon="verified" @close="showModal=null" @confirm="confirmModal" />
    <AppConfirmModal :open="showModal==='reject'" title="Tolak Pengajuan?" message="Tulis alasan penolakan (akan terkirim ke pemohon)." variant="danger" confirm-label="Tolak Pengajuan" icon="block" @close="showModal=null" @confirm="confirmModal">
      <textarea v-model="modalNote" placeholder="Alasan penolakan..." rows="3" class="mt-3 w-full p-3 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-error/20" />
    </AppConfirmModal>
    <AppConfirmModal :open="showModal==='revision'" title="Minta Revisi?" message="Instruksi revisi akan dikirim ke pemohon." confirm-label="Kirim Revisi" icon="history" @close="showModal=null" @confirm="confirmModal">
      <textarea v-model="modalNote" placeholder="Tulis instruksi revisi..." rows="3" class="mt-3 w-full p-3 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" />
    </AppConfirmModal>
    <AppConfirmModal :open="showDeleteConfirm" title="Hapus Pengajuan?" message="Pengajuan yang masih punya approval, uang muka, reimbursement, atau dokumen tidak bisa dihapus (409)." variant="danger" confirm-label="Ya, Hapus" icon="delete" :loading="deleteSaving" @close="showDeleteConfirm = false" @confirm="deleteRequest" />
    <!-- Modal Ubah Pengajuan -->
    <div v-if="showEdit" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showEdit = false">
      <form class="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 flex flex-col space-y-4" @submit.prevent="saveEditTravel">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold">Ubah Pengajuan {{ displayId }}</h2>
          <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="showEdit = false"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Rute</label>
            <input v-model="editForm.route" type="text" aria-label="Rute" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" @blur="editForm.route = editForm.route.trim().replace(/\s+/g, ' ').toUpperCase()">
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Transport</label>
            <input v-model="editForm.transport" type="text" aria-label="Transport" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Estimasi Biaya (Rp)</label>
            <input v-model="editForm.cost" type="number" min="0" aria-label="Estimasi biaya" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white">
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wider text-muted">Durasi</label>
            <input :value="found?.duration ?? ''" type="text" readonly aria-readonly="true" aria-label="Durasi (otomatis dari tanggal)" class="w-full px-4 py-2 rounded-xl bg-surface-container text-muted text-sm cursor-not-allowed" placeholder="Otomatis dari tanggal">
            <p class="text-xs text-muted">Dihitung otomatis dari tanggal perjalanan.</p>
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wider text-muted">Keperluan</label>
          <textarea v-model="editForm.purpose" rows="3" aria-label="Keperluan" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white resize-none" />
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-sm" @click="showEdit = false">Batal</button>
          <button type="submit" :disabled="editSaving" class="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60">{{ editSaving ? 'Menyimpan...' : 'Simpan Perubahan' }}</button>
        </div>
      </form>
    </div>

    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
