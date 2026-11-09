#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TEST_CODE =
  /\.test\.js$|\.contract\.js$|test-helpers|test-fixtures|test-data|\/contract\/|\/fixtures\/|^src\/test\//
const MONGODB_ADAPTER = /mongodb[^/]*$/

const DATABASE_ID = /(organisation|registration|accreditation)Id/i
const ROUTE_PATH_PARAMETER =
  /\/\{(organisation|registration|accreditation)Id\}/g
const DIRECT_COLLECTION = /\.collection\(/
const RAW_ID = /\b_id\b/

const SHAPE_MODULE =
  /domain\/organisations\/(model|registration|accreditation)\.js/
const SHAPE_TYPE = /\b(Organisation|Registration|Accreditation)\b/
const SHAPE_INLINE_IMPORT = new RegExp(
  `import\\(\\s*['"][^'"]*${SHAPE_MODULE.source}['"]\\s*\\)\\.${SHAPE_TYPE.source}`
)
const SHAPE_TAG_IMPORT = new RegExp(
  `@import\\s*\\{([^}]*)\\}\\s*from\\s*['"][^'"]*${SHAPE_MODULE.source}['"]`,
  'g'
)
const JSDOC_CONTINUATION = /^\s*\*(?!\/)/gm

/**
 * @param {(line: string) => boolean} counts
 * @returns {(source: string) => number}
 */
const linesWhere = (counts) => (source) =>
  source.split('\n').filter(counts).length

/**
 * @param {string} source
 * @param {string} path
 */
const usesStoredShapes = (source, path) => {
  const code = source.replace(JSDOC_CONTINUATION, '')
  return (
    !SHAPE_MODULE.test(path) &&
    (SHAPE_INLINE_IMPORT.test(code) ||
      [...code.matchAll(SHAPE_TAG_IMPORT)].some(([, names]) =>
        SHAPE_TYPE.test(names)
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
    rule: 'A line counts when it names `organisationId`, `registrationId` or `accreditationId`, in any case, so `findByRegistrationId` counts and `orgId` does not. Route path parameters such as `{organisationId}` are left out, so a route can still carry an id in its URL.',
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
    label: 'Files using the stored organisation shapes',
    rule: 'A file counts when it imports the `Organisation`, `Registration` or `Accreditation` type from `src/domain/organisations`. The three modules that define them are left out.',
    count: (source, path) => (usesStoredShapes(source, path) ? 1 : 0)
  }
]

const SCOPE =
  'Only `.js` files under `src/` are read. Test code is left out: `*.test.js`, `*.contract.js`, and anything under a `contract/`, `fixtures/` or `src/test/` directory or with `test-helpers`, `test-fixtures` or `test-data` in its path. The MongoDB adapters are left out too: any file whose name contains `mongodb`.'

/** @param {string} path */
export const isCounted = (path) =>
  path.startsWith('src/') &&
  path.endsWith('.js') &&
  !TEST_CODE.test(path) &&
  !MONGODB_ADAPTER.test(path)

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
 * @param {number[]} main
 */
export const comment = (head, main) =>
  [
    '## Database ids and raw documents outside the MongoDB adapters',
    '',
    'Advisory only. These count the code that still handles organisations, registrations and accreditations by database id, or works with documents straight from the database. The aim for each is zero.',
    '',
    '| | This pull request | main | Change |',
    '|---|---|---|---|',
    ...MEASURES.map(
      ({ label }, i) =>
        `| ${label} | ${head[i]} | ${main[i]} | ${describeChange(head[i] - main[i])} |`
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
  const [head, main] = process.argv.slice(2)
  process.stdout.write(
    comment(measure(readRepo(head)), measure(readRepo(main ?? head)))
  )
}
