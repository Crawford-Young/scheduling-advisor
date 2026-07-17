import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/app/**',
        'src/components/providers/**',
        'src/auth.ts',
        'src/env.ts',
        'src/middleware.ts',
        'src/db/index.ts',
        'src/db/schema.ts',
        'src/db/migrations/**',
        'src/lib/redis.ts',
        'src/lib/logger.ts',
        'src/lib/ai.ts',
        'src/lib/stripe.ts',
        'src/lib/chat/system-prompt.ts',
        'src/proxy.ts',
        'src/trigger/**',
        'src/components/activity/activity-settings-menu.tsx',
      ],
      thresholds: {
        statements: 99,
        branches: 97,
        functions: 100,
        lines: 99,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
})
