/**
 * Peta halaman → role yang boleh masuk (selain Super Admin yang bebas semua).
 *
 * Harus cermin dengan routes/api.php di backend (SixAgoBeV2): frontend hanya
 * menyembunyikan UI, penolakan sesungguhnya tetap 403 dari CheckRole middleware.
 * Setiap aturan di bawah mencerminkan ->middleware('role:...') yang ada di backend.
 */
const ROLE_ROUTES: { prefix: string; roles: string[] }[] = [
// Delegasi boleh dipakai oleh delegator-nya sendiri (DelegationController — delegator
// harus role approver), dan Finance Approver juga berwenang (Level 3), jadi kedua
// halaman ini TIDAK ikut di bawah /admin/management yang khusus Super Admin.
{ prefix: '/admin/management/delegation', roles: ['Line Manager', 'Division Head', 'Finance Approver', 'Super Admin'] },
  { prefix: '/admin/management', roles: ['Super Admin'] },
  { prefix: '/admin/approval-queue', roles: ['Line Manager', 'Division Head', 'Finance Approver'] },
  // /admin/uang-muka & /admin/reimbursement: terbuka semua role. Backend sudah
  // men-scope daftar (visibleUserIds) dan membatasi aksi tulis: create hanya
  // untuk travel milik sendiri (Advance/ReimbursementController@store),
  // decide/disburse/verify hanya Finance Approver & Super Admin (role:...).
  // Halaman meng-gate tiap tombol via canFinance.
]

/**
 * Halaman universal (semua role) yang TIDAK berada di bawah /admin, jadi tidak
 * tertangkap cek awalan '/admin' pada baris di bawah. Tetap wajib login.
 */
const PROTECTED_PATHS = ['/password', '/profil']

export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/') return
  const app = useAppStore()
  app.hydrate()

  const isProtected = to.path.startsWith('/admin') || PROTECTED_PATHS.includes(to.path)
  if (isProtected && to.path !== '/admin/login' && !app.isAuthenticated) {
    return navigateTo('/login')
  }
  if (app.isAuthenticated && app.mustChangePassword && to.path !== '/password' && to.path !== '/login') {
    return navigateTo('/password')
  }
  if (app.isAuthenticated && app.user?.role !== 'Super Admin') {
    const rule = ROLE_ROUTES.filter(r => to.path === r.prefix || to.path.startsWith(r.prefix + '/'))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]
    if (rule && !app.hasRole(...rule.roles)) {
      return navigateTo('/admin')
    }
  }
})
