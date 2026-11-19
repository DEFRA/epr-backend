/** @import { AccreditationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * The checks the admin routes make before they grant a number. They read the
 * organisations store, which the routes otherwise reach through the
 * administration port.
 *
 * @typedef {Object} RegistrationAccreditationAdminRepository
 * @property {(accreditationNumber: AccreditationNumber) => Promise<boolean>} isAccreditationNumberInUse - Whether any accreditation in any organisation holds this number, regardless of the accreditation's status
 * @property {(registrationNumber: RegistrationNumber) => Promise<boolean>} isRegistrationNumberInUse - Whether any registration in any organisation holds this number, regardless of the registration's status
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
