import { defineConfig, globalIgnores } from 'eslint/config'
import { fixupConfigRules } from '@eslint/compat'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import * as espree from 'espree'

export default defineConfig([
  ...fixupConfigRules(nextVitals),
  {
    // eslint-config-next's bundled Babel parser ships an eslint-scope copy
    // without addGlobals(), which crashes under ESLint 10 — use espree for JS.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { parser: espree },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  {
    rules: {
      'no-console': 'error',
    },
  },
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'storybook-static/**',
    'next-env.d.ts',
  ]),
])
