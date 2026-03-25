import { createSentOnLoadsSchema } from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createRowTransformer } from '#application/waste-records/row-transformers/create-row-transformer.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import {
  CLASSIFICATION_REASON,
  checkRequiredFields
} from '../shared/classify-helpers.js'
import { isAccreditedAtDates } from '#common/helpers/dates/accreditation.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

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
    createRowTransformer({
      wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      rowIdField: FIELDS.ROW_ID
    })
  ),

  classifyForWasteBalance: (
    /** @type {Record<string, any>} */ data,
    /** @type {{ accreditation: Accreditation | null }} */ { accreditation }
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
