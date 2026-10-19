<script setup lang="ts">
definePageMeta({ layout: 'admin' })
import { useAppStore } from '~/stores/app'
import { useApi, paginatorMeta, type LaravelPaginator } from '~/composables/useApi'
import { POLICY_BADGE } from '~/constants/domain'
import { formatRp } from '~/utils/format'

const api = useApi()
const app = useAppStore()
const toast = useToast()

const { data: projectRes } = await useAsyncData('tr-create-projects', () =>
  api<LaravelPaginator<any>>('/projects', { params: { per_page: 100 } }),
)
const projects = computed<any[]>(() => paginatorMeta(projectRes.value?.data ? projectRes.value : []).items)

const form = reactive({
  project_id: '' as string | number,
  route: '',
  transport: '',
  start_date: '',
  end_date: '',
  cost: '' as string | number,
  purpose: '',
})
const saving = ref(false)
// Tanggal selesai tidak boleh mendahului tanggal mulai (backend juga
// memvalidasi via after_or_equal — ini cegah dini di klien).
const dateError = computed(() => {
  if (form.start_date && form.end_date && form.end_date < form.start_date)
    return 'Tanggal selesai tidak boleh mendahului tanggal mulai.'
  return ''
})

// Durasi otomatis dari tanggal (inklusif, mis. "5 Hari (4 Malam)") — cerminan
// rumus backend TravelRequestController::durationLabel(). Readonly.
const durationLabel = computed(() => {
  if (!form.start_date || !form.end_date) return ''
  const s = Date.parse(form.start_date)
  const e = Date.parse(form.end_date)
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return ''
  const days = Math.round((e - s) / 86400000) + 1
  return `${days} Hari (${Math.max(1, days - 1)} Malam)`
})

// Plafon policy grade pemohon (otomatis, bukan pilih manual). Diambil dari
// endpoint applicable berdasarkan tanggal perjalanan — tampil sebelum user
// mengisi biaya agar pembatasnya jelas.
type ApplicablePolicy = {
  policy_code: string
  grade: string
  user_grade: string
  region: string
  sla: string
  days: number
  limit: number
  transport_plafon: number
  hotel_plafon: number
  per_diem: number
  local_transport: number
}
const policyLimit = ref<ApplicablePolicy | null>(null)
async function fetchPolicyLimit() {
  if (!form.start_date || !form.end_date) { policyLimit.value = null; return }
  try {
    const res = await api<{ policy: ApplicablePolicy | null }>('/travel-policies/applicable', {
      params: { start_date: form.start_date, end_date: form.end_date, user_id: app.user?.id },
    })
    policyLimit.value = res.policy
  } catch {
    policyLimit.value = null
  }
}

// Pratinjau rantai + badge policy memakai endpoint simulasi yang sama persis
// dengan aturan pembentukan rantai (terbuka semua role, tanpa efek samping).
const simPreview = ref<{ steps: string[]; policy: { policy_code: string; total: number; limit: number; within_limit: boolean; status: string; deviation_pct: number } | null } | null>(null)
const simLoading = ref(false)
let simTimer: ReturnType<typeof setTimeout> | null = null
watch(() => [form.cost, form.start_date, form.end_date], () => {
  if (simTimer) clearTimeout(simTimer)
  simTimer = setTimeout(() => { runSimPreview(); fetchPolicyLimit() }, 500)
})
onUnmounted(() => { if (simTimer) clearTimeout(simTimer) })

// Pembatas: estimasi tidak boleh melebihi plafon policy grade pemohon.
// Backend tetap penentu akhir (422); ini mencegah lebih awal di klien.
const overLimit = computed(() => {
  const cost = Number(form.cost || 0)
  if (!(cost > 0)) return false
  if (simPreview.value?.policy && simPreview.value.policy.within_limit === false) return true
  if (policyLimit.value && cost > policyLimit.value.limit) return true
  return false
})
async function runSimPreview() {
  const amount = Number(form.cost || 0)
  if (!(amount > 0)) { simPreview.value = null; return }
  simLoading.value = true
  try {
    simPreview.value = await api<{ steps: string[]; policy: { policy_code: string; total: number; status: string; deviation_pct: number } | null }>('/approval-simulate', {
      method: 'POST',
      body: {
        amount,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        user_id: app.user?.id,
      },
    })
  } catch {
    simPreview.value = null
  } finally {
    simLoading.value = false
  }
}

