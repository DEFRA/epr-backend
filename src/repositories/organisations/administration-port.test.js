import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '../../..')

const NOT_PRODUCTION_CODE =
  /\.test\.js$|\.contract\.js$|test-helpers\.js$|\/contract\/|^src\/test\//

const USES_ADMINISTRATION_PORT =
  /organisationAdministrationRepository|organisations\/(administration-)?port\.js/

const ADMINISTRATION_PORT_MODULES = [
  // Wiring
  'src/common/hapi-types.js',
  'src/non-prod-data-reset/mongodb.plugin.js',
  'src/repositories/form-submissions/mongodb.plugin.js',

  // Registration and accreditation administration
  'src/overseas-sites/application/process-import-file.js',
  'src/overseas-sites/application/process-import.js',
  'src/routes/v1/organisations/accreditation-status-history.js',
  'src/routes/v1/organisations/get-by-id.js',
  'src/routes/v1/organisations/put-by-id.js',
  'src/routes/v1/organisations/registration-status-history.js',
  'src/routes/v1/system-logs/get-search.js',
  'src/server/queue-consumer/ors-import-commands.js',

  // Data loading, seeding, resets and diagnostics
  'src/forms-submission-data/migration/migration-delta-calculator.js',
  'src/forms-submission-data/migration/migration-orchestrator.js',
  'src/forms-submission-data/migration/organisation-persistence.js',
  'src/non-prod-data-reset/mongodb.js',
  'src/repositories/form-submissions/mongodb.js',
  'src/routes/v1/dev/form-submissions/migrate/post.js',
  'src/routes/v1/dev/organisations/registrations/summary-logs/post.js',
  'src/server/run-forms-data-migration.js',
  'src/server/seed/create-seed-data.js',
  'src/server/seed/seed-scenarios.js',
  'src/summary-log-scope-backfill/application/backfill.js',
  'src/summary-log-scope-backfill/run.js',

  // Domain code that still reads the legacy organisation shape. Each leaves
  // this list once it reads through the organisation read repository.
  'src/application/summary-logs/classify-and-persist.js',
  'src/application/summary-logs/validate.js',
  'src/application/waste-records/resolve-overseas-sites.js',
  'src/market-insights/application/outstanding-returns.js',
  'src/market-insights/application/read-figures.js',
  'src/market-insights/application/reprocessor-exporter-table.js',
  'src/market-insights/application/waste-balance-table.js',
  'src/market-insights/routes/export-zip-get.js',
  'src/market-insights/routes/outstanding-returns-get.js',
  'src/market-insights/routes/reprocessor-exporter-figures-get.js',
  'src/market-insights/routes/waste-balance-get.js',
  'src/market-insights/routes/workbook-get.js',
  'src/overseas-sites/routes/accreditation-list.js',
  'src/overseas-sites/routes/registration-list.js',
  'src/packaging-recycling-notes/routes/list.js',
  'src/routes/organisations/at-natural-keys.js',
  'src/routes/organisations/natural-keys.js',
  'src/server/queue-consumer/summary-log-commands.js',
  'src/server/queue-consumer/summary-log-handler-deps.js'
]

const productionModules = () =>
  readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.js'))
    .map((path) => relative(ROOT, join(ROOT, 'src', path)))
    .filter((path) => !NOT_PRODUCTION_CODE.test(path))
    .filter((path) => !path.startsWith('src/repositories/organisations/'))

describe('the organisation administration port', () => {
  it('is used only by the modules allowed to see unnumbered registrations and accreditations', () => {
    const users = productionModules().filter((path) =>
      USES_ADMINISTRATION_PORT.test(readFileSync(join(ROOT, path), 'utf8'))
    )

    expect(users.sort()).toEqual([...ADMINISTRATION_PORT_MODULES].sort())
  })
})
