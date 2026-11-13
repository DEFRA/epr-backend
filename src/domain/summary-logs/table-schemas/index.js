import { PROCESSING_TYPES } from '../meta-fields.js'
import { DEFAULT_TEMPLATE_YEAR, templateYear } from '../template-year.js'
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
 * @property {number} [maxVersion] - The highest template version accepted, when the year accepts only versions known so far
 * @property {Record<string, TableSchema>} tableSchemas - Table schemas by table name
 */

/**
 * Each processing type's templates by year (ADR 0055).
 *
 * @type {Record<string, Record<number, Template>>}
 */
const TEMPLATES_BY_PROCESSING_TYPE = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT_TEMPLATES,
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: REPROCESSOR_OUTPUT_TEMPLATES,
  [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY]:
    REPROCESSOR_REGISTERED_ONLY_TEMPLATES,
  [PROCESSING_TYPES.EXPORTER]: EXPORTER_TEMPLATES,
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]:
    EXPORTER_REGISTERED_ONLY_TEMPLATES
}

/**
 * The template for a year and processing type. Callers must have validated
 * both, so a missing template is a programming error.
 *
 * @param {Year} year
 * @param {string} processingType
 * @returns {Template}
 */
export const getTemplate = (year, processingType) => {
  const template = TEMPLATES_BY_PROCESSING_TYPE[processingType]?.[year]
  if (!template) {
    throw new Error(`No ${processingType} summary log template for ${year}`)
  }
  return template
}

/**
 * Whether {@link getTemplate} has a template for the year and processing type.
 *
 * @param {Year} year
 * @param {string} processingType
 * @returns {boolean}
 */
export const hasTemplate = (year, processingType) =>
  TEMPLATES_BY_PROCESSING_TYPE[processingType]?.[year] !== undefined

/**
 * Whether any processing type has a template for the year.
 *
 * @param {Year} year
 * @returns {boolean}
 */
export const hasTemplatesForYear = (year) =>
  Object.values(TEMPLATES_BY_PROCESSING_TYPE).some(
    (templatesByYear) => templatesByYear[year] !== undefined
  )

/**
 * @typedef {{ error: string, context?: Record<string, unknown> }} TemplateVersionFailure
 */

/**
 * Checks a template version against the summary log's year and the processing
 * type's template for the version's year (ADR 0055).
 *
 * @param {Object} params
 * @param {Year} params.year - The summary log's year
 * @param {string} params.processingType
 * @param {number} params.version
 * @returns {TemplateVersionFailure | null}
 */
export const checkTemplateVersion = ({ year, processingType, version }) => {
  const versionYear = templateYear(version)
  const template = TEMPLATES_BY_PROCESSING_TYPE[processingType]?.[versionYear]
  if (!template) {
    return { error: 'templateVersion.year' }
  }
  if (versionYear !== year) {
    return {
      error: 'templateVersion.yearMismatch',
      context: { year, actualYear: versionYear }
    }
  }
  if (version < template.minVersion) {
    return { error: 'number.min', context: { limit: template.minVersion } }
  }
  if (template.maxVersion !== undefined && version > template.maxVersion) {
    return { error: 'number.max', context: { limit: template.maxVersion } }
  }
  return null
}

/**
 * Aggregates unfilledValues from every table of a year's templates into a
 * single per-column map for the parser's unfilledValues option.
 *
 * @param {{tableSchemas: Record<string, Pick<TableSchema, 'unfilledValues'>>}[]} templatesForYear
 * @returns {Record<string, string[]>} Union of all unfilledValues across all tables
 */
const aggregateUnfilledValues = (templatesForYear) => {
  /** @type {Record<string, Set<string>>} */
  const sets = {}
  const allSchemas = templatesForYear.flatMap(({ tableSchemas }) =>
    Object.values(tableSchemas)
  )
  for (const { unfilledValues } of allSchemas) {
    for (const [field, values] of Object.entries(unfilledValues)) {
      sets[field] ??= new Set()
      values.forEach((v) => sets[field].add(v))
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v]]))
}

/**
 * The placeholders of every table in a year's templates, for the parser, which
 * reads a file before its processing type is known. Callers must have a year
 * with templates, so a year with none is a programming error.
 *
 * @param {Year} year
 * @returns {Record<string, string[]>}
 */
export const unfilledValuesForYear = (year) => {
  const templatesForYear = Object.values(TEMPLATES_BY_PROCESSING_TYPE).flatMap(
    (templatesByYear) => templatesByYear[year] ?? []
  )
  if (templatesForYear.length === 0) {
    throw new Error(`No summary log templates for ${year}`)
  }
  return aggregateUnfilledValues(templatesForYear)
}

/**
 * Finds a table by waste record type in a template's table schemas.
 *
 * @template {Pick<TableSchema, 'wasteRecordType'>} S
 * @param {string} wasteRecordType - The waste record type to find (e.g. 'received', 'exported')
 * @param {Record<string, S>} tableSchemas
 * @returns {{ tableName: string, schema: S } | null}
 */
export const findSchemaByWasteRecordType = (wasteRecordType, tableSchemas) => {
  const match = Object.entries(tableSchemas).find(
    ([, schema]) => schema.wasteRecordType === wasteRecordType
  )
  return match ? { tableName: match[0], schema: match[1] } : null
}

/**
 * Finds a table schema by processing type and waste record type. Stored rows
 * carry no year, so this reads the DEFAULT_TEMPLATE_YEAR templates.
 *
 * @param {string} processingType - The processing type (e.g. 'REPROCESSOR_INPUT')
 * @param {string} wasteRecordType - The waste record type (e.g. 'received', 'sentOn')
 * @returns {TableSchema|null} The matching table schema, or null if not found
 */
export const findSchemaForProcessingType = (
  processingType,
  wasteRecordType
) => {
  const tableSchemas =
    TEMPLATES_BY_PROCESSING_TYPE[processingType]?.[DEFAULT_TEMPLATE_YEAR]
      ?.tableSchemas ?? {}
  return (
    findSchemaByWasteRecordType(wasteRecordType, tableSchemas)?.schema ?? null
  )
}
