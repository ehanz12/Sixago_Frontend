/**
 * Landing page per role setelah login sukses.
 *
 * Kosakata role di sini WAJIB sama persis dengan backend
 * (database/seeders/DatabaseSeeder.php:45-61 di SixAgoBeV2):
 *   Super Admin · Finance Approver · Division Head · Line Manager · Employee
 *
 * Saat ini kelima role mendarat di /admin, karena variance per role sudah
 * ditangani di dalam halaman tersebut:
 *   - KPI dashboard  : roleKey di app/pages/admin/index.vue
 *   - visibilitas nav: app/layouts/admin.vue
 *   - tombol aksi    : canDecideQueue / canFinance / isSuperAdmin
 *
 * TODO: konfirmasi landing /app untuk role Employee — route /app belum ada.
 */
const ROLE_HOME: Record<string, string> = {
  'Super Admin': '/admin',
  'Finance Approver': '/admin',
  'Division Head': '/admin',
  'Line Manager': '/admin',
  Employee: '/admin',
}

/** Role di luar daftar (mis. role kustom dari /admin/management/departments) tetap dapat dashboard. */
export function resolveHomePath(role?: string | null): string {
  if (!role) return '/admin'
  return ROLE_HOME[role] ?? '/admin'
}
