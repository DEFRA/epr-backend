/**
 * The organisation read model's public interface. Code outside the module
 * imports from here, or from `test-support.js` in a test, and from no other
 * file in it.
 */

export * from './domain/model.js'
export * from './domain/accreditation-for-year.js'
export * from './domain/organisation-years.js'
export * from './domain/registration-active-in-year.js'
export * from './domain/registration-standing.js'
export * from './domain/registration-status-windows.js'
export * from './domain/status-timeline.js'

export * from './repository/port.js'
export { organisationReadRepositoryPlugin } from './repository/mongodb.plugin.js'
export {
  servesOrganisationOn,
  toLinkedDefraOrganisation
} from './repository/to-read-model.js'

export * from './registration-service/stand-in/port.js'
export { mongoExternalAccreditationsRepositoryPlugin } from './registration-service/stand-in/mongodb.plugin.js'
export { deleteStandInAccreditationsOf } from './registration-service/stand-in/mongodb.js'
export { devExternalAccreditationPut } from './registration-service/stand-in/dev-put.js'
