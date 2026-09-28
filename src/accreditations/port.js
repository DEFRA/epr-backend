/** @import { AccreditationRecord } from './model.js' */

/**
 * Where REEX reads accreditations from. 2026 accreditations are held in
 * `epr-organisations`; 2027 ones will be held by the registration service.
 * Both answer through this port, in the contract's shape.
 *
 * @typedef {Object} AccreditationsSource
 * @property {(params: { registrationId: string, year: number }) => Promise<AccreditationRecord | null>} findForRegistration
 *   The accreditation a registration holds for a year, or null when it holds none
 * @property {(params: { year: number, registrationIds?: string[] }) => Promise<AccreditationRecord[]>} list
 *   Every accreditation held for a year, optionally narrowed to some registrations
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
