import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryRegistrationAccreditationAdminRepository } from './inmemory.js'

/**
 * The in-memory adapter, over whichever organisations repository the test
 * server holds, so a test that seeds organisations through that repository
 * reaches them through the admin routes. It is not made with `portAdapter`,
 * because the organisations repository's plugin is not named after the port
 * this adapter needs.
 */
export const createInMemoryRegistrationAccreditationAdminRepositoryPlugin =
  () => ({
    name: 'registrationAccreditationAdminRepository',
    version: '1.0.0',
    dependencies: ['organisationsRepository'],
    /** @param {import('@hapi/hapi').Server & import('#common/hapi-types.js').HapiServer} server */
    register: (server) => {
      registerDependency(
        server,
        'registrationAccreditationAdminRepository',
        createInMemoryRegistrationAccreditationAdminRepository(
          server.app.organisationAdministrationRepository
        )
      )
    }
  })
