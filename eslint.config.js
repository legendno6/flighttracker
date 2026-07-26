import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Leading-underscore params/vars mark intentionally-unused values throughout
// this codebase (e.g. GoogleProvider.ts's `_request`, productionServer.ts's
// `_req`) — tsc's `noUnusedParameters` already treats that as the "I know,
// it's unused on purpose" signal, so ESLint's own unused-vars rule is
// configured to agree rather than flagging every one of them separately.
const unusedVarsRule = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }];

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['server/**/*.ts', 'api/**/*.ts', 'vite.config.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
    },
  },
);
