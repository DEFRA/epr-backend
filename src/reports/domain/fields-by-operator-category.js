import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * Maps (operatorCategory, wasteRecordType) to the date field(s)
 * in record.data that determine which reporting period a record belongs to.
 *
 * Values are arrays because a single waste record can contain multiple
 * date fields used by different report sections. For example, an accredited
 * exporter's "exported" record has both DATE_RECEIVED_FOR_EXPORT and
 * DATE_OF_EXPORT — if a load was received in January but exported in
 * February, the record contributes to both months' reports.
 *
 * Source: Confluence "Monthly Reporting Data Requirements" (Jacky Mansfield).
 */
export const DATE_FIELDS_BY_OPERATOR_CATEGORY = Object.freeze({
  EXPORTER: {
    [WASTE_RECORD_TYPE.EXPORTED]: [
      'DATE_RECEIVED_FOR_EXPORT',
      'DATE_OF_EXPORT'
    ],
    [WASTE_RECORD_TYPE.SENT_ON]: ['DATE_LOAD_LEFT_SITE']
  },
  EXPORTER_REGISTERED_ONLY: {
    [WASTE_RECORD_TYPE.RECEIVED]: ['MONTH_RECEIVED_FOR_EXPORT'],
    [WASTE_RECORD_TYPE.EXPORTED]: ['DATE_OF_EXPORT'],
    [WASTE_RECORD_TYPE.SENT_ON]: ['DATE_LOAD_LEFT_SITE']
  },
  REPROCESSOR: {
    [WASTE_RECORD_TYPE.RECEIVED]: ['DATE_RECEIVED_FOR_REPROCESSING'],
    [WASTE_RECORD_TYPE.PROCESSED]: ['DATE_LOAD_LEFT_SITE'],
    [WASTE_RECORD_TYPE.SENT_ON]: ['DATE_LOAD_LEFT_SITE']
  },
  REPROCESSOR_REGISTERED_ONLY: {
    [WASTE_RECORD_TYPE.RECEIVED]: ['MONTH_RECEIVED_FOR_REPROCESSING'],
    [WASTE_RECORD_TYPE.SENT_ON]: ['DATE_LOAD_LEFT_SITE']
  }
})

/**
 * Maps operatorCategory to the tonnage field name used in received records.
 * Reprocessors use TONNAGE_RECEIVED_FOR_RECYCLING; exporters use TONNAGE_RECEIVED_FOR_EXPORT.
 */
export const TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY = Object.freeze({
  REPROCESSOR: 'TONNAGE_RECEIVED_FOR_RECYCLING',
  REPROCESSOR_REGISTERED_ONLY: 'TONNAGE_RECEIVED_FOR_RECYCLING',
  EXPORTER: 'TONNAGE_RECEIVED_FOR_EXPORT',
  EXPORTER_REGISTERED_ONLY: 'TONNAGE_RECEIVED_FOR_EXPORT'
})
