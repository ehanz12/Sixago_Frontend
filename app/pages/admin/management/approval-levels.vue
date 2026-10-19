<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'

const api = useApi()
const toast = useToast()

// Kinerja SLA: rata-rata selisih decided_at - created_at dari riwayat putusan
// yang dimuat (maks 50). Bukan benchmark global — labelnya jujur.
const { data: slaSampleRes } = await useAsyncData('approval-sla-sample', () => api<LaravelPaginator<any>>('/approval-queue', { params: { status: 'approved,rejected', per_page: 50 } }))
const slaKpi = computed(() => {
  const items = paginatorMeta(slaSampleRes.value?.data ? slaSampleRes.value : []).items as any[]
  const decided = items.filter(d => d.decided_at && d.created_at)
  const avgHours = decided.length
    ? decided.reduce((s, d) => s + (new Date(d.decided_at).getTime() - new Date(d.created_at).getTime()) / 3600000, 0) / decided.length
    : null
  return { avgHours, sampleSize: decided.length }
})
const showToast = ref(false)
const toastText = ref({ title: 'Skema Berhasil Diperbarui', desc: 'Aturan alur bertingkat telah disinkronkan ke seluruh sistem cabang.' })
let toastTimer: ReturnType<typeof setTimeout> | null = null
function flashToast(title: string, desc: string) {
  toastText.value = { title, desc }
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (showToast.value = false), 3500)
}
const { data: settingsRes } = await useAsyncData('approval-settings', () => api<Record<string, boolean>>('/settings'))
const escalationOn = ref(true)
const delegationOn = ref(true)
watch(settingsRes, (s) => {
  if (!s) return
  escalationOn.value = s.escalation_enabled ?? true
  delegationOn.value = s.delegation_enabled ?? true
}, { immediate: true })

const savingConfig = ref(false)
async function saveConfig() {
  savingConfig.value = true
  try {
    await api('/settings', {
      method: 'PUT',
      body: { escalation_enabled: escalationOn.value, delegation_enabled: delegationOn.value },
    })
    flashToast('Konfigurasi Tersimpan', 'Aturan eskalasi & delegasi diterapkan ke seluruh sistem.')
    await refreshNuxtData('approval-settings')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menyimpan konfigurasi eskalasi & delegasi.', 'error', 'error')
  } finally {
    savingConfig.value = false
  }
}
function resetConfig() {
  escalationOn.value = true
  delegationOn.value = true
}

// Simulasi uji alur
const showSimulate = ref(false)
const simForm = reactive({ amount: '' as string | number, destination: '', has_advance: false })
const simResult = ref<string[] | null>(null)
const simSaving = ref(false)
async function runSimulate() {
  simSaving.value = true
  try {
    const res = await api<{ steps: string[] }>('/approval-simulate', {
      method: 'POST',
      body: { amount: Number(simForm.amount || 0), destination: simForm.destination || undefined, has_advance: simForm.has_advance },
    })
    simResult.value = res.steps
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menjalankan simulasi alur approval.', 'error', 'error')
  } finally {
    simSaving.value = false
  }
}

async function downloadAuditCsv() {
  try {
    const blob = await api<Blob>('/exports/audit-logs', { responseType: 'blob' as any })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit-logs.csv'
    a.click()
    URL.revokeObjectURL(url)
    flashToast('Log Audit Diunduh', 'File audit-logs.csv berhasil diunduh.')
  } catch (e: any) {
    toast.show('Gagal mengunduh log audit.', 'error', 'error')
  }
}

// Ubah tahap
const showStepModal = ref(false)
const stepForm = reactive({ id: 0 as number, title: '', role: '', trigger: '', sla: '' })
const stepSaving = ref(false)
function openStepEdit(s: Step & { _rawId: number }) {
  stepForm.id = s._rawId
  stepForm.title = s.title
  stepForm.role = s.author
  stepForm.trigger = s.trigger === '-' ? '' : s.trigger
  stepForm.sla = s.sla === '-' ? '' : s.sla
  showStepModal.value = true
}
async function saveStep() {
  stepSaving.value = true
  try {
    await api(`/approval-levels/${stepForm.id}`, {
      method: 'PUT',
      body: { title: stepForm.title || undefined, role: stepForm.role || undefined, trigger: stepForm.trigger || undefined, sla: stepForm.sla || undefined },
    })
    showStepModal.value = false
    flashToast('Tahap Diperbarui', 'Aturan tahap berhasil disimpan.')
    await refreshNuxtData('approval-schemes')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menyimpan aturan tahap approval.', 'error', 'error')
  } finally {
    stepSaving.value = false
  }
}

