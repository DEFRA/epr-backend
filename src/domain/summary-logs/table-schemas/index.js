import { PROCESSING_TYPES } from '../meta-fields.js'
import { DEFAULT_TEMPLATE_YEAR } from '../template-year.js'
import { EXPORTER_TEMPLATES } from './exporter/index.js'
import { EXPORTER_REGISTERED_ONLY_TEMPLATES } from './exporter-registered-only/index.js'
import { REPROCESSOR_INPUT_TEMPLATES } from './reprocessor-input/index.js'
import { REPROCESSOR_OUTPUT_TEMPLATES } from './reprocessor-output/index.js'
import { REPROCESSOR_REGISTERED_ONLY_TEMPLATES } from './reprocessor-registered-only/index.js'

/** @import {Year} from '#common/helpers/dates/year.js' */

/** @import {AccreditationValidity} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
/** @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').WasteBalanceClassificationResult} WasteBalanceClassificationResult */
/** @typedef {import('joi').ObjectSchema} JoiObjectSchema */
/** @import {WasteRecordType} from '#domain/waste-records/model.js' */
/**
 * @typedef {Object} TableSchema
 * @property {string} rowIdField - Field name containing the row identifier
 * @property {WasteRecordType} wasteRecordType - The waste record type this table maps to (e.g. 'received', 'exported')
 * @property {string} sheetName - The spreadsheet sheet name for this table (e.g. 'Received', 'Exported')
 * @property {(rowData: Record<string, any>, rowIndex?: number) => {wasteRecordType: WasteRecordType, rowId: string, data: Record<string, any>}} rowTransformer - Function to transform a parsed row into waste record metadata
 * @property {string[]} requiredHeaders - Headers that must be present in the table
 * @property {Record<string, readonly string[]>} unfilledValues - Per-field values that indicate "unfilled" (e.g. dropdown placeholders)
 * @property {JoiObjectSchema} validationSchema - Joi schema for VAL010 (in-sheet validation of filled fields)
 * @property {((data: Record<string, any>, context: {accreditation: AccreditationValidity | null, overseasSites: OverseasSitesContext}) => WasteBalanceClassificationResult) | null} [classifyForWasteBalance] - Classifies a row for waste balance. Absent or null declares the table as by-design non-contributing: its rows are reported under nonBalanceAffecting with the TEMPLATE_SECTION_DOES_NOT_CONTRIBUTE_TO_WASTE_BALANCE exclusion reason, not as a data problem
 */

/**
 * @typedef {Object} Template
 * @property {number} minVersion - The lowest template version accepted
 * @property {Record<string, TableSchema>} tables - Table schemas by table name
 */

/**
 * Summary log templates by year, then processing type (ADR 0055). A year
 * missing here has no template, so uploads for it are rejected.
 *
 * @type {Record<number, Record<string, Template>>}
 */
export const TEMPLATES = {
  [DEFAULT_TEMPLATE_YEAR]: {
    [PROCESSING_TYPES.REPROCESSOR_INPUT]:
      REPROCESSOR_INPUT_TEMPLATES[DEFAULT_TEMPLATE_YEAR],
    [PROCESSING_TYPES.REPROCESSOR_OUTPUT]:
      REPROCESSOR_OUTPUT_TEMPLATES[DEFAULT_TEMPLATE_YEAR],
    [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]:
      REPROCESSOR_REGISTERED_ONLY_TEMPLATES[DEFAULT_TEMPLATE_YEAR],
    [PROCESSING_TYPES.EXPORTER]: EXPORTER_TEMPLATES[DEFAULT_TEMPLATE_YEAR],
    [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]:
      EXPORTER_REGISTERED_ONLY_TEMPLATES[DEFAULT_TEMPLATE_YEAR]
  }
}

