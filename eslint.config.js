import vitest from '@vitest/eslint-plugin'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import nodePlugin from 'eslint-plugin-n'
import neostandard from 'neostandard'

const REPOSITORIES = './src/repositories'

// The domain sits at the centre of the application. Code in an outer layer
// imports inwards to it, and it never imports back out.
const OUTER_LAYERS = [
  './src/adapters',
  './src/application',
  './src/plugins',
  REPOSITORIES,
  './src/routes',
  './src/server'
]

const DOMAIN_LAYERING_MESSAGE =
  'The domain must not import from an outer layer. Move the shared code into the domain, or pass it in.'

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

// neostandard already registers the `n` plugin, so drop the duplicate `plugins`
// key from eslint-plugin-n's recommended config (v18+ errors on redefinition)
const { plugins: _n, ...nodeRecommendedModule } =
  nodePlugin.configs['flat/recommended-module']

export default [
  ...ns,
  nodeRecommendedModule,
  {
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()]
    },
    rules: {
      'import-x/default': 'error',
      'import-x/named': 'error',
      'import-x/namespace': 'error',
      // 'import-x/no-unused-modules': 'error', is broken with flat config: https://github.com/import-js/eslint-plugin-import/issues/3079 (to enable when it's fixed! ☺️)
      'import-x/no-cycle': 'error',
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/domain',
              from: OUTER_LAYERS.filter((layer) => layer !== REPOSITORIES),
              message: DOMAIN_LAYERING_MESSAGE
            },
            {
              target: './src/domain',
              from: REPOSITORIES,
              // Tests in the domain build fixtures from the repository contract
              // test data. Nothing else in a repository is available to it.
              except: ['./organisations/contract'],
              message: DOMAIN_LAYERING_MESSAGE
            }
          ]
        }
      ]
    }
  },
  {
    files: ['.vite/**/*.js', '**/*.contract.js', 'benchmarks/**/*.js'],
    rules: {
      'n/no-unpublished-import': 'off'
    }
  },
  {
    files: ['**/*.test.js', '**/*.contract.js'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expect*'] }
      ]
    },
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
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  }
]
