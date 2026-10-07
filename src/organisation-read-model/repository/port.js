/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

/**
 * @typedef {Object} OrganisationReadRepository
 * @property {(organisationNumber: number) => Promise<Organisation | null>} findByOrganisationNumber
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
