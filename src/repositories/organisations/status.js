/**
 * The latest entry is the current status. `validateStatusHistory` enforces a
 * non-empty history on every write, so the last entry is always present.
 *
 * @template {string} S
 * @param {{ statusHistory: Array<{ status: S }> }} item
 * @returns {S}
 */
export const getCurrentStatus = ({ statusHistory }) =>
  statusHistory[statusHistory.length - 1].status
