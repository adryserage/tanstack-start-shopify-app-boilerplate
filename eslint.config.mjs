//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  ...tanstackConfig,
  globalIgnores([
    '**/generated/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/public/**',
    '**/extensions/**',
    '**/scripts/**',
    '**/.**/**',
  ]),
  {
    rules: {
      'no-shadow': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
])
