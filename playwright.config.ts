import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Só specs são do Playwright; *.test.ts em e2e/helpers/__tests__ é do vitest.
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 1,
  // Guard de produção (G2): aborta a suíte antes de qualquer request se
  // alguma env de API (VITE_URL_DATABASE/VITE_URL_FILES/VITE_PALCO_API_URL/
  // VITE_API_FALLBACK_URLS) apontar para api.pianolouvorja.com.br.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    port: 5174,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
