import vitest from '@vitest/eslint-plugin'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import nodePlugin from 'eslint-plugin-n'
import { globalIgnores } from 'eslint/config'
import { neostandard, resolveIgnoresFromGitignore } from 'neostandard'

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

// A module of ADR 0027's modular monolith lives at src/<module>/. Code outside
// it imports only the entry points its README names. Only code in src/server,
// src/plugins and src/test imports its plugin.js, and only a test imports its
// test-support.js.
/**
 * @param {string} module
 * @param {string} name
 * @param {string[]} entryPoints
 * @returns {object[]} the module's no-restricted-paths zones
 */
const moduleFence = (module, name, entryPoints) => [
  {
    target: [
      `./src/!(${module})/**/*`,
      './src/*.js',
      './.vite/**/*',
      './scripts/**/*',
      './benchmarks/**/*'
    ],
    from: `./src/${module}`,
    except: entryPoints,
    message: `Import ${name} only through the entry points its README names.`
  },
  {
    target: [
      `./src/!(${module}|server|plugins|test)/**/*`,
      './src/*.js',
      './.vite/**/*',
      './scripts/**/*',
      './benchmarks/**/*'
    ],
    from: `./src/${module}/plugin.js`,
    message: `Only code in src/server, src/plugins and src/test imports ${name} through plugin.js.`
  },
  {
    target: [
      './src/!(test)/**/!(*.test|*.contract|*-test-helpers|test-fixtures|test-support).js',
      './src/!(*.test).js',
      './scripts/**/!(*.test).*',
      './benchmarks/**/*'
    ],
    from: `./src/${module}/test-support.js`,
    message: `Only tests import ${name} through test-support.js.`
  }
]

const ns = neostandard({
  env: ['node', 'vitest'],
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
  globalIgnores(resolveIgnoresFromGitignore()),
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
            },
            ...moduleFence(
              'organisation-read-model',
              'the organisation read model',
              ['./index.js', './plugin.js', './test-support.js']
            ),
            ...moduleFence(
              'packaging-recycling-notes',
              'packaging recycling notes',
              ['./index.js', './plugin.js', './test-support.js']
            ),
            ...moduleFence('waste-records-export', 'the waste records export', [
              './index.js',
              './plugin.js',
              './test-support.js'
            ]),
            ...moduleFence(
              'registration-accreditation-admin',
              'the registration and accreditation admin module',
              ['./index.js', './test-support.js']
            )
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
    files: ['src/**/*.js'],
    ignores: [
      '**/*.test.js',
      '**/*.contract.js',
      '**/contract/test-data.js',
      '**/*test-helpers.js',
      // These read a year out of a date or string, so mint it.
      'src/common/helpers/dates/year-month.js',
      'src/domain/summary-logs/template-year.js',
      'src/domain/summary-logs/table-schemas/index.js',
      'src/reports/domain/period-for-date.js',
      'src/routes/organisations/get.organisation.js',
      'src/waste-balances/application/read-model-accreditations.js'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/dates/year.js'],
              importNames: ['toYear'],
              message:
                'Type a yearSchema-validated param as Year, or read one from a date with utcYearOf or currentUtcYear.'
            }
          ]
        }
      ]
    }
  },
  {
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      // SonarCloud asks for a deliberately un-awaited promise to be marked with `void`.
      'no-void': ['error', { allowAsStatement: true }],
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
