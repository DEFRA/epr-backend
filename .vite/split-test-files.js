import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const leaksState =
  /vi\.(mock|doMock)\(|config\.set\(|process\.env\.[A-Z_]+ *=|vi\.stubEnv|vi\.stubGlobal/

const leaksStateUndetected = new Set([
  '.vite/fixtures/server-with-mock-db.test.js',
  '.vite/setup-msw.test.js',
  'src/application/waste-records/sync-from-summary-log.test.js',
  'src/waste-records/application/project-summary-log-row-state.test.js'
])

const testSupport = /\.contract\.js$|test-helpers/

const aliases = Object.entries(
  JSON.parse(readFileSync('package.json', 'utf8')).imports
).map(([from, to]) => [from.replace('*', ''), to.replace('*', '')])

const resolveImport = (fromFile, specifier) => {
  const alias = aliases.find(([prefix]) => specifier.startsWith(prefix))
  if (alias) {
    return path.normalize(specifier.replace(alias[0], alias[1]))
  }
  return specifier.startsWith('.')
    ? path.join(path.dirname(fromFile), specifier)
    : null
}

const testSupportImportsOf = (file) =>
  [
    ...readFileSync(file, 'utf8').matchAll(
      /from '([^']+)'|import\('([^']+)'\)/g
    )
  ]
    .map(([, from, dynamic]) => resolveImport(file, from ?? dynamic))
    .filter(
      (target) => target && testSupport.test(target) && existsSync(target)
    )

const reachesLeak = (file, seen = new Set()) => {
  if (seen.has(file)) {
    return false
  }
  seen.add(file)
  return (
    leaksState.test(readFileSync(file, 'utf8')) ||
    testSupportImportsOf(file).some((target) => reachesLeak(target, seen))
  )
}

const needsIsolation = (file) =>
  leaksStateUndetected.has(file) || reachesLeak(file)

const testFiles = globSync('{src,.vite}/**/*.test.js')

/**
 * Test files that mock modules or change config, env or globals, directly or
 * through a shared contract or test helper, keep a fresh module graph per
 * file; the rest share one per worker.
 */
export const isolatedTestFiles = [
  ...testFiles.filter(needsIsolation),
  'scripts/**/*.test.mjs'
]

export const sharedTestFiles = testFiles.filter((file) => !needsIsolation(file))
