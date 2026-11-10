/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

/**
 * @typedef {{
 *   remove: (registrationNumber: RegistrationNumber, year: Year) => Promise<ExternalAccreditation | null>
 *   upsert: (accreditation: ExternalAccreditation) => Promise<ExternalAccreditation>
 * }} ExternalAccreditationsRepository
 */

/**
 * @typedef {() => ExternalAccreditationsRepository} ExternalAccreditationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