type Step = {
  step: number
  title: string
  badge: string
  badgeClass: string
  desc: string
  triggerIcon: string
  trigger: string
  authorIcon: string
  author: string
  sla: string
  locked?: boolean
}

const { data: schemesRes } = await useAsyncData('approval-schemes', () => api<any[]>('/approval-schemes'))

const schemes = computed(() =>
  (schemesRes.value ?? []).map((s: any) => ({
    _rawId: s.id,
    name: s.name,
    desc: s.description ?? '-',
    steps: `${s.levels?.length ?? 0} Tahapan Berjenjang`,
    active: !!s.is_active,
    icon: s.is_active ? 'check' : 'account_tree',
    color: s.is_active ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-[#EFF4FF]',
  })),
)

const activeScheme = computed(() => (schemesRes.value ?? []).find((s: any) => s.is_active) ?? schemesRes.value?.[0])

const steps = computed<Step[]>(() =>
  ((activeScheme.value?.levels ?? []) as any[]).map((l: any) => ({
    _rawId: l.id,
    step: l.step,
    title: l.title,
    badge: l.locked ? 'Automated Engine' : l.step === 1 ? 'Universal Entry' : 'Threshold Plafon',
    badgeClass: l.locked ? 'bg-primary text-white' : 'bg-secondary-container text-[#2e6f3c]',
    desc: l.trigger ?? l.title,
    triggerIcon: 'bolt',
    trigger: l.trigger ?? '-',
    authorIcon: 'person_check',
    author: l.role ?? '-',
    sla: l.sla ?? '-',
    locked: !!l.locked,
  })),
)

async function activateScheme(s: { _rawId: number; name: string }) {
  try {
    await api(`/approval-schemes/${s._rawId}/activate`, { method: 'POST' })
    flashToast('Skema Berhasil Diperbarui', `Skema ${s.name} kini menjadi alur aktif.`)
    await refreshNuxtData('approval-schemes')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal mengaktifkan skema alur approval.', 'error', 'error')
  }
}

async function duplicateStep(s: Step & { _rawId: number }) {
  if (!activeScheme.value) return
  try {
    await api('/approval-levels', {
      method: 'POST',
      body: {
        scheme_id: activeScheme.value.id, step: s.step + 1,
        title: `${s.title} (Salinan)`, role: s.author, trigger: s.trigger, sla: s.sla,
      },
    })
    flashToast('Tahap Berhasil Disalin', `Salinan ${s.title} ditambahkan ke alur.`)
    await refreshNuxtData('approval-schemes')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menyalin tahap approval.', 'error', 'error')
  }
}

async function deleteStep(s: Step & { _rawId: number }) {
  try {
    await api(`/approval-levels/${s._rawId}`, { method: 'DELETE' })
    flashToast('Tahap Dihapus', `${s.title} dihapus dari alur.`)
    await refreshNuxtData('approval-schemes')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menghapus tahap approval.', 'error', 'error')
  }
}

const showSchemeModal = ref(false)
const schemeForm = reactive({ name: '', description: '' })
const schemeSaving = ref(false)
async function createScheme() {
  schemeSaving.value = true
  try {
    await api('/approval-schemes', { method: 'POST', body: { name: schemeForm.name, description: schemeForm.description || undefined } })
    showSchemeModal.value = false
    schemeForm.name = ''
    schemeForm.description = ''
    flashToast('Skema Baru Dibuat', 'Skema alur approval berhasil ditambahkan.')
    await refreshNuxtData('approval-schemes')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal membuat skema alur approval.', 'error', 'error')
  } finally {
    schemeSaving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans">
    

    <!-- Header Canvas -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
      <div class="max-w-3xl">
        <div class="flex items-center gap-2 mb-1">
          <span class="p-1.5 rounded-full bg-[#E6EEFF] text-primary flex items-center justify-center">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">account_tree</span>
          </span>
          <span class="text-xs uppercase tracking-wider text-secondary font-bold">Policy Governance Matrix</span>
        </div>
        <h1 class="text-2xl lg:text-3xl font-bold tracking-tight leading-none text-on-surface mb-1">Konfigurasi Alur &amp; Hierarki Approval</h1>
        <p class="text-sm text-[#54615b]">Rancang aturan bertingkat (multi-tier workflow) otorisasi perjalanan dinas berdasarkan nilai anggaran, deviasi kebijakan, dan unit bisnis.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button aria-label="Simulasi uji alur otorisasi" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-secondary shadow-sm hover:bg-[#EFF4FF] transition-all text-sm font-medium active:scale-95" @click="showSimulate = true; simResult = null">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">play_circle</span>
          <span>Simulasi Uji Alur Otorisasi</span>
        </button>
        <button aria-label="Tambah skema alur approval" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-white shadow-md hover:bg-secondary transition-all text-sm font-semibold active:scale-95" @click="showSchemeModal = true">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add_task</span>
          <span>+ Tambah Skema Alur Approval</span>
        </button>
      </div>
    </div>

    <!-- Top Info Banner -->
    <div class="relative overflow-hidden rounded-xl bg-secondary-container/40 p-6 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shrink-0 shadow-sm">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">verified</span>
          </div>
          <div>
            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
              <span class="text-sm font-bold text-[#2e6f3c]">Skema Aktif: {{ activeScheme?.name ?? '—' }}</span>
              <span class="px-2 py-0.5 rounded-full bg-primary text-white text-xs">Live Engine</span>
            </div>
            <p class="text-xs text-[#3e4a3c] max-w-2xl">Perubahan urutan langkah akan langsung diterapkan pada pengajuan perjalanan dinas baru. Dokumen berjalan dalam antrean akan melanjutkan pipeline sesuai versi saat dibuat.</p>
          </div>
        </div>
        <div class="flex items-center gap-2 self-end sm:self-center">
          <button aria-label="Unduh log audit" class="px-4 py-1.5 rounded-full bg-white text-secondary text-xs font-medium hover:bg-[#EFF4FF] shadow-sm transition-all" @click="downloadAuditCsv">Unduh Log Audit (CSV)</button>
        </div>
      </div>
    </div>

    <!-- Scheme Switcher & Global Metrics Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div class="xl:col-span-8 flex flex-col justify-between rounded-xl bg-white p-6 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <span class="text-xs uppercase tracking-wider text-[#54615b]">Pilih Skema Pengesahan</span>
          <span class="text-xs text-[#54615b]">{{ schemes.length }} Skema Terdaftar</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            v-for="s in schemes"
            :key="s.name"
            :class="s.active ? 'bg-secondary-container text-[#2e6f3c] shadow-sm' : 'bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface'"
            class="p-4 rounded-xl cursor-pointer transition-all"
            role="button"
            tabindex="0"
            @click="activateScheme(s)"
            @keydown.enter="activateScheme(s)"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-semibold">{{ s.name }}</span>
              <span v-if="s.active" class="w-2.5 h-2.5 rounded-full bg-primary" aria-hidden="true" />
              <span v-else class="material-symbols-outlined text-[#54615b] text-[18px]" aria-hidden="true">{{ s.icon }}</span>
            </div>
            <p class="text-xs mb-3 line-clamp-1" :class="s.active ? 'text-[#3e4a3c]' : 'text-[#54615b]'">{{ s.desc }}</p>
            <div class="flex items-center justify-between text-xs">
              <span>{{ s.steps }}</span>
              <span :class="s.active ? 'bg-primary text-white' : s.color.includes('error') ? 'bg-error-container text-error' : 'bg-[#E6EEFF] text-[#54615b]'" class="px-1.5 py-0.5 rounded-full">{{ s.active ? 'Aktif' : s.name.includes('Dispensasi') ? 'Regulated' : s.name.includes('Internasional') ? 'Non-aktif' : 'Standby' }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="xl:col-span-4 flex flex-col justify-between rounded-xl bg-white p-6 shadow-sm">
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs uppercase tracking-wider text-[#54615b]">Kinerja SLA Approval</span>
            <span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">speed</span>
          </div>
          <div class="flex items-baseline gap-1 mb-1">
            <span class="text-3xl font-bold text-on-surface">{{ slaKpi.avgHours === null ? '—' : slaKpi.avgHours.toFixed(1) }}</span>
            <span class="text-sm text-[#54615b]">Jam Rata-rata</span>
          </div>
          <p class="text-xs text-[#54615b] mb-4">{{ slaKpi.sampleSize === 0 ? 'Belum ada riwayat putusan untuk dihitung.' : `Rata-rata selisih putus vs dibuat dari ${slaKpi.sampleSize} riwayat terakhir.` }}</p>
          <div class="space-y-1">
            <div class="flex justify-between text-xs text-[#54615b]"><span>Sumber data</span><span class="font-bold text-primary">Riwayat antrean dimuat</span></div>
            <div class="flex items-center gap-3 pt-1 text-xs text-[#54615b]">
              <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-primary" aria-hidden="true" /> decided_at − created_at</span>
            </div>
          </div>
        </div>
        <div class="pt-4 flex items-center justify-between bg-[#EFF4FF] px-3 py-2 rounded-lg mt-4">
          <span class="text-xs text-on-surface">Riwayat Dianalisis</span>
          <span class="text-sm font-semibold text-secondary">{{ slaKpi.sampleSize }} Putusan</span>
        </div>
      </div>
    </div>

    <!-- Main Workflow Builder Canvas -->
    <div class="rounded-xl bg-white p-6 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-[#EFF4FF]">
        <div>
          <h2 class="text-base font-bold text-on-surface">Visual Step-by-Step Hierarchy Builder</h2>
          <p class="text-xs text-[#54615b]">Urutan eksekusi sekuensial tahap approval pada skema aktif.</p>
        </div>
      </div>

      <div class="relative flex flex-col gap-2">
        <template v-for="(s, idx) in steps" :key="s.step">
          <div class="relative group">
            <div :class="s.locked ? 'bg-secondary-container/20' : 'bg-[#EFF4FF] hover:bg-[#E6EEFF]/70'" class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl shadow-sm transition-all">
              <div class="flex items-start gap-3 min-w-0">
                <div class="flex items-center gap-1 shrink-0 self-center">
                  <!-- drag-and-drop belum ada: hanya ikon gembok untuk tahap terkunci -->
                  <span v-if="s.locked" class="material-symbols-outlined text-[#6d7b6a]/60 text-[22px]" aria-hidden="true">lock</span>
                  <div :class="s.locked ? 'bg-primary text-white' : 'bg-white text-secondary shadow-sm'" class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold">{{ s.step }}</div>
                </div>
                <div class="space-y-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-bold text-on-surface">{{ s.title }}</span>
                    <span :class="s.badgeClass" class="px-2 py-0.5 rounded-full text-xs font-medium">{{ s.badge }}</span>
                  </div>
                  <p class="text-sm text-[#54615b]">{{ s.desc }}</p>
                  <div class="flex flex-wrap items-center gap-y-1 gap-x-4 pt-1 text-xs text-[#54615b]">
                    <span class="flex items-center gap-1 text-on-surface"><span class="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">{{ s.triggerIcon }}</span><strong>Pemicu:</strong> {{ s.trigger }}</span>
                    <span class="flex items-center gap-1 text-on-surface"><span class="material-symbols-outlined text-[18px] text-secondary" aria-hidden="true">{{ s.authorIcon }}</span><strong>Otorisator:</strong> {{ s.author }}</span>
                    <span :class="s.locked ? 'text-secondary font-semibold' : 'text-[#54615b]'" class="flex items-center gap-1"><span class="material-symbols-outlined text-[18px]" :class="s.locked ? 'text-secondary' : ''" aria-hidden="true">{{ s.locked ? 'bolt' : 'timer' }}</span> SLA: {{ s.sla }}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0 self-end lg:self-center">
                <template v-if="!s.locked">
                  <button aria-label="Edit rule" class="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#54615b] hover:text-primary hover:bg-secondary-container shadow-sm transition-all" @click="openStepEdit(s)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">tune</span></button>
                  <button aria-label="Salin tahap" class="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#54615b] hover:text-on-surface shadow-sm transition-all" @click="duplicateStep(s)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span></button>
                  <button aria-label="Hapus step" class="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#54615b] hover:text-error hover:bg-error-container shadow-sm transition-all" @click="deleteStep(s)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
                </template>
                <span v-else class="px-3 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs">Sistem Otomatis (Terkunci)</span>
              </div>
            </div>
            <div v-if="idx < steps.length - 1" class="h-8 flex items-center justify-center" aria-hidden="true">
              <div class="w-0.5 h-full bg-[#E6EEFF] flex items-center justify-center">
                <span class="material-symbols-outlined text-[14px] text-[#54615b] bg-white rounded-full">arrow_downward</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Bottom Rule Matrix & Governance Safeguards -->
    <div class="rounded-xl bg-white p-6 shadow-sm">
      <div class="mb-6">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">tune</span>
          <h3 class="text-base font-bold text-on-surface">Aturan Eskalasi &amp; Delegasi Otorisasi</h3>
        </div>
        <p class="text-xs text-[#54615b]">Cegah bottleneck alur operasional dinas ketika approver berhalangan hadir atau perjalanan bersentuhan dengan deadline mendesak.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
        <div class="p-4 rounded-xl bg-[#EFF4FF] flex items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">forward_to_inbox</span>
              <span class="text-sm font-semibold text-on-surface">Eskalasi ke atasan jika melewati batas waktu (24 jam)</span>
            </div>
            <p class="text-xs text-[#54615b]">Secara mandiri memindahkan tiket approval ke pejabat 1 tingkat lebih tinggi apabila antrean mengendap tanpa konfirmasi.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input v-model="escalationOn" class="sr-only peer" type="checkbox" aria-label="Toggle eskalasi" />
            <div class="w-11 h-6 bg-[#D0DBED] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
        <div class="p-4 rounded-xl bg-[#EFF4FF] flex items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">how_to_reg</span>
              <span class="text-sm font-semibold text-on-surface">Izinkan delegasi approval sementara saat approver cuti</span>
            </div>
            <p class="text-xs text-[#54615b]">Integrasi dengan HRMS: otorisasi dialihkan otomatis kepada pelaksana tugas (Plt) yang terdata resmi selama masa cuti berlangsung.</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input v-model="delegationOn" class="sr-only peer" type="checkbox" aria-label="Toggle delegasi" />
            <div class="w-11 h-6 bg-[#D0DBED] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-[#EFF4FF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary text-[22px]" aria-hidden="true">mark_email_read</span>
          <div class="flex flex-col">
            <span class="text-sm font-semibold text-on-surface">Multi-Channel Instant Ping</span>
            <span class="text-xs text-[#54615b]">Push notifikasi dikirimkan simultan via WhatsApp Korporat, Email, dan Mobile Push SixAgo.</span>
          </div>
        </div>
        <span class="px-3 py-1 rounded-full bg-white text-secondary text-xs shadow-sm">Notifikasi via email &amp; panel aplikasi</span>
      </div>

      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#EFF4FF]">
        <div class="flex items-center gap-1.5 text-[#54615b] text-xs">
          <span class="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">history</span>
          <span>Terakhir dimodifikasi oleh <strong>Ratna Paramita (HR Admin)</strong> pada 24 Okt 2024, 14:32 WIB</span>
        </div>
        <div class="flex items-center gap-2">
          <button aria-label="Reset ke standar" class="px-6 py-2.5 rounded-full bg-[#EFF4FF] text-[#54615b] hover:text-on-surface text-sm transition-all active:scale-95" @click="resetConfig">Reset ke Standar</button>
          <button aria-label="Simpan dan terapkan konfigurasi" :disabled="savingConfig" class="flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow-md hover:bg-secondary transition-all active:scale-95 disabled:opacity-60" @click="saveConfig">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">save</span>
            <span>{{ savingConfig ? 'Menyimpan...' : 'Simpan &amp; Terapkan Konfigurasi Alur' }}</span>
          </button>
        </div>
      </div>
    </div>

    <Transition enter-active-class="transition duration-300" enter-from-class="translate-y-10 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-200" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-10 opacity-0">
      <div v-if="showToast" class="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white p-4 rounded-xl shadow-xl" role="status" aria-live="polite">
        <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>
        </div>
        <div class="flex flex-col pr-3">
          <span class="text-sm font-semibold text-on-surface">{{ toastText.title }}</span>
          <span class="text-xs text-[#54615b]">{{ toastText.desc }}</span>
        </div>
      </div>
    </Transition>

    <!-- Modal Tambah Skema -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showSchemeModal" class="fixed inset-0 bg-[#27313f]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showSchemeModal = false">
        <form class="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4" @submit.prevent="createScheme">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-on-surface">Tambah Skema Alur Approval</h3>
            <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b]" @click="showSchemeModal = false"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase text-on-surface">Nama Skema</label>
            <input v-model="schemeForm.name" required class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" placeholder="Contoh: Alur Internasional & C-Suite" type="text" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase text-on-surface">Deskripsi</label>
            <textarea v-model="schemeForm.description" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white resize-none" placeholder="Cakupan dan kegunaan skema..." rows="3" />
          </div>
          <div class="pt-2 flex items-center justify-end gap-2">
            <button type="button" class="px-6 py-2.5 rounded-full bg-[#EFF4FF] text-sm" @click="showSchemeModal = false">Batal</button>
            <button type="submit" :disabled="schemeSaving" class="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60">{{ schemeSaving ? 'Menyimpan...' : 'Buat Skema' }}</button>
          </div>
        </form>
      </div>
    </Transition>

    <!-- Modal Ubah Tahap -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showStepModal" class="fixed inset-0 bg-[#27313f]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showStepModal = false">
        <form class="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4" @submit.prevent="saveStep">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-on-surface">Ubah Rule Tahap</h3>
            <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b]" @click="showStepModal = false"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase text-on-surface">Judul Tahap</label>
            <input v-model="stepForm.title" required class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" type="text" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase text-on-surface">Otorisator (Role)</label>
            <input v-model="stepForm.role" required class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" type="text" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase text-on-surface">Pemicu</label>
            <input v-model="stepForm.trigger" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" type="text" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase text-on-surface">SLA</label>
            <input v-model="stepForm.sla" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" type="text" />
          </div>
          <div class="pt-2 flex items-center justify-end gap-2">
            <button type="button" class="px-6 py-2.5 rounded-full bg-[#EFF4FF] text-sm" @click="showStepModal = false">Batal</button>
            <button type="submit" :disabled="stepSaving" class="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60">{{ stepSaving ? 'Menyimpan...' : 'Simpan Tahap' }}</button>
          </div>
        </form>
      </div>
    </Transition>

    <!-- Modal Simulasi Uji Alur -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showSimulate" class="fixed inset-0 bg-[#27313f]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showSimulate = false">
        <form class="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4" @submit.prevent="runSimulate">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-on-surface">Simulasi Uji Alur Otorisasi</h3>
            <button type="button" aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b]" @click="showSimulate = false"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-xs font-semibold uppercase text-on-surface">Estimasi Biaya (Rp)</label>
              <input v-model="simForm.amount" required type="number" min="0" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" placeholder="9500000" />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-semibold uppercase text-on-surface">Tujuan</label>
              <input v-model="simForm.destination" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white" placeholder="Surabaya" type="text" />
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm cursor-pointer"><input v-model="simForm.has_advance" type="checkbox" class="accent-primary w-4 h-4">Mengajukan kas bon</label>
          <div v-if="simResult" class="p-4 rounded-xl bg-surface-container-low space-y-1">
            <p class="text-xs font-semibold uppercase tracking-wider text-muted">Hasil simulasi ({{ simResult.length }} tahap):</p>
            <ol class="text-sm space-y-1 list-decimal list-inside">
              <li v-for="(s, i) in simResult" :key="i">{{ s }}</li>
            </ol>
          </div>
          <div class="pt-2 flex items-center justify-end gap-2">
            <button type="button" class="px-6 py-2.5 rounded-full bg-[#EFF4FF] text-sm" @click="showSimulate = false">Tutup</button>
            <button type="submit" :disabled="simSaving" class="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-60">{{ simSaving ? 'Menghitung...' : 'Jalankan Simulasi' }}</button>
          </div>
        </form>
      </div>
    </Transition>

    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
