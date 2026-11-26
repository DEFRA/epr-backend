import { earlierYearDates } from './earlier-year-dates.js'
import { previousYearRowComplete } from './previous-year-row-complete.js'
import { previousYearRowValueDiffers } from './previous-year-row-value-differs.js'

/** @import {ValidationIssue} from '#common/validation/validation-issues.js' */
/** @import {FoundLinkedRow} from '../index.js' */

/** @typedef {(linkedRow: FoundLinkedRow) => ValidationIssue[]} LinkedRowCheck */

/**
 * The rules on a row linked to a previous year's row, in the order their
 * issues are reported. Every rule runs; one that applies only on some dates
 * checks them itself.
 *
 * @type {readonly LinkedRowCheck[]}
 */
const LINKED_ROW_RULES = Object.freeze([
  earlierYearDates,
  previousYearRowComplete,
  previousYearRowValueDiffers
])

/** @type {LinkedRowCheck} */
export const linkedRowIssuesOf = (linkedRow) =>
  LINKED_ROW_RULES.flatMap((rule) => rule(linkedRow))
