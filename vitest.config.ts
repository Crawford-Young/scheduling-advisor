import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
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
        'src/lib/redis.ts',
        'src/lib/logger.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
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
  server: {
    deps: {
      inline: ['@crawfordyoung/ui', /@radix-ui\/.*/],
    },
  },
})
