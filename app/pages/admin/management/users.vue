<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { UserAccount } from '~/types'
import { mapUserAccount } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { GRADES, gradesForRole, roleNeedsManager } from '~/constants/domain'

const api = useApi()
const toast = useToast()

// Enrich for display fidelity matching admin-management-users.html
type DisplayUser = UserAccount & {
  entity: string
  jabatan: string
  gradeLabel: string
  roleClass: string
  statusClass: string
  statusDot: string
  managerTitle: string
  managerInitials: string
  avatarAlt: string
  hasAvatar: boolean
  _rawId: number
  _rawDeptId: number | null
  _rawManagerId: number | null
  _rawGrade: string
  _rawRole: string
}

// Kosakata role persis backend (dipakai store canDecideQueue + dashboard roleKey)
const ROLE_OPTIONS = ['Employee', 'Line Manager', 'Division Head', 'Finance Approver', 'Super Admin'] as const

// Kosakata grade persis backend (uppercase; P1…P5, M1…M3)
const GRADE_OPTIONS = GRADES.map((g) => g.code)

// Grade mana yang sudah tercakup travel policy aktif. Diminta ke backend
// supaya PolicyCheck::gradeMatches tidak perlu diduplikasi di frontend.
const { data: gradeCoverage } = await useAsyncData('grade-coverage', () =>
  api<{ grades: string[]; covered: string[]; uncovered: string[] }>('/travel-policies/grade-coverage'),
)
const uncoveredGrades = computed(() => new Set(gradeCoverage.value?.uncovered ?? []))
const gradeHasPlafon = (code: string) => !uncoveredGrades.value.has(code)

function roleClass(role: string) {
  if (role === 'Line Manager') return 'bg-secondary-container text-[#2e6f3c]'
  if (role === 'Division Head') return 'bg-surface-container-highest text-on-surface'
  if (role === 'Finance Approver') return 'bg-surface-container text-[#3e4a3c]'
  if (role === 'Super Admin') return 'bg-secondary-container text-[#2e6f3c]'
  return 'bg-surface-container-low text-[#3e4a3c]'
}
function statusMeta(status: string) {
  if (status === 'Aktif') return { pill: 'bg-secondary-container text-[#2e6f3c]', dot: 'bg-primary' }
  if (status === 'Pending') return { pill: 'bg-surface-container text-[#54615b]', dot: 'bg-[#92a099]' }
  if (status === 'Cuti') return { pill: 'bg-surface-container-low text-[#54615b]', dot: 'bg-[#54615b]' }
  return { pill: 'bg-error-container text-error', dot: 'bg-error' }
}

// Filters
const searchQuery = ref('')
const debouncedUserSearch = useDebounce(searchQuery, 300)
const deptFilter = ref('')
// Filter presisi per id — dipakai saat halaman ini dibuka dari kartu
// departemen ("?department_id=3"). Berbeda dengan deptFilter di atas yang
// berbasis nama (LIKE) dan bisa saling tertangkap antar departemen.
const deptFilterId = ref('')
const roleFilter = ref('')
const statusFilter = ref('')
const currentPage = ref(1)

const userParams = computed(() => ({
  search: debouncedUserSearch.value.trim() || undefined,
  // deptFilter berisi departments.name — backend mencocokkan dengan LIKE pada
  // name, bukan code (UserController:23). Mengirim code selalu menghasilkan 0 baris.
  department: deptFilter.value || undefined,
  department_id: deptFilterId.value || undefined,
  role: roleFilter.value || undefined,
  status: statusFilter.value || undefined,
  page: currentPage.value,
  per_page: 10,
}))

// Filter yang datang dari kartu departemen; chip agar tidak misterius.
const deptFilterFromQuery = ref('')
onMounted(() => {
  const q = useRoute().query
  if (q.department_id) {
    deptFilterId.value = String(q.department_id)
    deptFilterFromQuery.value = String(q.department_name ?? '')
  }
})
function clearDeptFilter() {
  deptFilterId.value = ''
  deptFilterFromQuery.value = ''
  deptFilter.value = ''
  currentPage.value = 1
  const q = { ...useRoute().query }
  delete q.department_id
  delete q.department_name
  navigateTo({ path: '/admin/management/users', query: q }, { replace: true })
}
const { data: userRes } = await useAsyncData('users', () => api<LaravelPaginator<any>>('/users', { params: userParams.value }), { watch: [userParams] })
const userMeta = computed(() => paginatorMeta(userRes.value?.data ? userRes.value : []))
// KPI global (halaman ini SA-only; endpoint direstriksi Super Admin di backend).
const { data: usersSummary } = await useAsyncData('users-summary', () => api<{
  total: number; baru_30_hari: number; pejabat: number; nonaktif: number
}>('/users-summary'))

// Opsi dinamis untuk form (key khusus agar tidak bentrok dengan cache halaman lain)
const { data: deptRes } = await useAsyncData('user-form-departments', () => api<LaravelPaginator<any>>('/departments', { params: { per_page: 100 } }))
const { data: managerRes } = await useAsyncData('user-form-managers', () => api<LaravelPaginator<any>>('/users', { params: { per_page: 100 } }))

const departmentOptions = computed<any[]>(() => paginatorMeta(deptRes.value?.data ? deptRes.value : []).items)
const managerOptions = computed<any[]>(() => paginatorMeta(managerRes.value?.data ? managerRes.value : []).items)

