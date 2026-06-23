import { PROCESSING_TYPES } from './meta-fields.js'

/**
 * Central registry of date fields used for reporting period classification.
 *
 * Maps (processingType, tableName) to the date field names that determine
 * which reporting period a row belongs to. This is the single source of
 * truth consumed by both table schemas (via Object.values() for the
 * reportingDateFields array) and the reports module (via named access
 * for SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY).
 *
 * Each field name is a spreadsheet column header. The drift-guard test in
 * table-schemas/index.test.js verifies every entry appears in the
 * corresponding schema's requiredHeaders.
 *
 * Most tables have a single reporting date field. The exceptions are:
 * - Accredited exporter received-loads: DATE_RECEIVED_FOR_EXPORT determines
 *   the period for the "received" report section, DATE_OF_EXPORT determines
 *   the period for the "exported" section. A single row can affect two
 *   different reporting periods.
 * - Registered-only exporter loads-exported: DATE_OF_EXPORT for the exported
 *   section, DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED for the repatriated
 *   section.
 */
export const REPORTING_DATE_FIELDS = Object.freeze({
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: Object.freeze({
    RECEIVED_LOADS_FOR_REPROCESSING: Object.freeze({
      DATE_RECEIVED_FOR_REPROCESSING: 'DATE_RECEIVED_FOR_REPROCESSING'
    }),
    REPROCESSED_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    }),
    SENT_ON_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    })
  }),

  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: Object.freeze({
    RECEIVED_LOADS_FOR_REPROCESSING: Object.freeze({
      DATE_RECEIVED_FOR_REPROCESSING: 'DATE_RECEIVED_FOR_REPROCESSING'
    }),
    REPROCESSED_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    }),
    SENT_ON_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    })
  }),

  [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]: Object.freeze({
    RECEIVED_LOADS_FOR_REPROCESSING: Object.freeze({
      MONTH_RECEIVED_FOR_REPROCESSING: 'MONTH_RECEIVED_FOR_REPROCESSING'
    }),
    SENT_ON_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    })
  }),

  [PROCESSING_TYPES.EXPORTER]: Object.freeze({
    RECEIVED_LOADS_FOR_EXPORT: Object.freeze({
      DATE_RECEIVED_FOR_EXPORT: 'DATE_RECEIVED_FOR_EXPORT',
      DATE_OF_EXPORT: 'DATE_OF_EXPORT'
    }),
    SENT_ON_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    })
  }),

  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]: Object.freeze({
    RECEIVED_LOADS_FOR_EXPORT: Object.freeze({
      MONTH_RECEIVED_FOR_EXPORT: 'MONTH_RECEIVED_FOR_EXPORT'
    }),
    LOADS_EXPORTED: Object.freeze({
      DATE_OF_EXPORT: 'DATE_OF_EXPORT',
      DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED:
        'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
    }),
    SENT_ON_LOADS: Object.freeze({
      DATE_LOAD_LEFT_SITE: 'DATE_LOAD_LEFT_SITE'
    })
  })
})
