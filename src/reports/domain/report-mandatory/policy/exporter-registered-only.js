import {
  RECEIVED_LOADS_FIELDS,
  LOADS_EXPORTED_FIELDS,
  SENT_ON_LOADS_FIELDS
} from '#domain/summary-logs/table-schemas/exporter-registered-only/fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REQUIRED_BY } from '../reason-codes.js'
import { tonnageOverZero } from '../triggers.js'

/**
 * @import { ReportMandatoryPolicy } from '../index.js'
 */

const RECEIVED = RECEIVED_LOADS_FIELDS
const EXPORTED = LOADS_EXPORTED_FIELDS
const SENT_ON = SENT_ON_LOADS_FIELDS

/**
 * Report-mandatory policy for the registered-only exporter template (PAE-1420
 * AC1, AC2, AC3, AC4).
 *
 * Unlike the accredited template, the registered-only template splits the
 * received, export and sent-on legs across three separate tables (and sheets),
 * so each rule keys off its own record type. It carries no interim-site columns,
 * so AC5 has no rule here (the template cannot express it).
 *
 * A rule fires for any row whose trigger holds, anywhere in the summary log —
 * the gate checks the whole log, not just the rows the report aggregates
 * (PAE-1420 whole-log pivot). The field layout is read from the row's table
 * schema rather than restated.
 *
 * @type {ReportMandatoryPolicy}
 */
export const EXPORTER_REGISTERED_ONLY_POLICY = Object.freeze({
  [WASTE_RECORD_TYPE.RECEIVED]: [
    {
      requiredBy: REQUIRED_BY.SUPPLIER_DETAILS,
      trigger: tonnageOverZero(RECEIVED.TONNAGE_RECEIVED_FOR_EXPORT),
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
  [WASTE_RECORD_TYPE.EXPORTED]: [
    {
      requiredBy: REQUIRED_BY.OVERSEAS_SITE,
      trigger: tonnageOverZero(EXPORTED.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED),
      requiredFields: [EXPORTED.OSR_ID]
    },
    {
      requiredBy: REQUIRED_BY.EXPORT_DATE,
      trigger: tonnageOverZero(EXPORTED.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED),
      requiredFields: [EXPORTED.DATE_OF_EXPORT]
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
