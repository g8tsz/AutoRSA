/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['out/**', 'release/**', 'node_modules/**']
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': 'off'
    }
  }
]
