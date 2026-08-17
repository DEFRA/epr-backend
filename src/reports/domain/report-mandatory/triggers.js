import { isYes } from '#domain/summary-logs/table-schemas/shared/index.js'

/**
 * A rule trigger: given a row's data, decides whether the rule's required
 * fields apply to that row.
 *
 * @typedef {(data: Record<string, any>) => boolean} RuleTrigger
 */

/**
 * Fires when a tonnage field holds a finite number greater than zero. The
 * `Number.isFinite` guard matters because a non-numeric cell (blank, text, or
 * the sheet's own error markers) coerces to `NaN`, and `NaN > 0` is false but
 * `Number('') === 0` would otherwise mask an empty tonnage as a real zero. We
 * only ever want the rule to fire on a genuine positive tonnage.
 *
 * @param {string} field
 * @returns {RuleTrigger}
 */
export const tonnageOverZero = (field) => (data) => {
  const tonnage = Number(data[field])
  return Number.isFinite(tonnage) && tonnage > 0
}

/**
 * Fires when a yes/no field is answered "yes", using the same `isYes` reading
 * the schemas use so a stray "Yes " cannot count here and not there.
 *
 * @param {string} field
 * @returns {RuleTrigger}
 */
export const answeredYes = (field) => (data) => isYes(data[field])
