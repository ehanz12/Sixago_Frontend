import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

/**
 * Satu login per role: asersi menu (layouts/admin.vue) + konten dashboard
 * (roleKey di admin/index.vue) sekaligus. Sengaja tidak dipecah menjadi
 * banyak test agar total login API per run tetap jauh di bawah throttle
 * backend (10x/menit per IP).
 *
 * CATATAN ARSITEKTUR: lihat navigation.spec.ts versi sebelumnya — alur selalu
 * login via form lalu klik client-side, karena server SSR tidak bisa membaca
 * localStorage sehingga navigasi langsung ke URL terproteksi selalu bounce.
 */
test.describe('Employee (Budi)', () => {
  test('menu terbatas + dashboard versi employee', async ({ page }) => {
    await loginAs(page, 'budi@nusantara.co.id')

    const nav = page.locator('aside')
    // Nama aksesibel link = "dashboard Dashboard" (ligatur ikon + teks satu elemen).
    await expect(nav.getByRole('link', { name: /dashboard/i }).first()).toBeVisible()
    await expect(nav.getByText('Approval Queue')).toHaveCount(0)
    // Uang Muka & Reimbursement terbuka semua role (daftar ter-scope backend);
    // yang tetap tersembunyi: Approval Queue + menu Management.
    await expect(nav.getByText('Uang Muka')).toBeVisible()
    await expect(nav.getByText('Reimbursements')).toBeVisible()
    await expect(nav.getByText('Users & Roles')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Pengajuan Saya' })).toBeVisible({ timeout: 15000 })
    // Penolakan hanya lewat jalur approval: tidak ada quick-reject dashboard.
    await expect(page.getByRole('button', { name: 'Tolak atau revisi' })).toHaveCount(0)
    // Detail TR milik sendiri: Ubah + Hapus tampil (Batalkan hanya saat Submitted).
    await page.getByRole('link', { name: 'Lihat detail pengajuan' }).first().click()
    await expect(page).toHaveURL(/\/admin\/travel-requests\/TR-/, { timeout: 15000 })
    // Nama aksesibel mengandung ligatur ikon ("edit_document Ubah").
    await expect(page.getByRole('button', { name: /Ubah/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Hapus/ })).toBeVisible()
  })

  test('dapat membuka Uang Muka tapi aksi finance tersembunyi', async ({ page }) => {
    await loginAs(page, 'budi@nusantara.co.id')
    await page.locator('aside').getByText('Uang Muka').first().click()
    await expect(page).toHaveURL(/\/admin\/uang-muka/, { timeout: 15000 })
    // Tombol pengajuan milik sendiri tampil; tombol finance tidak.
    await expect(page.getByRole('button', { name: /Ajukan Uang Muka Baru/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Otorisasi dan transfer dana/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Setujui pengajuan uang muka/ })).toHaveCount(0)
  })

  test('dapat membuka Reimbursement tapi aksi verifikasi tersembunyi', async ({ page }) => {
    await loginAs(page, 'budi@nusantara.co.id')
    await page.locator('aside').getByText('Reimbursements').first().click()
    await expect(page).toHaveURL(/\/admin\/reimbursement/, { timeout: 15000 })
    await expect(page.getByRole('button', { name: /Ajukan klaim reimbursement/ })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /Verifikasi klaim/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Setujui settlement/ })).toHaveCount(0)
  })
})

test.describe('Finance (Ratna)', () => {
  test('menu keuangan tampil + dashboard versi finance', async ({ page }) => {
    await loginAs(page, 'ratna@nusantara.co.id')

    const nav = page.locator('aside')
    await expect(nav.getByText('Uang Muka')).toBeVisible()
    await expect(nav.getByText('Reimbursements')).toBeVisible()
    await expect(nav.getByText('Users & Roles')).toHaveCount(0)
    await expect(page.getByText(/Verifikasi|Kas Bon/i).first()).toBeVisible({ timeout: 15000 })
  })

  test('dapat membuka Uang Muka via klik sidebar', async ({ page }) => {
    await loginAs(page, 'ratna@nusantara.co.id')
    await page.locator('aside').getByText('Uang Muka').first().click()
    await expect(page).toHaveURL(/\/admin\/uang-muka/, { timeout: 15000 })
  })
})

test.describe('Super Admin', () => {
  test('semua menu tampil', async ({ page }) => {
    await loginAs(page, 'admin@sixago.local')

    const nav = page.locator('aside')
    await expect(nav.getByText('Approval Queue')).toBeVisible()
    await expect(nav.getByText('Uang Muka')).toBeVisible()
    await expect(nav.getByText('Users & Roles').first()).toBeVisible()
  })
})

test.describe('Line Manager (regresi RBAC delegasi)', () => {
  test('dapat membuka Delegasi Approval via klik', async ({ page }) => {
    await loginAs(page, 'hendra@nusantara.co.id')
    await page.locator('aside').getByText('Delegasi Approval').first().click()
    await expect(page).toHaveURL(/\/admin\/management\/delegation/, { timeout: 15000 })
    // Detail TR milik bawahan: bukan owner/SA → Ubah, Hapus, Batalkan
    // Pengajuan hilang; Tolak (jalur decide approver) tetap ada.
    await page.locator('aside').getByText('Travel Requests').first().click()
    await expect(page).toHaveURL(/\/admin\/travel-requests\/?$/, { timeout: 15000 })
    // Baris milik bawahan (Budi), bukan milik Hendra sendiri.
    const row = page.locator('tbody tr', { hasText: 'Budi Santoso' }).first()
    await row.getByRole('link', { name: 'Lihat detail', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/travel-requests\/TR-/, { timeout: 15000 })
    await expect(page.getByRole('button', { name: /Ubah/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Hapus/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Batalkan Pengajuan/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Tolak/ }).first()).toBeVisible()
  })
})
