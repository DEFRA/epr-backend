import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { SENT_ON_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/shared/fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REQUIRED_BY } from '../reason-codes.js'
import { answeredYes, tonnageOverZero } from '../triggers.js'

/**
 * @import { ReportMandatoryPolicy } from '../index.js'
 */

const RECEIVED = RECEIVED_LOADS_FIELDS
const SENT_ON = SENT_ON_LOADS_FIELDS

/**
 * Report-mandatory policy for the accredited exporter template (PAE-1420
 * AC1–AC5).
 *
 * The accredited template carries the received and export legs on a single
 * `Exported` sheet row (wasteRecordType `exported`), so the supplier, overseas
 * site, export-date and interim rules all key off that record. The sent-on leg
 * is a separate `sentOn` record. A rule fires for any row whose trigger holds,
 * anywhere in the summary log — the gate checks the whole log, not just the rows
 * the report being created aggregates (PAE-1420 whole-log pivot). That is why
 * AC4 (a mandatory export date) is expressible here: a positive export tonnage
 * with a blank export date blocks creation regardless of period.
 *
 * Field layout (which columns exist, their sheet, and what counts as unfilled)
 * is not restated here: the engine reads it from the row's table schema.
 *
 * @type {ReportMandatoryPolicy}
 */
export const EXPORTER_POLICY = Object.freeze({
  [WASTE_RECORD_TYPE.EXPORTED]: [
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
    },
    {
      requiredBy: REQUIRED_BY.OVERSEAS_SITE,
      trigger: tonnageOverZero(RECEIVED.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED),
      requiredFields: [RECEIVED.OSR_ID]
    },
    {
      requiredBy: REQUIRED_BY.EXPORT_DATE,
      trigger: tonnageOverZero(RECEIVED.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED),
      requiredFields: [RECEIVED.DATE_OF_EXPORT]
    },
    {
      requiredBy: REQUIRED_BY.INTERIM_SITE,
      trigger: answeredYes(RECEIVED.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE),
      requiredFields: [RECEIVED.INTERIM_SITE_ID]
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