function toDisplay(u: any): DisplayUser {
  const base = mapUserAccount(u)
  const mgrName = u.manager?.name ?? '-'
  const rawId = Number(u.id)
  const rawDeptId = u.department_id != null ? Number(u.department_id) : (u.department?.id != null ? Number(u.department.id) : null)
  const rawManagerId = u.manager_id != null ? Number(u.manager_id) : (u.manager?.id != null ? Number(u.manager.id) : null)
  return {
    ...base,
    _rawId: rawId,
    _rawDeptId: rawDeptId,
    _rawManagerId: rawManagerId,
    _rawGrade: String(u.grade ?? ''),
    _rawRole: String(u.role ?? 'Employee'),
    entity: 'PT Nusantara Dinamika Tbk',
    jabatan: base.role,
    gradeLabel: `Grade ${base.grade}`,
    roleClass: roleClass(base.role),
    statusClass: statusMeta(base.status).pill,
    statusDot: statusMeta(base.status).dot,
    manager: mgrName,
    managerTitle: u.manager?.department?.name ?? '-',
    managerInitials: mgrName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase(),
    avatarAlt: base.avatar ? `Foto ${base.name}` : `Inisial ${base.name}`,
    hasAvatar: !!base.avatar,
  }
}

const users = computed<DisplayUser[]>(() => userMeta.value.items.map(toDisplay))
const filteredUsers = computed(() => users.value)
const totalUsers = computed(() => userMeta.value.total)
const lastUserPage = computed(() => userMeta.value.lastPage)

function resetFilters() {
  searchQuery.value = ''
  deptFilter.value = ''
  roleFilter.value = ''
  statusFilter.value = ''
  currentPage.value = 1
}
watch([debouncedUserSearch, deptFilter, roleFilter, statusFilter], () => { currentPage.value = 1 })
// Memilih departemen lain lewat dropdown membatalkan filter presisi dari kartu.
watch(deptFilter, (v) => { if (v !== '') deptFilterId.value = '' })

// Drawer & Toast state (Vue, no classList toggle)
const showDrawer = ref(false)
const showToast = ref(false)
const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const form = reactive({
  nik: '2405-0982',
  nama: 'Rian Hidayat, S.T.',
  email: 'rian.hidayat@nusantaradinamika.co.id',
  whatsapp: '+62 812-3456-7890',
  department_id: '' as string | number,
  grade: 'P3',
  manager_id: '' as string | number,
  role: 'Employee' as string,
})

const editingId = ref<number | null>(null)
const saving = ref(false)
const formError = ref('')

// Opsi grade disaring sesuai role terpilih — backend menolak (422) kombinasi
// di luar matriks, jadi jangan tawarkan yang pasti ditolak.
const allowedGrades = computed(() => gradesForRole(form.role))
const managerRequired = computed(() => roleNeedsManager(form.role))
const selectedGradeNoPlafon = computed(() => !!form.grade && !gradeHasPlafon(form.grade))

// Role berganti → grade terpilih mungkin jadi tidak sah; Snippet agar FE tidak
// mengirim kombinasi yang pasti ditolak backend.
watch(allowedGrades, (list) => {
  if (form.grade && !list.some((g) => g.code === form.grade)) {
    form.grade = list[list.length - 1]?.code ?? ''
  }
})

const selectedManager = computed(() => {
  if (form.manager_id === '' || form.manager_id == null) return null
  return managerOptions.value.find((m: any) => String(m.id) === String(form.manager_id)) ?? null
})

// Peringatan governance pilihan atasan (bebas dipilih, tapi berisiko).
// Backend (ApprovalChain + User::canDecide) hanya memberi hak putus L1 ke
// role Line Manager / Super Admin (atau Plt-nya); role lain → antrean macet (403).
const managerRoleWarning = computed(() => {
  const m = selectedManager.value
  if (!m) return ''
  if (m.role === 'Line Manager' || m.role === 'Super Admin') return ''
  return `${m.name} ber-role ${m.role} — tidak bisa memutus Level 1 (backend hanya memberi hak L1 ke Line Manager / Super Admin), rantai akan macet (403). Disarankan pilih Line Manager atau Super Admin.`
})

const managerDeptWarning = computed(() => {
  const m: any = selectedManager.value
  if (!m || form.department_id === '' || form.department_id == null) return ''
  const mDeptId = m.department_id != null ? Number(m.department_id) : (m.department?.id != null ? Number(m.department.id) : null)
  if (mDeptId == null || mDeptId === Number(form.department_id)) return ''
  return 'Atasan beda departemen dengan user — L2 tetap ikut leader departemen user, dan daftar "Tim" atasan akan campur lintas departemen.'
})

const managerStatusWarning = computed(() => {
  const m: any = selectedManager.value
  if (!m || !m.status || m.status === 'Aktif') return ''
  return `${m.name} berstatus ${m.status} — antrean L1 yang ditujukan kepadanya tidak akan diputus selama ia non-aktif.`
})

function openDrawer() {
  editingId.value = null
  form.nik = ''
  form.nama = ''
  form.email = ''
  form.whatsapp = ''
  form.department_id = ''
  form.grade = 'P3'
  form.manager_id = ''
  form.role = 'Employee'
  formError.value = ''
  showDrawer.value = true
}
function closeDrawer() { showDrawer.value = false }

