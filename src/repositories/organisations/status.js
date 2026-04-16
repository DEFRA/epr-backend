/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation, RegAccStatus} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * @param {Organisation|Registration|Accreditation} item
 * @returns {RegAccStatus}
 */
export const getCurrentStatus = (item) => item.statusHistory.at(-1).status
