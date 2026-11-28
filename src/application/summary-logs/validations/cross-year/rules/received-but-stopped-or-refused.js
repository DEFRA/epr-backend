import { VALIDATION_CODE } from '#common/enums/validation.js'
import { isBeforeCorrectionDeadline } from '#domain/summary-logs/correction-deadline.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { isYes } from '#domain/summary-logs/table-schemas/shared/answers.js'
import { isFilled } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { toPreviousYearLinkIssue } from '../previous-year-link-issue.js'

/** @import {FoundLinkedRow} from '../index.js' */
/** @import {LinkedRowCheck} from './index.js' */

const RECEIVED_DATE_FIELD = RECEIVED_LOADS_FIELDS.DATE_RECEIVED_BY_OSR

const STOPPED_OR_REFUSED_FIELDS = Object.freeze([
  RECEIVED_LOADS_FIELDS.WAS_THE_WASTE_REFUSED,
  RECEIVED_LOADS_FIELDS.WAS_THE_WASTE_STOPPED
])

/** @param {FoundLinkedRow} linkedRow */
const isStoppedOrRefusedOnBothRows = ({ rowObject, previousYearLink }) =>
  STOPPED_OR_REFUSED_FIELDS.some(
    (field) =>
      isYes(rowObject[field]) && isYes(previousYearLink.previousYear[field])
  )

/**
 * A load the previous year's row has as stopped or refused cannot have been
 * received. Only the accredited exporter's table has a received date.
 *
 * @type {LinkedRowCheck}
 */
export const receivedButStoppedOrRefused = (linkedRow) => {
  const { rowObject, previousYearLink, options } = linkedRow
  if (
    !isFilled(rowObject[RECEIVED_DATE_FIELD]) ||
    !isStoppedOrRefusedOnBothRows(linkedRow)
  ) {
    return []
  }
  const errorCode = isBeforeCorrectionDeadline(
    previousYearLink.link.year,
    options,
    options.createdAt
  )
    ? VALIDATION_CODE.PREVIOUS_YEAR_ROW_STOPPED_OR_REFUSED
    : VALIDATION_CODE.PREVIOUS_YEAR_ROW_STOPPED_OR_REFUSED_CLOSED
  return [
    toPreviousYearLinkIssue({
      errorCode,
      field: RECEIVED_DATE_FIELD,
      linkedRow,
      // What the operator entered, not the previous year's date fill-in put there
      enteredValue: previousYearLink.link.suppliedFields.includes(
        RECEIVED_DATE_FIELD
      )
        ? rowObject[RECEIVED_DATE_FIELD]
        : null,
      previousYearRowId: previousYearLink.link.rowId
    })
  ]
}
