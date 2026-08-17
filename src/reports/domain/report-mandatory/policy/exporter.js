import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { SENT_ON_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/shared/fields.js'
import { REPORTING_DATE_FIELDS } from '#domain/summary-logs/reporting-date-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { REQUIRED_BY } from '../reason-codes.js'
import { answeredYes, tonnageOverZero } from '../triggers.js'

/**
 * @import { ReportMandatoryPolicy } from '../index.js'
 */

const RECEIVED = RECEIVED_LOADS_FIELDS
const SENT_ON = SENT_ON_LOADS_FIELDS
const DATES = REPORTING_DATE_FIELDS.EXPORTER

/**
 * Report-mandatory policy for the accredited exporter template (PAE-1420
 * AC1, AC2, AC3, AC5).
 *
 * The accredited template carries the received and export legs on a single
 * `Exported` sheet row (wasteRecordType `exported`), so the supplier, overseas
 * site and interim rules all key off that record. The sent-on leg is a separate
 * `sentOn` record. Each rule declares the section date field that decides
 * whether the row lands in the report being created: the gate applies a rule
 * only when that date is in the report period, mirroring the aggregation's
 * period slicing so it can never block on a row the report would not aggregate.
 * That is why AC4 (a mandatory export date) is absent: an export row with no
 * date lands in no period, so it can never reach this gate. See the PAE-1420
 * comment for the reasoning.
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
      dateField: DATES.RECEIVED_LOADS_FOR_EXPORT.DATE_RECEIVED_FOR_EXPORT,
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
      dateField: DATES.RECEIVED_LOADS_FOR_EXPORT.DATE_OF_EXPORT,
      trigger: tonnageOverZero(RECEIVED.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED),
      requiredFields: [RECEIVED.OSR_ID]
    },
    {
      // The interim leg belongs to the export journey, so it is scoped by the
      // export date. Provisional pending domain confirmation (PAE-1420).
      requiredBy: REQUIRED_BY.INTERIM_SITE,
      dateField: DATES.RECEIVED_LOADS_FOR_EXPORT.DATE_OF_EXPORT,
      trigger: answeredYes(RECEIVED.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE),
      requiredFields: [RECEIVED.INTERIM_SITE_ID]
    }
  ],
  [WASTE_RECORD_TYPE.SENT_ON]: [
    {
      requiredBy: REQUIRED_BY.FINAL_DESTINATION,
      dateField: DATES.SENT_ON_LOADS.DATE_LOAD_LEFT_SITE,
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
