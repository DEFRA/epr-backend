import { portAdapter } from '#plugins/port-adapter.js'
import { createRegistrationAccreditationAdminRepository } from './repository/mongodb.js'
import { accreditationStatusHistory } from './routes/accreditation-status-history.js'
import { accreditationOverseasSitesList } from './routes/overseas-sites-accreditation-list.js'
import { registrationOverseasSitesList } from './routes/overseas-sites-registration-list.js'
import { registrationStatusHistory } from './routes/registration-status-history.js'

export const registrationAccreditationAdminRoutesPlugin = {
  name: 'registration-accreditation-admin-routes',
  /** @param {import('#common/hapi-types.js').HapiServer} server */
  register: (server) => {
    server.route([
      registrationStatusHistory,
      accreditationStatusHistory,
      registrationOverseasSitesList,
      accreditationOverseasSitesList
    ])
  }
}

/** The MongoDB adapter for the registration and accreditation admin repository. */
export const registrationAccreditationAdminRepositoryPlugin = portAdapter({
  provides: 'registrationAccreditationAdminRepository',
  needs: ['mongodb'],
  build: (_options, { mongodb }) =>
    createRegistrationAccreditationAdminRepository(mongodb)
})
