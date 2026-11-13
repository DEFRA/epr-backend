import { RECEIVED_LOADS_FOR_EXPORT } from '#domain/summary-logs/table-schemas/exporter/received-loads-for-export.js'

/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */

/**
 * Table schemas holding the exporter's exported-loads table with its
 * waste-balance classifier replaced.
 *
 * @param {TableSchema['classifyForWasteBalance']} classifyForWasteBalance
 * @returns {Record<string, TableSchema>}
 */
export const tableSchemasWith = (classifyForWasteBalance) => ({
  RECEIVED_LOADS_FOR_EXPORT: {
    ...RECEIVED_LOADS_FOR_EXPORT,
    classifyForWasteBalance
  }
})
