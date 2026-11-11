#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'

const TEST_CODE =
  /\.test\.js$|\.contract\.js$|test-helpers|test-fixtures|test-data|\/contract\/|\/fixtures\/|^src\/test\//
const REPOSITORY_FILE = /\/repositor(y|ies)\//
const REPOSITORY_PORT = /\/([^/]*-)?port\.js$/

const DATABASE_ID =
  /(organisation|registration|accreditation)Id|\b(organisationsRepository|organisationRepo)\.findByIds?\(|\b(organisation|registration|accreditation)\.id\b/i
const LEGACY_FIND_ALL =
  /\b(organisationsRepository|organisationRepo)\.findAll\(/
const ROUTE_PATH_PARAMETER =
  /\/\{(organisation|registration|accreditation)Id\}/g
const DIRECT_COLLECTION = /\.collection\(/
const RAW_ID = /\b_id\b/
const OBJECT_ID = /\bObjectId\b/

const SHAPE_MODULE =
  /^src\/domain\/organisations\/(model|registration|accreditation)\.js$/
const SHAPE_TYPE =
  /\b(Organisation|(Registration|Accreditation)(Approved|Other|Base)?|RegistrationOrAccreditation|ReportableRegistration)\b/
const INLINE_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)\.(\w+)/g
const TAG_IMPORT = /@import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
const JSDOC_CONTINUATION = /^\s*\*(?!\/)/gm

/**
 * @param {(line: string) => boolean} counts
 * @returns {(source: string) => number}
 */
const linesWhere = (counts) => (source) =>
  source.split('\n').filter(counts).length

/**
 * @param {string} specifier
 * @param {string} importer
 */
const resolveModule = (specifier, importer) =>
  specifier.startsWith('.')
    ? posix.join(posix.dirname(importer), specifier)
    : specifier.replace(/^#domain\//, 'src/domain/')

/**
 * @param {string} source
 * @param {string} path
 */
const usesStoredShapes = (source, path) => {
  const code = source.replace(JSDOC_CONTINUATION, '')
  /** @param {string} specifier */
  const isShapeModule = (specifier) =>
    SHAPE_MODULE.test(resolveModule(specifier, path))
  return (
    !SHAPE_MODULE.test(path) &&
    ([...code.matchAll(INLINE_IMPORT)].some(
      ([, specifier, name]) => isShapeModule(specifier) && SHAPE_TYPE.test(name)
    ) ||
      [...code.matchAll(TAG_IMPORT)].some(
        ([, names, specifier]) =>
          isShapeModule(specifier) && SHAPE_TYPE.test(names)
      ))
  )
}

/**
 * @typedef {{
 *   label: string,
 *   rule: string,
 *   count: (source: string, path: string) => number
 * }} Measure
 */

/** @type {Measure[]} */
export const MEASURES = [
  {
    label: 'Lines naming a database id',
    rule: 'A line counts when it names `organisationId`, `registrationId` or `accreditationId`, in any case, calls `findById(` or `findByIds(` on the organisations repository, or reads `.id` from an `organisation`, `registration` or `accreditation`. So `findByRegistrationId` counts and `orgId` does not, and finding a PRN, summary log or overseas site by its own id is left out. Route path parameters such as `{organisationId}` are left out, so a route can still carry an id in its URL.',
    count: linesWhere((line) =>
      DATABASE_ID.test(line.replace(ROUTE_PATH_PARAMETER, ''))
    )
  },
  {
    label: 'Lines reaching a collection directly',
    rule: 'A line counts when it calls `.collection(`.',
    count: linesWhere((line) => DIRECT_COLLECTION.test(line))
  },
  {
    label: 'Lines naming `_id`',
    rule: 'A line counts when it names `_id`, the mark of a raw document.',
    count: linesWhere((line) => RAW_ID.test(line))
  },
  {
    label: 'Lines naming `ObjectId`',
    rule: 'A line counts when it names `ObjectId`, the type of a raw document id.',
    count: linesWhere((line) => OBJECT_ID.test(line))
  },
  {
    label: 'Files using the stored organisation shapes',
    rule: 'A file counts when it imports, by any path, the `Organisation`, `Registration` or `Accreditation` type from `src/domain/organisations`, or a variant of one such as `RegistrationApproved` or `RegistrationOrAccreditation`. The three modules that define them are left out.',
    count: (source, path) => (usesStoredShapes(source, path) ? 1 : 0)
  },
  {
    label: 'Files reading every organisation through the legacy repository',
    rule: 'A file counts when it calls `findAll(` on the organisations repository, as `organisationsRepository.findAll(` or `organisationRepo.findAll(`. The match is on the variable name, so a read through another name is not counted. That is deliberate for the organisation validation sweep, `src/server/run-organisation-validation-sweep.js`, which checks the stored data itself and so belongs with the write model. Reads of one organisation and writes through the repository are not counted either.',
    count: (source) => (LEGACY_FIND_ALL.test(source) ? 1 : 0)
  }
]

const SCOPE =
  'Only `.js` files under `src/` are read. Test code is left out: `*.test.js`, `*.contract.js`, and anything under a `contract/`, `fixtures/` or `src/test/` directory or with `test-helpers`, `test-fixtures` or `test-data` in its path. The repository adapters are left out too: any file under a `repository/` or `repositories/` directory, except a port, `port.js` or a file ending `-port.js`, because a port is the boundary these counts guard.'

/** @param {string} path */
const isRepositoryAdapter = (path) =>
  REPOSITORY_FILE.test(path) && !REPOSITORY_PORT.test(path)

/** @param {string} path */
export const isCounted = (path) =>
  path.startsWith('src/') &&
  path.endsWith('.js') &&
  !TEST_CODE.test(path) &&
  !isRepositoryAdapter(path)

/**
 * @param {{ path: string, source: string }[]} files
 * @returns {number[]} one total per measure, in the order of MEASURES
 */
export const measure = (files) =>
  MEASURES.map(({ count }) =>
    files.reduce((total, { path, source }) => total + count(source, path), 0)
  )

/** @param {string} root */
const readRepo = (root) =>
  execFileSync('git', ['-C', root, 'ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter(isCounted)
    .map((path) => ({ path, source: readFileSync(join(root, path), 'utf8') }))

/** @param {number} change */
const describeChange = (change) =>
  change === 0
    ? 'no change'
    : `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}`

/**
 * @param {number[]} head
 * @param {number[]} base
 * @param {string} baseName
 */
export const comment = (head, base, baseName) =>
  [
    '## Database ids and raw documents outside the repository adapters',
    '',
    'Advisory only. These count the code that still handles organisations, registrations and accreditations by database id, works with documents straight from the database, or reads every organisation through the legacy repository instead of the read model. The aim for each is zero.',
    '',
    `| | This pull request | ${baseName} | Change |`,
    '|---|---|---|---|',
    ...MEASURES.map(
      ({ label }, i) =>
        `| ${label} | ${head[i]} | ${base[i]} | ${describeChange(head[i] - base[i])} |`
    ),
    '',
    '<details><summary>How each count works</summary>',
    '',
    SCOPE,
    '',
    ...MEASURES.map(({ label, rule }) => `- **${label}.** ${rule}`),
    '',
    '</details>',
    ''
  ].join('\n')

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [head, base, baseName] = process.argv.slice(2)
  if (!baseName) {
    console.error(
      'Usage: database-id-count.mjs <head dir> <base dir> <base branch>'
    )
    process.exit(1)
  }
  process.stdout.write(
    comment(measure(readRepo(head)), measure(readRepo(base)), baseName)
  )
}
