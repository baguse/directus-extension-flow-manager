import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'images/**',
      'screenshoots/**',
      '*.config.js',
      'main.js',
      'suggest',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        NodeJS: 'readonly',
      },
    },
    rules: {
      // General JavaScript / TypeScript rules
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-catch': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Vue specific rules
      'vue/multi-word-component-names': 'off',
      'vue/no-side-effects-in-computed-properties': 'warn',
      'vue/no-dupe-keys': 'warn',
      'vue/valid-v-for': 'warn',
      'vue/require-default-prop': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'warn',
      'vue/attribute-hyphenation': 'warn',
    },
  },
  prettierConfig,
);
