import { describe, it, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { reportMandatoryPolicyFor } from './index.js'

/**
 * Every template with a populated report-mandatory policy: both exporter
 * templates (PAE-1420) and the three reprocessor templates (PAE-1280).
 */
const POPULATED_TEMPLATES = [
  PROCESSING_TYPES.EXPORTER,
  PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
  PROCESSING_TYPES.REPROCESSOR_INPUT,
  PROCESSING_TYPES.REPROCESSOR_OUTPUT,
  PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
]

/**
 * Flattens each populated policy into one case per rule so a drifted field name
 * fails in isolation with a readable label.
 */
const ruleCases = POPULATED_TEMPLATES.flatMap((processingType) => {
  const policy = reportMandatoryPolicyFor(processingType) ?? {}
  return Object.entries(policy).flatMap(([wasteRecordType, rules]) =>
    rules.map((rule) => ({ processingType, wasteRecordType, rule }))
  )
})

// Guards the schema-sourced layout the engine depends on. Two invariants: the
// rule's `(processingType, wasteRecordType)` pair must resolve to a real schema
// (the engine casts the lookup to non-null and dereferences `sheetName` and
// `unfilledValues`, so a rule keyed under an unregistered record type would 500
// the request), and every required field must be a real column (a phantom field
// would report `columnIndex: -1`, which the integration tests miss because they
// assert the column index only as an opaque number).
describe('report-mandatory policy references only real table schemas', () => {
  it.each(ruleCases)(
    '$processingType/$wasteRecordType $rule.requiredBy',
    ({ processingType, wasteRecordType, rule }) => {
      const schema = findSchemaForProcessingType(
        processingType,
        wasteRecordType
      )
      expect(schema).not.toBeNull()

      for (const field of rule.requiredFields) {
        expect(schema?.requiredHeaders).toContain(field)
      }
    }
  )
})

describe('reportMandatoryPolicyFor', () => {
  it('returns null for a processing type with no policy', () => {
    expect(reportMandatoryPolicyFor('UNKNOWN_PROCESSING_TYPE')).toBeNull()
  })
})