function openEdit(u: DisplayUser) {
  editingId.value = u._rawId
  form.nik = u.nik
  form.nama = u.name
  form.email = u.email
  form.whatsapp = ''
  form.department_id = u._rawDeptId ?? ''
  form.grade = (GRADE_OPTIONS as readonly string[]).includes(u._rawGrade) ? u._rawGrade : 'P3'
  form.manager_id = u._rawManagerId ?? ''
  form.role = (ROLE_OPTIONS as readonly string[]).includes(u._rawRole) ? u._rawRole : 'Employee'
  formError.value = ''
  showDrawer.value = true
}

async function handleSave() {
  formError.value = ''
  // Validasi ringan: tidak boleh memilih dirinya sendiri sebagai atasan
  if (editingId.value && form.manager_id !== '' && Number(form.manager_id) === editingId.value) {
    formError.value = 'Atasan langsung tidak boleh user itu sendiri.'
    return
  }
  // NIK: minimal 6 karakter tanpa spasi (format bervariasi: 885012 / 2405-0821).
  if (!editingId.value && (form.nik.trim().length < 6 || /\s/.test(form.nik))) {
    formError.value = 'NIK minimal 6 karakter tanpa spasi.'
    return
  }
  // Email korporat: format dasar (detail duplikat dicek backend via 422).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    formError.value = 'Format email tidak valid.'
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await api(`/users/${editingId.value}`, {
        method: 'PUT',
        body: {
          name: form.nama,
          email: form.email,
          role: form.role,
          grade: form.grade,
          department_id: form.department_id !== '' ? Number(form.department_id) : null,
          manager_id: form.manager_id !== '' ? Number(form.manager_id) : null,
          whatsapp: form.whatsapp || undefined,
        },
      })
    } else {
      await api('/users', {
        method: 'POST',
        body: {
          nik: form.nik, name: form.nama, email: form.email,
          password: 'SixAgo123!', role: form.role, grade: form.grade,
          department_id: form.department_id !== '' ? Number(form.department_id) : undefined,
          manager_id: form.manager_id !== '' ? Number(form.manager_id) : undefined,
          whatsapp: form.whatsapp || undefined,
        },
      })
    }
    showDrawer.value = false
    await refreshNuxtData(['users', 'users-summary'])
    await refreshNuxtData('user-form-managers')
    toastTitle.value = 'Karyawan & Akun Berhasil Didaftarkan!'
    syncToastUser(form.nama, form.nik, form.email)
    triggerToast()
  } catch (e: any) {
    // 422 backend (email/NIK duplikat, format) ditampilkan apa adanya.
    const firstError: string | undefined = e?.data?.errors ? Object.values(e.data.errors).flat()[0] as string : undefined
    formError.value = firstError || e?.data?.message || 'Gagal menyimpan data pengguna.'
  } finally {
    saving.value = false
  }
}

// Aksi destruktif sekali klik dibungkus konfirmasi berisi nama target,
// agar salah-klik ketahuan sebelum confirm.
const confirmAction = ref<{ kind: 'reset' | 'toggle'; user: DisplayUser } | null>(null)
const confirmSaving = ref(false)
function toggleTargetStatus(u: DisplayUser): string {
  return (u as unknown as { status?: string }).status === 'Aktif' ? 'Non-Aktif' : 'Aktif'
}
async function runConfirmedAction() {
  const c = confirmAction.value
  if (!c) return
  const id = (c.user as unknown as { _rawId: number })._rawId
  confirmSaving.value = true
  try {
    if (c.kind === 'reset') {
      await api(`/users/${id}/reset-password`, { method: 'POST', body: { password: 'SixAgo123!' } })
      toastTitle.value = `Password ${c.user.name} berhasil direset ke SixAgo123!`
    } else {
      await api(`/users/${id}/toggle-status`, { method: 'PATCH' })
      await refreshNuxtData(['users', 'users-summary'])
      toastTitle.value = `Status akun ${c.user.name} berhasil diperbarui.`
    }
    syncToastUser(c.user.name, c.user.nik, c.user.email)
    triggerToast()
    confirmAction.value = null
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal memproses aksi.', 'error', 'error')
  } finally {
    confirmSaving.value = false
  }
}

const toastTitle = ref('Karyawan & Akun Berhasil Didaftarkan!')
const toastUser = reactive({ nama: '', nik: '', email: '' })
function syncToastUser(nama: string, nik: string, email: string) {
  toastUser.nama = nama
  toastUser.nik = nik
  toastUser.email = email
}

function triggerToast() {
  showToast.value = true
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => (showToast.value = false), 4000)
}
function closeToast() { showToast.value = false }

const importInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
function showImportResult(title: string, nama: string, nik: string, email: string) {
  toastTitle.value = title
  syncToastUser(nama, nik, email)
  triggerToast()
}
// Header kolom yang diterima POST /users/import (lihat pesan error backend).
const IMPORT_HEADERS = ['nik', 'name', 'email', 'role', 'grade', 'department_code']
function downloadImportTemplate() {
  const csv = IMPORT_HEADERS.join(',') + '\n2405-0982,Rian Hidayat,rian@nusantara.co.id,Employee,P3,CC-TECH-502\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'template-impor-karyawan.csv'
  a.click()
  URL.revokeObjectURL(url)
}
function readFirstLine(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => String(reader.result ?? '').split(/\r?\n/)[0] ?? ''
    reader.onerror = () => resolve('')
    // 2KB pertama cukup untuk baris header.
    reader.readAsText(file.slice(0, 2048))
  })
}
async function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  // Cek header di klien sebelum upload: backend memetakan kolom by name
  // (urutan bebas), jadi cek sebagai himpunan — tolak dini dengan pesan jelas.
  const header = (await readFirstLine(file)).trim().toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
  const missing = IMPORT_HEADERS.filter(h => !header.includes(h))
  const extra = header.filter(h => !IMPORT_HEADERS.includes(h))
  if (missing.length > 0 || extra.length > 0) {
    const parts = [
      missing.length > 0 ? `kolom kurang: ${missing.join(', ')}` : '',
      extra.length > 0 ? `kolom tak dikenal: ${extra.join(', ')}` : '',
    ].filter(Boolean).join('; ')
    showImportResult(`Header CSV tidak cocok (${parts}). Kolom yang diterima: ${IMPORT_HEADERS.join(',')}.`, '', '', '')
    if (importInput.value) importInput.value.value = ''
    return
  }
  importing.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await api<{ message: string; created: number }>('/users/import', { method: 'POST', body: form })
    showImportResult(`Impor selesai: ${res.created} karyawan dibuat.`, '-', '-', file.name)
    await refreshNuxtData('users')
  } catch {
    showImportResult('Impor gagal. Pastikan format CSV: nik,name,email,role,grade,department_code.', '', '', '')
  } finally {
    importing.value = false
    if (importInput.value) importInput.value.value = ''
  }
}

