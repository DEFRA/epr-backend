import { accreditationStatusHistory } from './routes/accreditation-status-history.js'
import { accreditationOverseasSitesList } from './routes/overseas-sites-accreditation-list.js'
import { registrationOverseasSitesList } from './routes/overseas-sites-registration-list.js'
import { registrationStatusHistory } from './routes/registration-status-history.js'

export const registrationAccreditationAdminRoutes = [
  registrationStatusHistory,
  accreditationStatusHistory,
  registrationOverseasSitesList,
  accreditationOverseasSitesList
]

export { registrationAccreditationAdminRepositoryPlugin } from './repository/mongodb.plugin.js'

/** @typedef {import('./repository/port.js').RegistrationAccreditationAdminRepository} RegistrationAccreditationAdminRepository */
