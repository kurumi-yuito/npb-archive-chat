import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      '**/nuxt.config.ts',
      '**/vitest.config.ts',
      '**/vitest.workspace.ts',
      'eslint.config.mjs',
      'scripts/**/*.mjs',
      'apps/web/server/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        defineEventHandler: 'readonly',
        getQuery: 'readonly',
        useRuntimeConfig: 'readonly',
      },
    },
  },
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
)