function statusLabel(s: string) {
  if (s === 'Aktif') return 'Aktif'
  if (s === 'Pending') return 'Pending Onboarding'
  if (s === 'Cuti') return 'Cuti Panjang'
  return s
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans">
    <!-- Toast success - from admin-example-toats-success.html as Vue state -->
    <AppConfirmModal
      :open="confirmAction !== null"
      :title="confirmAction?.kind === 'reset' ? `Reset password ${confirmAction?.user.name}?` : `Ubah status ${confirmAction?.user.name}?`"
      :message="confirmAction?.kind === 'reset'
        ? `Password ${confirmAction?.user.email} akan diganti menjadi SixAgo123!. Sampaikan manual — user wajib ganti saat login pertama.`
        : `Status akun akan menjadi ${confirmAction ? toggleTargetStatus(confirmAction.user) : ''}. Akun non-aktif tidak bisa login dan antreannya menggantung.`"
      variant="danger"
      :confirm-label="confirmAction?.kind === 'reset' ? 'Ya, Reset' : 'Ya, Ubah Status'"
      icon="warning"
      :loading="confirmSaving"
      @close="confirmAction = null"
      @confirm="runConfirmedAction"
    />
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showToast"
        class="fixed top-24 right-4 sm:right-8 z-50 max-w-lg w-[calc(100%-2rem)] sm:w-full bg-white border border-primary/30 rounded-2xl shadow-2xl overflow-hidden"
        role="status"
        aria-live="polite"
      >
        <div class="p-4 flex items-start gap-3">
          <div class="w-10 h-10 rounded-full bg-secondary-container/40 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-[24px]" aria-hidden="true">check_circle</span>
          </div>
          <div class="flex flex-col flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-on-surface">{{ toastTitle }}</span>
              <span class="px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">Berhasil</span>
            </div>
            <p class="text-sm text-[#54615b] mt-1">
              Profil <span class="font-semibold text-on-surface">{{ toastUser.nama }}</span> (NIK: {{ toastUser.nik }}) telah tersimpan. Sampaikan password awal <span class="font-semibold text-on-surface">SixAgo123!</span> secara manual ke <span class="text-secondary">{{ toastUser.email }}</span> — tidak ada undangan otomatis.
            </p>
            <div class="flex items-center gap-2 mt-3">
              <button class="px-4 py-1 rounded-full bg-primary-container text-[#003e0f] text-xs font-semibold shadow-sm hover:opacity-95" @click="closeToast">Tutup</button>
            </div>
          </div>
          <button
            aria-label="Tutup notifikasi"
            class="w-7 h-7 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center transition-colors shrink-0"
            @click="closeToast"
          >
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="w-full bg-surface-container-low h-1 overflow-hidden">
          <div class="bg-primary-container h-full w-full" />
        </div>
      </div>
    </Transition>

    <!-- Top Breadcrumb & Page Title Banner -->
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mt-4">
      <div class="flex flex-col gap-1">
              
      </div>
      <div class="flex items-center gap-2 self-start lg:self-center shrink-0 flex-wrap">
        <button
          aria-label="Impor data karyawan"
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-on-surface shadow-sm hover:bg-surface-container-low transition-all text-sm font-medium"
          @click="importInput?.click()"
        >
          <span class="material-symbols-outlined text-[20px] text-secondary" aria-hidden="true">cloud_upload</span>
          <span>Impor Data Karyawan (CSV)</span>
        </button>
        <button
          aria-label="Unduh template CSV impor"
          title="Unduh template: nik,name,email,role,grade,department_code"
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-on-surface shadow-sm hover:bg-surface-container-low transition-all text-sm font-medium"
          @click="downloadImportTemplate"
        >
          <span class="material-symbols-outlined text-[20px] text-muted" aria-hidden="true">description</span>
          <span>Template CSV</span>
        </button>
        <input ref="importInput" type="file" accept=".csv,.txt" class="hidden" aria-label="Pilih file CSV" @change="handleImportFile">
        <button
          aria-label="Tambah pengguna baru"
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:brightness-105 active:scale-95 transition-all"
          @click="openDrawer"
        >
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">person_add</span>
          <span>Tambah Pengguna Baru</span>
        </button>
      </div>
    </div>

    <!-- KPI Summary Cards (4 Cards) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[#54615b]">Total Pengguna Aktif</span>
          <div class="w-10 h-10 rounded-full bg-secondary-container text-[#2e6f3c] flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">group</span>
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-1">
          <div class="text-3xl font-bold text-on-surface">{{ usersSummary?.total ?? totalUsers }} <span class="text-sm font-normal text-[#54615b]">Pegawai</span></div>
          <div class="flex items-center gap-1.5 text-secondary text-xs font-semibold">
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">trending_up</span>
            <span>+{{ usersSummary?.baru_30_hari ?? 0 }} pengguna 30 hari terakhir</span>
          </div>
        </div>
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-secondary-container/20 -z-0" aria-hidden="true" />
      </div>
      <div class="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[#54615b]">Menunggu Verifikasi HR</span>
          <div class="w-10 h-10 rounded-full bg-[#dee9fc] text-[#3e4a3c] flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">pending_actions</span>
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-1">
          <div class="text-3xl font-bold text-on-surface">{{ usersSummary?.baru_30_hari ?? 0 }} <span class="text-sm font-normal text-[#54615b]">Akun Baru</span></div>
          <div class="flex items-center gap-1.5 text-[#54615b] text-xs">
            <span class="w-2 h-2 rounded-full bg-secondary" aria-hidden="true" />
            <span>Perlu mapping role &amp; manager</span>
          </div>
        </div>
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-[#dee9fc]/30 -z-0" aria-hidden="true" />
      </div>
      <div class="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[#54615b]">Otorisasi Approver</span>
          <div class="w-10 h-10 rounded-full bg-[#e6eeff] text-primary flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">verified_user</span>
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-1">
          <div class="text-3xl font-bold text-on-surface">{{ usersSummary?.pejabat ?? 0 }} <span class="text-sm font-normal text-[#54615b]">Pejabat Otoritas</span></div>
          <div class="flex items-center gap-1.5 text-[#54615b] text-xs">
            <span>Manager / Kadiv / Direksi / CFO</span>
          </div>
        </div>
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-[#e6eeff]/40 -z-0" aria-hidden="true" />
      </div>
      <div class="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-[#54615b]">Non-Aktif / Cuti</span>
          <div class="w-10 h-10 rounded-full bg-surface-container-low text-[#54615b] flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">person_off</span>
          </div>
        </div>
        <div class="mt-4 flex flex-col gap-1">
          <div class="text-3xl font-bold text-on-surface">{{ usersSummary?.nonaktif ?? 0 }} <span class="text-sm font-normal text-[#54615b]">Ditangguhkan</span></div>
          <div class="flex items-center gap-1.5 text-[#54615b] text-xs">
            <span>Akses pemesanan dinonaktifkan</span>
          </div>
        </div>
        <div class="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-surface-container-low/80 -z-0" aria-hidden="true" />
      </div>
    </div>

    <!-- Main Section: Filters & Unified Table Container -->
    <div class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
      <!-- Filter Controls Bar -->
      <div class="p-6 bg-white flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div class="relative w-full xl:w-96">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#54615b] text-[20px]" aria-hidden="true">search</span>
          <input
            v-model="searchQuery"
            class="w-full pl-11 pr-4 py-2.5 rounded-full bg-surface-container-low text-on-surface placeholder-[#54615b] text-sm focus:outline-none focus:bg-white shadow-sm transition-all"
            placeholder="Cari nama, NIK, email, atau jabatan..."
            type="text"
            aria-label="Cari pegawai"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-if="deptFilterId"
            class="inline-flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold"
          >
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">apartment</span>
            {{ deptFilterFromQuery || `Departemen #${deptFilterId}` }}
            <button type="button" aria-label="Hapus filter departemen" class="w-5 h-5 rounded-full hover:bg-white/60 flex items-center justify-center" @click="clearDeptFilter">
              <span class="material-symbols-outlined text-[14px]" aria-hidden="true">close</span>
            </button>
          </span>
          <div class="relative inline-flex items-center">
            <select
              v-model="deptFilter"
              class="appearance-none pl-4 pr-9 py-2 rounded-full bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm"
              aria-label="Filter departemen"
            >
              <option value="">Semua Departemen</option>
              <option v-for="d in departmentOptions" :key="d.id ?? d.code" :value="d.name">{{ d.code }} — {{ d.name }}</option>
            </select>
            <span class="material-symbols-outlined absolute right-3 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
          </div>
          <div class="relative inline-flex items-center">
            <select
              v-model="roleFilter"
              class="appearance-none pl-4 pr-9 py-2 rounded-full bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm"
              aria-label="Filter role"
            >
              <option value="">Semua Role Sistem</option>
              <option value="Employee">Employee</option>
              <option value="Line Manager">Line Manager</option>
              <option value="Division Head">Division Head</option>
              <option value="Finance Approver">Finance Approver</option>
              <option value="Super Admin">Super Admin</option>
            </select>
            <span class="material-symbols-outlined absolute right-3 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
          </div>
          <div class="relative inline-flex items-center">
            <select
              v-model="statusFilter"
              class="appearance-none pl-4 pr-9 py-2 rounded-full bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm"
              aria-label="Filter status"
            >
              <option value="">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Pending">Peninjauan HR</option>
              <option value="Cuti">Ditangguhkan / Cuti</option>
            </select>
            <span class="material-symbols-outlined absolute right-3 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
          </div>
          <button
            aria-label="Reset filter"
            class="w-9 h-9 rounded-full bg-surface-container-low text-[#54615b] hover:text-on-surface flex items-center justify-center transition-colors"
            title="Reset Filter"
            @click="resetFilters"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">restart_alt</span>
          </button>
        </div>
      </div>

      <!-- Table Container -->
      <div class="w-full overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low text-[#54615b] text-xs uppercase tracking-wider">
              <th class="w-12 px-4 py-3.5 text-center">
                <input class="rounded w-4 h-4 text-primary focus:ring-0 cursor-pointer accent-primary" type="checkbox" aria-label="Pilih semua" />
              </th>
              <th class="px-4 py-3.5 font-semibold">Pegawai &amp; Kontak</th>
              <th class="px-4 py-3.5 font-semibold">Departemen &amp; Entitas</th>
              <th class="px-4 py-3.5 font-semibold">Jabatan &amp; Grade</th>
              <th class="px-4 py-3.5 font-semibold">Role SixAgo</th>
              <th class="px-4 py-3.5 font-semibold">Atasan Langsung</th>
              <th class="px-4 py-3.5 font-semibold">Status Akun</th>
              <th class="px-4 py-3.5 font-semibold text-right pr-6">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-transparent text-sm">
            <tr
              v-for="u in filteredUsers"
              :key="u.email"
              class="hover:bg-surface-container-low/60 transition-colors"
            >
              <td class="px-4 py-4 text-center">
                <input class="rounded w-4 h-4 text-primary focus:ring-0 cursor-pointer accent-primary" type="checkbox" :aria-label="`Pilih ${u.name}`" />
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-3">
                  <img
                    v-if="u.hasAvatar && u.avatar"
                    :src="u.avatar"
                    :alt="u.avatarAlt"
                    class="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                  <div
                    v-else
                    class="w-10 h-10 rounded-full bg-surface-container text-primary flex items-center justify-center shrink-0 text-sm font-bold"
                    aria-hidden="true"
                  >
                    {{ u.name.split(' ').map(n=>n[0]).slice(0,2).join('') }}
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-semibold text-on-surface truncate">{{ u.name }}</span>
                    <span class="text-xs text-[#54615b]">NIK: {{ u.nik }}</span>
                    <span class="text-xs text-secondary truncate">{{ u.email }}</span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-on-surface">{{ u.department }}</span>
                  <span class="text-xs text-[#54615b]">{{ u.entity }}</span>
                  <span class="text-xs text-secondary">{{ u.costCenter }}</span>
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-on-surface">{{ u.jabatan }}</span>
                  <span class="inline-flex mt-1 items-center px-2 py-0.5 rounded-full bg-[#dee9fc] text-[#3e4a3c] text-xs w-max">{{ u.gradeLabel }}</span>
                </div>
              </td>
              <td class="px-4 py-4">
                <span :class="u.roleClass" class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium">
                  {{ u.role }}
                </span>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-full bg-[#dee9fc] flex items-center justify-center text-xs font-medium text-on-surface shrink-0" aria-hidden="true">{{ u.managerInitials }}</div>
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-on-surface">{{ u.manager }}</span>
                    <span class="text-xs text-[#54615b]">{{ u.managerTitle }}</span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <span :class="u.statusClass" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                  <span :class="u.statusDot" class="w-2 h-2 rounded-full" aria-hidden="true" />
                  {{ statusLabel(u.status) }}
                </span>
              </td>
              <td class="px-4 py-4 text-right pr-6">
                <div class="inline-flex items-center gap-1.5">
                  <button aria-label="Edit data pengguna" class="w-8 h-8 rounded-full bg-secondary-container/50 text-secondary hover:bg-secondary hover:text-white flex items-center justify-center transition-colors" @click="openEdit(u)">
                    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>
                  </button>
                  <button aria-label="Reset password" class="w-8 h-8 rounded-full bg-surface-container text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-colors" @click="confirmAction = { kind: 'reset', user: u }">
                    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">lock_reset</span>
                  </button>
                  <button aria-label="Ubah status akun" class="w-8 h-8 rounded-full bg-error-container text-error hover:bg-error hover:text-white flex items-center justify-center transition-colors" @click="confirmAction = { kind: 'toggle', user: u }">
                    <span class="material-symbols-outlined text-[16px]" aria-hidden="true">block</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredUsers.length===0">
              <td colspan="8" class="py-10 text-center text-sm text-[#54615b]">Tidak ada pengguna yang cocok dengan pencarian.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer Bar -->
      <div class="px-6 py-4 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-surface-container-low">
        <div class="text-sm text-[#54615b]">
          Menampilkan <span class="font-semibold text-on-surface">{{ filteredUsers.length }}</span> dari <span class="font-semibold text-on-surface">{{ totalUsers }}</span> pengguna terdaftar
        </div>
        <div class="flex items-center gap-1">
          <button aria-label="Halaman sebelumnya" :disabled="currentPage <= 1" class="w-8 h-8 rounded-full bg-surface-container-low text-[#54615b] flex items-center justify-center hover:text-on-surface transition-colors disabled:opacity-40" @click="currentPage--">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
          </button>
          <span class="px-2 text-sm text-[#54615b]">Halaman {{ currentPage }} dari {{ lastUserPage }}</span>
          <button aria-label="Halaman berikutnya" :disabled="currentPage >= lastUserPage" class="w-8 h-8 rounded-full bg-surface-container-low text-[#54615b] flex items-center justify-center hover:text-on-surface transition-colors disabled:opacity-40" @click="currentPage++">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Drawer Overlay & Panel - replaces classList toggle with Vue state + slide transition -->
    <Transition
      enter-active-class="transition duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showDrawer"
        class="fixed inset-0 z-40 bg-[#27313f]/50 backdrop-blur-sm"
        aria-hidden="true"
        @click="closeDrawer"
      />
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="showDrawer"
        class="fixed top-0 right-0 h-screen w-full sm:w-[640px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col overflow-hidden border-l border-[#bdcbb8]/30"
        role="dialog"
        aria-modal="true"
        aria-label="Tambah karyawan dan akun baru"
      >
        <!-- Modal Header -->
        <div class="px-6 py-5 flex items-start justify-between border-b border-[#e6eeff] bg-[#f8f9ff]/50 shrink-0">
          <div class="flex items-start gap-3">
            <div class="w-11 h-11 rounded-full bg-secondary-container/40 text-primary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[24px]" aria-hidden="true">person_add</span>
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-lg font-semibold text-on-surface">Tambah Karyawan &amp; Akun Baru</h2>
                <span class="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary text-xs font-semibold">HR Portal</span>
              </div>
              <p class="text-sm text-[#54615b] mt-0.5">Registrasi profil pegawai, alokasi cost center divisi, dan hak akses persetujuan SixAgo</p>
            </div>
          </div>
          <button
            aria-label="Tutup drawer"
            class="w-9 h-9 rounded-full bg-surface-container-low hover:bg-surface-container flex items-center justify-center transition-colors shadow-sm shrink-0"
            @click="closeDrawer"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="overflow-y-auto px-6 py-6 space-y-6 flex-1">
          <!-- Section 1 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-secondary-container text-secondary flex items-center justify-center text-xs font-bold">1</span>
              <span class="text-xs uppercase tracking-wider text-secondary font-semibold">Data Identitas Pegawai</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-on-surface">Nomor Induk Karyawan (NIK) <span class="text-error">*</span></label>
                <input v-model="form.nik" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white shadow-sm border border-transparent focus:border-[#bdcbb8] transition-all" type="text" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-on-surface">Nama Lengkap Sesuai Identitas <span class="text-error">*</span></label>
                <input v-model="form.nama" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white shadow-sm border border-transparent focus:border-[#bdcbb8] transition-all" type="text" />
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-on-surface">Email Korporat (SSO Active) <span class="text-error">*</span></label>
                <input v-model="form.email" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white shadow-sm border border-transparent focus:border-[#bdcbb8] transition-all" type="email" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-on-surface">No. WhatsApp Aktif (Notifikasi Dinas) <span class="text-error">*</span></label>
                <input v-model="form.whatsapp" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white shadow-sm border border-transparent focus:border-[#bdcbb8] transition-all" type="text" />
              </div>
            </div>
          </div>

          <!-- Section 2 -->
          <div class="space-y-3 pt-2 border-t border-[#e6eeff]">
            <div class="flex items-center gap-2 pt-2">
              <span class="w-6 h-6 rounded-full bg-secondary-container text-secondary flex items-center justify-center text-xs font-bold">2</span>
              <span class="text-xs uppercase tracking-wider text-secondary font-semibold">Penempatan Organisasi &amp; Kebijakan Plafon</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-on-surface">Departemen &amp; Cost Center <span class="text-error">*</span></label>
                <div class="relative">
                  <select v-model="form.department_id" class="appearance-none w-full pl-4 pr-9 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm border border-transparent focus:border-[#bdcbb8]">
                    <option value="" disabled>Pilih departemen...</option>
                    <option v-for="d in departmentOptions" :key="d.id ?? d.code" :value="d.id">{{ d.code }} — {{ d.name }}</option>
                  </select>
                  <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-on-surface">Grade Jabatan (Plafon Perjalanan) <span class="text-error">*</span></label>
                <div class="relative">
                  <select v-model="form.grade" class="appearance-none w-full pl-4 pr-9 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm border border-transparent focus:border-[#bdcbb8]">
                    <option v-for="g in allowedGrades" :key="g.code" :value="g.code">{{ g.label }}</option>
                  </select>
                  <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
                </div>
                <p class="text-[11px] text-[#54615b]">Grade menentukan plafon perjalanan; role menentukan kewenangan approval.</p>
                <p v-if="selectedGradeNoPlafon" class="flex items-start gap-1 text-[11px] text-error font-semibold" role="alert">
                  <span class="material-symbols-outlined text-[14px] mt-px" aria-hidden="true">warning</span>
                  Grade {{ form.grade }} belum tercakup travel policy aktif — pengajuan travel user ini tidak akan punya plafon.
                </p>
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-on-surface" for="manager-select">
                Atasan Langsung (Line Manager)<span v-if="managerRequired" class="text-error">*</span><span v-else class="text-muted font-normal"> (opsional)</span>
              </label>
              <div class="relative">
                <select id="manager-select" v-model="form.manager_id" class="appearance-none w-full pl-4 pr-9 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm border border-transparent focus:border-[#bdcbb8]">
                  <option value="">Tanpa atasan langsung</option>
                  <option
                    v-for="m in managerOptions"
                    :key="m.id"
                    :value="m.id"
                    :disabled="editingId !== null && Number(m.id) === editingId"
                  >{{ m.name }} ({{ m.role }})</option>
                </select>
                <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
              </div>
              <p v-if="selectedManager" class="text-xs text-[#54615b]">Terpilih: {{ selectedManager.name }} — {{ selectedManager.role }}</p>
              <p v-else class="text-xs text-[#54615b]">Tanpa atasan = Level 1 auto-pass tercatat audit; untuk TR ≤ Rp5jt (rantai hanya L1) artinya langsung Approved.</p>
              <div v-if="managerRoleWarning" class="p-3 rounded-xl bg-error-container/60 flex items-start gap-2" role="alert">
                <span class="material-symbols-outlined text-error text-[18px] shrink-0" aria-hidden="true">warning</span>
                <p class="text-xs text-error">{{ managerRoleWarning }}</p>
              </div>
              <div v-if="managerDeptWarning" class="p-3 rounded-xl bg-surface-container-low flex items-start gap-2" role="status">
                <span class="material-symbols-outlined text-[#54615b] text-[18px] shrink-0" aria-hidden="true">info</span>
                <p class="text-xs text-on-surface">{{ managerDeptWarning }}</p>
              </div>
              <div v-if="managerStatusWarning" class="p-3 rounded-xl bg-surface-container-low flex items-start gap-2" role="status">
                <span class="material-symbols-outlined text-[#54615b] text-[18px] shrink-0" aria-hidden="true">info</span>
                <p class="text-xs text-on-surface">{{ managerStatusWarning }}</p>
              </div>
              <p v-if="formError" class="text-xs text-error" role="alert">{{ formError }}</p>
            </div>
          </div>

          <!-- Section 3 -->
          <div class="space-y-3 pt-2 border-t border-[#e6eeff]">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 pt-2">
                <span class="w-6 h-6 rounded-full bg-secondary-container text-secondary flex items-center justify-center text-xs font-bold">3</span>
                <span class="text-xs uppercase tracking-wider text-secondary font-semibold">Pengaturan Hak Akses &amp; Kewenangan SixAgo</span>
              </div>
              <span class="text-xs text-[#54615b]">Satu role persis kosakata backend</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-on-surface" for="role-select">Role SixAgo <span class="text-error">*</span></label>
              <div class="relative">
                <select id="role-select" v-model="form.role" class="appearance-none w-full pl-4 pr-9 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer shadow-sm border border-transparent focus:border-[#bdcbb8]">
                  <option v-for="r in ROLE_OPTIONS" :key="r" :value="r">{{ r }}</option>
                </select>
                <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
              </div>
              <p class="text-xs text-[#54615b]">Employee / Line Manager / Division Head / Finance Approver / Super Admin.</p>
            </div>
            <div class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low mt-2">
              <span class="material-symbols-outlined text-secondary text-[22px]" aria-hidden="true">mark_email_read</span>
              <span class="flex flex-col"><span class="text-sm font-semibold text-on-surface">Password awal: SixAgo123!</span><span class="text-xs text-[#54615b]">Sampaikan manual ke karyawan — ia wajib ganti password saat login pertama. Tidak ada undangan otomatis via email/WhatsApp.</span></span>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-4 flex flex-col sm:flex-row items-center justify-between border-t border-[#e6eeff] bg-[#f8f9ff]/70 shrink-0 gap-3">
          <div class="flex items-center gap-1.5 text-[#54615b] text-xs">
            <span class="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">security</span>
            <span>Tervalidasi ISO/IEC 27001</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-6 py-2.5 rounded-full bg-white text-[#54615b] hover:text-on-surface border border-[#bdcbb8] text-sm font-medium shadow-sm hover:bg-surface-container transition-all" type="button" @click="closeDrawer">Batal</button>
            <button class="flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:brightness-105 active:scale-95 transition-all disabled:opacity-60" type="button" :disabled="saving" @click="handleSave">
              <span class="material-symbols-outlined text-[20px]" aria-hidden="true">check_circle</span>
              <span>{{ saving ? 'Menyimpan...' : 'Simpan &amp; Daftarkan Karyawan' }}</span>
            </button>
          </div>
        </div>
      </aside>
    </Transition>

    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
