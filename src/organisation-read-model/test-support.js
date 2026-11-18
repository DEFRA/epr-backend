import { createInMemoryOrganisationReadRepository } from './repository/inmemory.js'

/** @import { OrganisationReadRepository } from './repository/port.js' */

/**
 * What other modules' tests use to stand up and seed the organisation read
 * model.
 */

export { createInMemoryOrganisationReadRepository }
export { createInMemoryOrganisationReadRepositoryPlugin } from './repository/inmemory.plugin.js'
export { createOrganisationReadRepository } from './repository/mongodb.js'
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
