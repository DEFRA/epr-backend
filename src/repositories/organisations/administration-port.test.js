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
  'src/server/queue-consumer/queue-consumer.plugin.js',

  // Organisation administration
  'src/organisations/routes/get-by-id.js',
  'src/organisations/routes/put-by-id.js',

  // Registration and accreditation administration
  'src/registration-accreditation-admin/find-accreditation-by-id.js',
  'src/registration-accreditation-admin/repository/inmemory.js',
  'src/registration-accreditation-admin/repository/inmemory.plugin.js',
  'src/registration-accreditation-admin/routes/accreditation-status-history.js',
  'src/registration-accreditation-admin/routes/overseas-sites-accreditation-list.js',
  'src/registration-accreditation-admin/routes/overseas-sites-registration-list.js',
  'src/registration-accreditation-admin/routes/registration-status-history.js',
  'src/overseas-sites/application/process-import-file.js',
  'src/overseas-sites/application/process-import.js',
  'src/server/queue-consumer/ors-import-commands.js',

  // System log search
  'src/system-logs/routes/get-search.js',

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
  'src/server/seed/seed-scenarios.js'
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
