import { describe, it, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { reportMandatoryPolicyFor } from './index.js'

/**
 * Every populated exporter template. The three reprocessor templates are
 * deliberately unpopulated until PAE-1280 and resolve to a null policy.
 */
const EXPORTER_TEMPLATES = [
  PROCESSING_TYPES.EXPORTER,
  PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
]

/**
 * Flattens each populated policy into one case per rule so a drifted field name
 * fails in isolation with a readable label.
 */
const ruleCases = EXPORTER_TEMPLATES.flatMap((processingType) => {
  const policy = reportMandatoryPolicyFor(processingType) ?? {}
  return Object.entries(policy).flatMap(([wasteRecordType, rules]) =>
    rules.map((rule) => ({ processingType, wasteRecordType, rule }))
  )
})

// Guards the schema-sourced layout the engine depends on: a rule whose required
// field is not a real column would report `columnIndex: -1`, which the
// integration tests do not notice because they assert the column index only as
// an opaque number.
describe('report-mandatory policy references only real table columns', () => {
  it.each(ruleCases)(
    '$processingType/$wasteRecordType $rule.requiredBy',
    ({ processingType, wasteRecordType, rule }) => {
      const headers =
        findSchemaForProcessingType(processingType, wasteRecordType)
          ?.requiredHeaders ?? []

      for (const field of rule.requiredFields) {
        expect(headers).toContain(field)
      }
    }
  )
})
