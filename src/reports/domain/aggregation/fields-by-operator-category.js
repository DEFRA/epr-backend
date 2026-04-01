/**
 * Maps (operatorCategory, reportSection) to the single date field used
 * for filtering records into that section during aggregation.
 *
 * Unlike DATE_FIELDS_BY_OPERATOR_CATEGORY (which groups by record type
 * for period discovery), this maps by report section. The distinction
 * matters for accredited exporters: their `exported` records contribute
 * to both wasteReceived (via DATE_RECEIVED_FOR_EXPORT) and wasteExported
 * (via DATE_OF_EXPORT) — a single record can span two monthly reports.
 */
export const SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY = Object.freeze({
  EXPORTER: {
    wasteReceived: 'DATE_RECEIVED_FOR_EXPORT',
    wasteExported: 'DATE_OF_EXPORT',
    wasteRepatriated: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED',
    wasteSentOn: 'DATE_LOAD_LEFT_SITE'
  },
  EXPORTER_REGISTERED_ONLY: {
    wasteReceived: 'MONTH_RECEIVED_FOR_EXPORT',
    wasteExported: 'DATE_OF_EXPORT',
    wasteRepatriated: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED',
    wasteSentOn: 'DATE_LOAD_LEFT_SITE'
  },
  REPROCESSOR: {
    wasteReceived: 'DATE_RECEIVED_FOR_REPROCESSING',
    wasteSentOn: 'DATE_LOAD_LEFT_SITE'
  },
  REPROCESSOR_REGISTERED_ONLY: {
    wasteReceived: 'MONTH_RECEIVED_FOR_REPROCESSING',
    wasteSentOn: 'DATE_LOAD_LEFT_SITE'
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
