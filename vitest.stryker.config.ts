import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': path.resolve(__dirname, './src/app'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@design-system': path.resolve(__dirname, './src/design-system'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@themes': path.resolve(__dirname, './src/design-system/themes'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@locales': fileURLToPath(new URL('./src/locales', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup-stryker.ts'],
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/__tests__/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'site/**',
      'dist/**',
      '.stryker-tmp/**',
    ],
  },
})
