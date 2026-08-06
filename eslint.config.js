import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/vite.config.ts.timestamp*',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.config.{js,ts}', 'apps/api/src/seed/**', 'apps/api/tests/**', '**/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.mjs', '**/scripts/**'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
