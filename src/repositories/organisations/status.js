/** @import {RegAccStatus} from '#domain/organisations/model.js' */

/**
 * @returns {RegAccStatus}
 */
export const getCurrentStatus = (item) => item.statusHistory.at(-1).status