/**
 * The DEFAULT_TEMPLATE_YEAR table schemas by processing type
 *
 * Each table schema defines:
 * - rowIdField: Field name containing the row identifier
 * - wasteRecordType: The waste record type this table maps to (e.g. 'received', 'exported')
 * - sheetName: The spreadsheet sheet name for this table (e.g. 'Received', 'Exported')
 * - requiredHeaders: Headers that must be present in the table
 * - unfilledValues: Per-field values that indicate "unfilled" (e.g. dropdown placeholders)
 * - validationSchema: Joi schema for VAL010 (in-sheet validation of filled fields)
 * - classifyForWasteBalance: {@link import('./validation-pipeline.js').ClassifyForWasteBalance}|null — classifies a row for waste balance (null if table does not contribute)
 * - rowTransformer: Function to transform a parsed row into waste record metadata
 */
export const PROCESSING_TYPE_TABLES = Object.fromEntries(
  Object.entries(TEMPLATES[DEFAULT_TEMPLATE_YEAR]).map(
    ([processingType, { tables }]) => [processingType, tables]
  )
)

/**
 * The template for a year and processing type. Callers must have validated
 * both, so a missing template is a programming error.
 *
 * @param {Year} year
 * @param {string} processingType
 * @returns {Template}
 */
export const getTemplate = (year, processingType) => {
  const template = TEMPLATES[year]?.[processingType]
  if (!template) {
    throw new Error(`No ${processingType} summary log template for ${year}`)
  }
  return template
}

/**
 * Finds a table schema by processing type and waste record type
 *
 * @param {string} processingType - The processing type (e.g. 'REPROCESSOR_INPUT')
 * @param {string} wasteRecordType - The waste record type (e.g. 'received', 'sentOn')
 * @returns {TableSchema|null} The matching table schema, or null if not found
 */
export const findSchemaForProcessingType = (
  processingType,
  wasteRecordType
) => {
  const tables =
    PROCESSING_TYPE_TABLES[
      /** @type {keyof typeof PROCESSING_TYPE_TABLES} */ (processingType)
    ]
  if (!tables) {
    return null
  }

  return (
    Object.values(tables).find(
      (schema) => schema.wasteRecordType === wasteRecordType
    ) ?? null
  )
}

/**
 * Creates a table schema getter bound to a specific processing type
 *
 * @param {string} processingType - The processing type from meta.PROCESSING_TYPE
 * @param {Object} registry - Schema registry mapping processing types to table schemas
 * @returns {(tableName: string) => Object | null} A function that takes a table name and returns its schema
 */
export const createTableSchemaGetter = (processingType, registry) => {
  const tables = registry[processingType]
  return (tableName) => tables?.[tableName] || null
}

/**
 * Finds a table schema by waste record type, scanning across all processing types.
 *
 * @param {string} wasteRecordType - The waste record type to find (e.g. 'received', 'exported')
 * @param {Object} registry - Schema registry (PROCESSING_TYPE_TABLES)
 * @returns {{ tableName: string, schema: TableSchema } | null} The table name and schema, or null if not found
 */
export const findSchemaByWasteRecordType = (wasteRecordType, registry) => {
  for (const tables of Object.values(registry)) {
    for (const [tableName, schema] of Object.entries(tables)) {
      if (schema.wasteRecordType === wasteRecordType) {
        return { tableName, schema }
      }
    }
  }
  return null
}

/**
 * Aggregates unfilledValues from all table schemas across all processing types
 * into a single per-column map for the parser's unfilledValues option.
 *
 * @param {Object} registry - Schema registry (PROCESSING_TYPE_TABLES)
 * @returns {Record<string, string[]>} Union of all unfilledValues across all schemas
 */
export const aggregateUnfilledValues = (registry) => {
  /** @type {Record<string, Set<string>>} */
  const sets = {}
  const allSchemas = Object.values(registry).flatMap(Object.values)
  for (const { unfilledValues } of allSchemas) {
    for (const [field, values] of Object.entries(unfilledValues)) {
      sets[field] ??= new Set()
      values.forEach((v) => sets[field].add(v))
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v]]))
}
