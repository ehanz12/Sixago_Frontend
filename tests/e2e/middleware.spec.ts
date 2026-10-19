import { expect, test } from '@playwright/test'
import { gotoAndHydrate } from './helpers'

/**
 * Penjaga route (middleware/auth.global.ts) tanpa sesi.
 * Setiap halaman terproteksi harus berakhir di /login.
 */
const PROTECTED = [
  '/admin',
  '/admin/travel-requests',
  '/admin/travel-requests/create',
  '/admin/approval-queue',
  '/admin/uang-muka',
  '/admin/reimbursement',
  '/admin/notifications',
  '/admin/management/users',
  '/admin/management/delegation',
  '/password',
  '/profil',
]

test.describe('Middleware tanpa sesi', () => {
  for (const path of PROTECTED) {
    test(`${path} → /login`, async ({ page }) => {
      await gotoAndHydrate(page, path)
      await expect(page).toHaveURL(/\/login$/, { timeout: 15000 })
    })
  }

  test('/login dapat diakses tanpa sesi', async ({ page }) => {
    await gotoAndHydrate(page, '/login')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('#corporateId')).toBeVisible()
  })
})
