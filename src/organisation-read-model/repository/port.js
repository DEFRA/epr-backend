/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * @typedef {Object} OrganisationReadRepository
 * @property {(organisationNumber: OrganisationNumber) => Promise<Organisation | null>} findByOrganisationNumber
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
