import {
  RECEIVED_LOADS_FIELDS,
  SENT_ON_LOADS_FIELDS
} from '#domain/summary-logs/table-schemas/reprocessor-registered-only/fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REQUIRED_BY } from '../reason-codes.js'
import { tonnageOverZero } from '../triggers.js'

/**
 * @import { ReportMandatoryPolicy } from '../index.js'
 */

const RECEIVED = RECEIVED_LOADS_FIELDS
const SENT_ON = SENT_ON_LOADS_FIELDS

/**
 * Report-mandatory policy for the registered-only reprocessor template
 * (PAE-1280 AC1, AC2).
 *
 * Structurally identical to the accredited reprocessor policies: the supplier
 * rule keys off the received record and the final-destination rule off the
 * sent-on record. The registered-only template defines its own simplified field
 * sets, but both rules reference the same canonical columns.
 *
 * A rule fires for any row whose trigger holds, anywhere in the summary log — the
 * gate checks the whole log, not just the rows the report aggregates. The field
 * layout is read from the row's table schema rather than restated.
 *
 * @type {ReportMandatoryPolicy}
 */
export const REPROCESSOR_REGISTERED_ONLY_POLICY = Object.freeze({
  [WASTE_RECORD_TYPE.RECEIVED]: [
    {
      requiredBy: REQUIRED_BY.SUPPLIER_DETAILS,
      trigger: tonnageOverZero(RECEIVED.TONNAGE_RECEIVED_FOR_RECYCLING),
      requiredFields: [
        RECEIVED.SUPPLIER_NAME,
        RECEIVED.SUPPLIER_ADDRESS,
        RECEIVED.SUPPLIER_POSTCODE,
        RECEIVED.SUPPLIER_EMAIL,
        RECEIVED.SUPPLIER_PHONE_NUMBER,
        RECEIVED.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER
      ]
    }
  ],
  [WASTE_RECORD_TYPE.SENT_ON]: [
    {
      requiredBy: REQUIRED_BY.FINAL_DESTINATION,
      trigger: tonnageOverZero(SENT_ON.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON),
      requiredFields: [
        SENT_ON.FINAL_DESTINATION_NAME,
        SENT_ON.FINAL_DESTINATION_FACILITY_TYPE,
        SENT_ON.FINAL_DESTINATION_ADDRESS,
        SENT_ON.FINAL_DESTINATION_POSTCODE
      ]
    }
  ]
})