async function handleSubmit() {
  if (!app.user?.id) {
    toast.show('Sesi tidak valid, silakan login ulang.', 'error', 'error')
    return
  }
  if (!form.project_id || !form.route.trim() || !form.transport.trim()
    || !form.start_date || !form.end_date || form.cost === '') {
    toast.show('Lengkapi proyek, rute, moda, tanggal, dan estimasi biaya.', 'info', 'info')
    return
  }
  if (dateError.value) {
    toast.show(dateError.value, 'error', 'error')
    return
  }
  if (overLimit.value) {
    toast.show(`Estimasi biaya melebihi plafon policy grade Anda${policyLimit.value ? ` (maks ${formatRp(policyLimit.value.limit)})` : ''}.`, 'error', 'error')
    return
  }
  saving.value = true
  try {
    const res = await api<{ request_no: string }>('/travel-requests', {
      method: 'POST',
      body: {
        user_id: app.user!.id,
        project_id: Number(form.project_id),
        route: form.route.trim(),
        transport: form.transport.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        cost: Number(form.cost),
        purpose: form.purpose.trim() || undefined,
      },
    })
    toast.show(`Pengajuan ${res.request_no} berhasil dibuat, diteruskan ke Level 1.`)
    await navigateTo(`/admin/travel-requests/${res.request_no}`)
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal membuat pengajuan. Periksa isian.', 'error', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans max-w-3xl mx-auto mt-4">
    <nav class="flex items-center gap-1.5 text-muted text-xs" aria-label="Breadcrumb">
      <NuxtLink to="/admin/travel-requests" class="hover:text-primary transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">flight_takeoff</span><span>Travel Requests</span></NuxtLink>
      <span class="opacity-40">/</span>
      <span class="text-sm font-semibold text-on-surface">Buat Request Baru</span>
    </nav>

    <BaseCard padding="p-6">
      <div class="flex items-center gap-3 mb-1">
        <div class="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center">
          <span class="material-symbols-outlined text-[22px]" aria-hidden="true">add_task</span>
        </div>
        <div>
          <h1 class="text-lg font-bold">Buat Request Perjalanan Dinas</h1>
          <p class="text-xs text-muted">Pemohon: <strong class="text-on-surface">{{ app.userName }}</strong><span v-if="app.user?.grade"> (Grade {{ app.user.grade }})</span> — pengajuan atas nama sendiri, diteruskan ke approval Level 1.</p>
        </div>
      </div>

      <form class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="handleSubmit">
        <div class="space-y-1 sm:col-span-2">
          <label class="text-sm font-medium" for="trProject">Proyek <span class="text-error">*</span></label>
          <select id="trProject" v-model="form.project_id" required aria-label="Proyek" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white cursor-pointer">
            <option value="" disabled>Pilih proyek...</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.code }} — {{ p.name }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="trRoute">Rute <span class="text-error">*</span></label>
          <input id="trRoute" v-model="form.route" required type="text" aria-label="Rute" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="Contoh: CGK → SUB" @blur="form.route = form.route.trim().replace(/\s+/g, ' ').toUpperCase()">
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="trTransport">Moda Transport <span class="text-error">*</span></label>
          <input id="trTransport" v-model="form.transport" required type="text" aria-label="Moda transport" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="Contoh: Garuda Indonesia">
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="trStart">Tanggal Mulai <span class="text-error">*</span></label>
          <input id="trStart" v-model="form.start_date" required type="date" aria-label="Tanggal mulai" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white">
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="trEnd">Tanggal Selesai <span class="text-error">*</span></label>
          <input id="trEnd" v-model="form.end_date" required type="date" :min="form.start_date || undefined" aria-label="Tanggal selesai" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white">
          <p v-if="dateError" class="text-xs text-error" role="alert">{{ dateError }}</p>
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="trCost">Estimasi Biaya (Rp) <span class="text-error">*</span></label>
          <input id="trCost" v-model="form.cost" required type="number" min="0" :max="policyLimit ? policyLimit.limit : undefined" aria-label="Estimasi biaya" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="9500000">
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="trDuration">Durasi</label>
          <input id="trDuration" :value="durationLabel" type="text" readonly aria-readonly="true" aria-label="Durasi (otomatis dari tanggal)" class="w-full px-4 py-2.5 rounded-xl bg-surface-container text-muted text-sm cursor-not-allowed" placeholder="Otomatis dari tanggal">
          <p class="text-xs text-muted">Terisi otomatis dari tanggal mulai &amp; selesai.</p>
        </div>
        <div class="space-y-1 sm:col-span-2">
          <label class="text-sm font-medium" for="trPurpose">Keperluan / Tujuan</label>
          <textarea id="trPurpose" v-model="form.purpose" rows="3" aria-label="Keperluan" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white resize-none" placeholder="Tuliskan keperluan perjalanan dinas..." />
        </div>
        <div v-if="policyLimit" class="sm:col-span-2 p-4 rounded-xl bg-secondary-container/30 border border-secondary-container space-y-1" aria-live="polite">
          <p class="text-xs font-semibold uppercase tracking-wider text-secondary">Plafon Policy Grade Anda (Otomatis)</p>
          <p class="text-sm">
            Policy <strong>{{ policyLimit.policy_code }}</strong> · cakupan {{ policyLimit.grade }} · grade Anda {{ policyLimit.user_grade }} — plafon maks
            <strong>{{ formatRp(policyLimit.limit) }}</strong> untuk {{ policyLimit.days }} hari.
          </p>
          <p v-if="overLimit" class="text-xs text-error font-semibold" role="alert">
            Estimasi melebihi plafon. Turunkan biaya ke ≤ {{ formatRp(policyLimit.limit) }} untuk dapat diajukan.
          </p>
        </div>
        <div v-if="simLoading || simPreview" class="sm:col-span-2 p-4 rounded-xl bg-surface-container-low space-y-2" aria-live="polite">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted">Pratinjau Otomatis</p>
          <p v-if="simLoading" class="text-sm text-muted">Menghitung rantai &amp; kepatuhan...</p>
          <template v-else-if="simPreview">
            <p class="text-sm">Rantai: <strong>{{ simPreview.steps.join(' → ') }}</strong></p>
            <p v-if="simPreview.policy" class="text-sm flex items-center gap-2">
              <span>Policy {{ simPreview.policy.policy_code }}:</span>
              <span :class="simPreview.policy.status === POLICY_BADGE.OK ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-amber-50 text-amber-900 border border-amber-200'" class="px-2 py-0.5 rounded-full text-xs font-semibold">{{ simPreview.policy.status }}</span>
            </p>
            <p v-else class="text-xs text-muted">Tidak ada policy aktif yang cocok dengan grade Anda — badge kepatuhan tidak diterbitkan.</p>
          </template>
        </div>
        <div class="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
          <NuxtLink to="/admin/travel-requests" class="px-6 py-2.5 rounded-full bg-surface-container-low text-on-surface text-sm font-medium hover:bg-surface-container transition-all">Batal</NuxtLink>
          <BaseButton variant="primary" type="submit" icon="send" :disabled="saving || overLimit || !app.user" :title="overLimit ? 'Estimasi melebihi plafon policy grade Anda' : undefined">{{ saving ? 'Menyimpan...' : 'Ajukan Perjalanan' }}</BaseButton>
        </div>
      </form>
    </BaseCard>
    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
