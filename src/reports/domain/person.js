/**
 * @import { UserSummary } from '#reports/repository/port.js'
 */

/**
 * @typedef {{ name?: string, position: string }} Person
 */

/**
 * @param {UserSummary} user
 * @returns {Person}
 */
export const toPerson = ({ name, position }) => ({
  ...(name && { name }),
  position
})
