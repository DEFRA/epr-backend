import { accreditationStatusHistory } from './routes/accreditation-status-history.js'
import { devOrganisationsPutById } from './routes/dev-put-by-id.js'
import { organisationsGetById } from './routes/get-by-id.js'
import { accreditationOverseasSitesList } from './routes/overseas-sites-accreditation-list.js'
import { registrationOverseasSitesList } from './routes/overseas-sites-registration-list.js'
import { organisationsPutById } from './routes/put-by-id.js'
import { registrationStatusHistory } from './routes/registration-status-history.js'

export const registrationAccreditationAdminRoutes = [
  organisationsGetById,
  organisationsPutById,
  registrationStatusHistory,
  accreditationStatusHistory,
  registrationOverseasSitesList,
  accreditationOverseasSitesList
]

export const registrationAccreditationAdminDevRoutes = [devOrganisationsPutById]
