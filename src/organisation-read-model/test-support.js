import { createInMemoryOrganisationReadRepository } from './repository/inmemory.js'
import { createOrganisationReadRepository } from './repository/mongodb.js'
import { standInRegistrationService } from './registration-service/stand-in/mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { OrganisationReadRepository } from './repository/port.js' */

/**
 * What other modules' tests use to stand up and seed the organisation read
 * model.
 */

export { createInMemoryOrganisationReadRepository }
export { createInMemoryOrganisationReadRepositoryPlugin } from './repository/inmemory.plugin.js'
export * from './repository/read-model-test-data.js'
export {
  ACCREDITATION_NUMBER,
  EXPORTER_ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  approvedOverseasSite,
  exporter,
  exporterAccreditation,
  granted,
  pendingOverseasSite,
  reprocessor
} from './repository/contract/organisation-read-test-helpers.js'
export { buildExternalAccreditation } from './repository/contract/test-data.js'
export { createMongoExternalAccreditationsRepository } from './registration-service/stand-in/mongodb.js'
export * from './registration-service/stand-in/test-helpers.js'

/**
 * An organisation read repository that serves no organisations.
 *
 * @returns {OrganisationReadRepository}
 */
export const emptyOrganisationReadRepository = () =>
  createInMemoryOrganisationReadRepository()()

/**
 * The MongoDB organisation read repository, with the stand-in as its
 * registration service.
 *
 * @param {Db} db
 */
export const createOrganisationReadRepositoryOnStandIn = (db) =>
  createOrganisationReadRepository(db, standInRegistrationService(db))
