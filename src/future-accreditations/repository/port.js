/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { AccreditationCommon } from '#organisation-read-model/domain/model.js' */

/**
 * A registration's accreditation for a year the REEX database does not hold
 * accreditations for.
 *
 * @typedef {AccreditationCommon & {
 *   registrationNumber: RegistrationNumber
 *   year: Year
 * }} FutureAccreditation
 */

/**
 * @typedef {{
 *   findByRegistrationNumbers: (registrationNumbers: RegistrationNumber[]) => Promise<FutureAccreditation[]>
 *   remove: (registrationNumber: RegistrationNumber, year: Year) => Promise<FutureAccreditation | null>
 *   upsert: (accreditation: FutureAccreditation) => Promise<FutureAccreditation>
 * }} FutureAccreditationsRepository
 */

/**
 * @typedef {() => FutureAccreditationsRepository} FutureAccreditationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
