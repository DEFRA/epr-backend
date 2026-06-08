import { REPORTING_DATE_FIELDS } from '#domain/summary-logs/reporting-date-fields.js'

/**
 * Maps (operatorCategory, reportSection) to the single date field used
 * for filtering records into that section during aggregation.
 *
 * Derived from REPORTING_DATE_FIELDS, the central registry of date fields
 * on each table schema. The distinction between operator category and
 * processing type matters for accredited reprocessors: the input/output
 * distinction is lost at the waste record level, but both variants use
 * identical date fields so a single REPROCESSOR mapping suffices.
 *
 * For accredited exporters, their received-loads table has two reporting
 * date fields: DATE_RECEIVED_FOR_EXPORT (for the wasteReceived section)
 * and DATE_OF_EXPORT (for the wasteExported section). A single record
 * can appear in two different monthly reports.
 */

const RDF = REPORTING_DATE_FIELDS

export const SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY = Object.freeze({
  EXPORTER: {
    wasteReceived:
      RDF.EXPORTER.RECEIVED_LOADS_FOR_EXPORT.DATE_RECEIVED_FOR_EXPORT,
    wasteExported: RDF.EXPORTER.RECEIVED_LOADS_FOR_EXPORT.DATE_OF_EXPORT,
    // The accredited exporter template has no repatriation date field.
    // The report's slice always returns empty. The field name is shared
    // with the registered-only template for structural completeness.
    wasteRepatriated:
      RDF.EXPORTER_REGISTERED_ONLY.LOADS_EXPORTED
        .DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED,
    wasteSentOn: RDF.EXPORTER.SENT_ON_LOADS.DATE_LOAD_LEFT_SITE
  },
  EXPORTER_REGISTERED_ONLY: {
    wasteReceived:
      RDF.EXPORTER_REGISTERED_ONLY.RECEIVED_LOADS_FOR_EXPORT
        .MONTH_RECEIVED_FOR_EXPORT,
    wasteExported: RDF.EXPORTER_REGISTERED_ONLY.LOADS_EXPORTED.DATE_OF_EXPORT,
    wasteRepatriated:
      RDF.EXPORTER_REGISTERED_ONLY.LOADS_EXPORTED
        .DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED,
    wasteSentOn: RDF.EXPORTER_REGISTERED_ONLY.SENT_ON_LOADS.DATE_LOAD_LEFT_SITE
  },
  REPROCESSOR: {
    wasteReceived:
      RDF.REPROCESSOR_INPUT.RECEIVED_LOADS_FOR_REPROCESSING
        .DATE_RECEIVED_FOR_REPROCESSING,
    wasteSentOn: RDF.REPROCESSOR_INPUT.SENT_ON_LOADS.DATE_LOAD_LEFT_SITE
  },
  REPROCESSOR_REGISTERED_ONLY: {
    wasteReceived:
      RDF.REPROCESSOR_REGISTERED_ONLY.RECEIVED_LOADS_FOR_REPROCESSING
        .MONTH_RECEIVED_FOR_REPROCESSING,
    wasteSentOn:
      RDF.REPROCESSOR_REGISTERED_ONLY.SENT_ON_LOADS.DATE_LOAD_LEFT_SITE
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
