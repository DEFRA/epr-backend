import { PROCESSING_TYPES } from './meta-fields.js'

/**
 * Central registry of date fields used for reporting period classification.
 *
 * Maps (processingType, tableName) to the date field names that determine
 * which reporting period a row belongs to. The reports module reads it by
 * name to build SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY, which is what
 * places rows in periods.
 *
 * Most tables have a single reporting date field. The exceptions are:
 * - Accredited exporter received-loads: DATE_RECEIVED_FOR_EXPORT for the
 *   received section, DATE_OF_EXPORT for the exported section and
 *   DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED for the repatriated section.
 *   A single row can affect up to three different reporting periods.
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
      DATE_OF_EXPORT: 'DATE_OF_EXPORT',
      DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED:
        'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
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
