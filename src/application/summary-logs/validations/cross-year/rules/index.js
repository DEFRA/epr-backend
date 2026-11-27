import { earlierYearDates } from './earlier-year-dates.js'
import { previousYearRowComplete } from './previous-year-row-complete.js'
import { previousYearRowValueDiffers } from './previous-year-row-value-differs.js'

/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {FoundLinkedRow} from '../index.js' */

/** @typedef {(linkedRow: FoundLinkedRow) => readonly ValidationIssue[]} LinkedRowCheck */

/**
 * The rules on a row linked to a previous year's row, in tiers. A tier runs
 * only when every earlier tier finds nothing: a link that cannot be used is
 * fixed first, so the values it gives are not checked. Every rule in a tier
 * runs; one that applies only on some dates checks them itself.
 *
 * @type {readonly (readonly LinkedRowCheck[])[]}
 */
const LINKED_ROW_RULE_TIERS = Object.freeze([
  Object.freeze([previousYearRowComplete]),
  Object.freeze([earlierYearDates, previousYearRowValueDiffers])
])

/** @type {LinkedRowCheck} */
export const linkedRowIssuesOf = (linkedRow) => {
  for (const tier of LINKED_ROW_RULE_TIERS) {
    const issues = tier.flatMap((rule) => rule(linkedRow))
    if (issues.length > 0) {
      return issues
    }
  }
  return []
}
