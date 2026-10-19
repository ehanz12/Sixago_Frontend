import { defineConfig, devices } from '@playwright/test'

/**
 * E2E SixAgo — READ-ONLY terhadap database.
 *
 * Tidak ada spec yang membuat/mengubah/menghapus data bisnis (create, approve,
 * delete). Semua mutasi diuji di Laravel Feature test (tests/Feature di
 * SixAgoBeV2) yang terisolasi di sqlite in-memory.
 *
 * Data demo (budi/hendra/michael/ratna/admin@sixago.local, password123)
 * diasumsikan ada di database be-Six.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial: backend `php artisan serve` single-threaded dan route /login
  // di-throttle 10x/menit per IP — paralel hanya menimbulkan 429 & timeout palsu.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Tanpa globalSetup: sesi dibangun via form login per test (loginAs).
  // storageState tidak dipakai karena server SSR tidak bisa membaca localStorage,
  // dan 5 login API di setup hanya menghabiskan jatah throttle (10/menit).
  webServer: [
    {
      command: 'php artisan serve --host=127.0.0.1 --port=8000',
      cwd: 'C:\\Development\\PHP\\SixAgoBeV2',
      url: 'http://127.0.0.1:8000/up',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 3000',
      url: 'http://127.0.0.1:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      stdout: 'pipe',
    },
  ],
})
