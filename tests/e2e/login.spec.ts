import { expect, test } from '@playwright/test'
import { gotoAndHydrate } from './helpers'

/**
 * Halaman /login — interaksi form asli terhadap backend hidup.
 * Tidak menggunakan storageState (konteks segar = belum login).
 */
test.describe('Login', () => {
  test('merender sesuai desain: judul, form, tombol, background', async ({ page }) => {
    await gotoAndHydrate(page, '/login')

    await expect(page.getByRole('heading', { name: 'Masuk ke SixAgo Portal' })).toBeVisible()
    await expect(page.getByText('ENTERPRISE GOVERNANCE')).toBeVisible()
    await expect(page.locator('#corporateId')).toBeVisible()
    await expect(page.locator('#passwordField')).toBeVisible()
    await expect(page.getByRole('button', { name: /Masuk ke Akun/ })).toBeVisible()
    await expect(page.getByText('Lupa Password?')).toBeVisible()
    await expect(page.getByText('Tersertifikasi')).toBeVisible()
    await expect(page.getByAltText('SixAgo Brand Logo')).toBeVisible()

    // Background ilustrasi ter-load (bukan kartu putih lama).
    const bg = await page.evaluate(() => {
      const el = document.querySelector('[aria-hidden="true"].absolute.inset-0')
      return el ? getComputedStyle(el).backgroundImage : ''
    })
    expect(bg).toContain('login-bg.svg')
  })

  test('submit kosong menampilkan toast peringatan, bukan memanggil API', async ({ page }) => {
    let apiCalled = false
    await page.route('**/api/login', (route) => {
      apiCalled = true
      return route.continue()
    })
    await gotoAndHydrate(page, '/login')
    await page.getByRole('button', { name: /Masuk ke Akun/ }).click()

    await expect(page.getByRole('status')).toContainText('Lengkapi Email/NIK dan Kata Sandi')
    expect(apiCalled).toBe(false)
  })

  test('kredensial salah menampilkan toast error', async ({ page }) => {
    await gotoAndHydrate(page, '/login')
    await page.locator('#corporateId').fill('tidak@ada.co.id')
    await page.locator('#passwordField').fill('salahsekali')
    await page.getByRole('button', { name: /Masuk ke Akun/ }).click()

    // Backend mengembalikan { message: 'Invalid credentials' } (401).
    await expect(page.getByRole('status')).toContainText(/Invalid credentials|kata sandi salah/)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('toggle tampil/sembunyi password bekerja', async ({ page }) => {
    await gotoAndHydrate(page, '/login')
    const field = page.locator('#passwordField')
    await expect(field).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: /Tampilkan password/ }).click()
    await expect(field).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: /Sembunyikan password/ }).click()
    await expect(field).toHaveAttribute('type', 'password')
  })

  test('/admin/login dialihkan ke /login', async ({ page }) => {
    await gotoAndHydrate(page, '/admin/login')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Masuk ke SixAgo Portal' })).toBeVisible()
  })

  test('login sukses sebagai Employee mendarat di dashboard', async ({ page }) => {
    await gotoAndHydrate(page, '/login')
    await page.locator('#corporateId').fill('budi@nusantara.co.id')
    await page.locator('#passwordField').fill('password123')
    await page.getByRole('button', { name: /Masuk ke Akun/ }).click()

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15000 })
    // localStorage terisi oleh stores/app.ts:persist.
    const token = await page.evaluate(() => localStorage.getItem('sixago_token_v2'))
    expect(token).toBeTruthy()
  })
})
