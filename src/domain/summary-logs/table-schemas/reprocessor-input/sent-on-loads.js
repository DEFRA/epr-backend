/** @import {Accreditation} from '#repositories/organisations/port.js' */
import { createSentOnLoadsSchema } from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import { transformSentOnLoadsRow } from '#application/waste-records/row-transformers/sent-on-loads.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import {
  CLASSIFICATION_REASON,
  checkRequiredFields
} from '../shared/classify-helpers.js'
import { isAccreditedAtDates } from '#common/helpers/dates/accreditation.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

const WASTE_BALANCE_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_LOAD_LEFT_SITE,
  FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
]

/**
 * Table schema for SENT_ON_LOADS (REPROCESSOR_INPUT)
 *
 * Tracks waste sent on to other facilities.
 */
export const SENT_ON_LOADS = {
  ...createSentOnLoadsSchema(
    ROW_ID_MINIMUMS.SENT_ON_LOADS,
    transformSentOnLoadsRow
  ),

  classifyForWasteBalance: (
    /** @type {Record<string, any>} */ data,
    { /** @type {Accreditation | undefined} */ accreditation }
  ) => {
    const missingResult = checkRequiredFields(
      data,
      WASTE_BALANCE_FIELDS,
      SENT_ON_LOADS.unfilledValues
    )
    if (missingResult) {
      return missingResult
    }

    if (
      !isAccreditedAtDates([data[FIELDS.DATE_LOAD_LEFT_SITE]], accreditation)
    ) {
      return {
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      }
    }

    return {
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: -roundToTwoDecimalPlaces(
        data[FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]
      )
    }
  }
}
