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

const testSupport =
  /\.contract\.js$|test-helpers|^\.vite\/(fixtures|helpers)\/|^src\/test\//

/** Sets `MONGO_URI` before every use, so a stale value cannot leak. */
const trustedTestSupport = new Set(['.vite/fixtures/mongo.js'])

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
      (target) =>
        target &&
        testSupport.test(target) &&
        !trustedTestSupport.has(target) &&
        existsSync(target)
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

const appTestFiles = '{src,.vite}/**/*.test.js'

export const testFilePatterns = [appTestFiles, 'scripts/**/*.test.mjs']

/**
 * Test files that neither mock modules nor change config, env or globals,
 * directly or through a shared contract or test helper, so they can share one
 * module graph per worker. Every other test file, including one created after
 * the config loaded (in watch mode), keeps a fresh module graph per file.
 */
export const sharedTestFiles = globSync(appTestFiles).filter(
  (file) => !needsIsolation(file)
)
