/** @import {RegOrAccStatus} from '#domain/organisations/model.js' */

/**
 * @returns {RegOrAccStatus}
 */
export const getCurrentStatus = (item) => item.statusHistory.at(-1).status
