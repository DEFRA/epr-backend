import vitest from '@vitest/eslint-plugin'
import nodePlugin from 'eslint-plugin-n'
import neostandard from 'neostandard'

const ns = neostandard({
  env: ['node', 'vitest'],
  ignores: [...neostandard.resolveIgnoresFromGitignore()],
  noJsx: true,
  noStyle: true
})

// Fix to override ecmaVersion for import attributes support, see related issue:
// https://github.com/neostandard/neostandard/issues/307
for (const item of ns) {
  if (item?.languageOptions?.ecmaVersion < 2025) {
    item.languageOptions.ecmaVersion = 2025
  }
}

export default [
  ...ns,
  nodePlugin.configs['flat/recommended-module'],
  {
    files: ['.vite/**/*.js', '**/*.contract.js', 'benchmarks/**/*.js'],
    rules: {
      'n/no-unpublished-import': 'off'
    }
  },
  {
    files: ['**/*.test.js', '**/*.contract.js'],
    plugins: { vitest },
    rules: vitest.configs.recommended.rules,
    settings: {
      vitest: {
        vitestImports: [/#vite\/fixtures\//]
      }
    }
  },
  {
    files: ['**/*.contract.js'],
    rules: {
      'vitest/no-standalone-expect': [
        'error',
        { additionalTestBlockFunctions: ['it', 'test', 'it.for'] }
      ]
    }
  },
  {
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  }
]
