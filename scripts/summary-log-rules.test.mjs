import { describe, it, expect } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  describeRule,
  describeTrigger,
  contributionReasons,
  requiredForBalance,
  generateDocument,
  TEMPLATE_ORDER
} from './summary-log-rules.mjs'

describe('TEMPLATE_ORDER', () => {
  it('covers every processing type, so a new template cannot be omitted', () => {
    expect(new Set(TEMPLATE_ORDER.map(([type]) => type))).toEqual(
      new Set(Object.values(PROCESSING_TYPES))
    )
  })
})

describe('describeRule', () => {
  it('reports an unvalidated field', () => {
    expect(describeRule(undefined)).toBe('Not validated (any value accepted)')
  })

  it('lists a small allowed set inline', () => {
    expect(describeRule({ flags: { only: true }, allow: ['Yes', 'No'] })).toBe(
      'One of: Yes, No'
    )
  })

  it('summarises a large allowed set by count using its message', () => {
    expect(
      describeRule({
        flags: { only: true },
        allow: Array.from({ length: 842 }, (_, i) => `code-${i}`),
        preferences: {
          messages: {
            'any.only': 'must be a valid EWC code from the allowed list'
          }
        }
      })
    ).toBe(
      'Must be a valid EWC code from the allowed list (842 permitted values)'
    )
  })

  it('renders numeric bounds', () => {
    expect(
      describeRule({
        type: 'number',
        rules: [
          { name: 'min', args: { limit: 0 } },
          { name: 'max', args: { limit: 1000 } }
        ]
      })
    ).toBe('Number, at least 0, at most 1000')
  })

  it('renders a date from its calendar message', () => {
    expect(
      describeRule({
        type: 'any',
        preferences: {
          messages: { 'any.calendarDate': 'must be a valid date' }
        }
      })
    ).toBe('Date (YYYY-MM-DD)')
  })

  it('renders a three-digit id from its message', () => {
    expect(
      describeRule({
        preferences: {
          messages: { 'string.threeDigitId': 'must be a 3-digit ID (001-999)' }
        }
      })
    ).toBe('3-digit ID (001-999)')
  })

  it('prefers a bespoke pattern message (first-of-month) over generic text', () => {
    expect(
      describeRule({
        type: 'string',
        rules: [{ name: 'pattern', args: {} }],
        preferences: {
          messages: {
            'string.pattern.base': 'must be a first-of-month date (YYYY-MM-01)'
          }
        }
      })
    ).toBe('Must be a first-of-month date (YYYY-MM-01)')
  })

  it('renders generic free text with length and permitted characters', () => {
    expect(
      describeRule({
        type: 'string',
        rules: [
          { name: 'pattern', args: {} },
          { name: 'max', args: { limit: 100 } }
        ],
        preferences: {
          messages: {
            'string.pattern.base': 'must contain only permitted characters'
          }
        }
      })
    ).toBe('Text, at most 100 characters, permitted characters only')
  })
})

describe('describeTrigger', () => {
  it('recognises a positive-tonnage trigger', () => {
    const rule = { requiredBy: 'supplier', trigger: (d) => Number(d.T) > 0 }
    expect(describeTrigger(rule, ['A', 'T'])).toBe('Positive T')
  })

  it('recognises an answered-yes trigger', () => {
    const rule = { requiredBy: 'interim', trigger: (d) => d.Q === 'Yes' }
    expect(describeTrigger(rule, ['A', 'Q'])).toBe('Q = Yes')
  })

  it('throws when no candidate field fires the predicate', () => {
    const rule = { requiredBy: 'mystery', trigger: () => false }
    expect(() => describeTrigger(rule, ['A', 'B'])).toThrow(/mystery/)
  })
})

describe('contributionReasons', () => {
  it('returns nothing for a section with no classifier', () => {
    expect(contributionReasons({}, new Set())).toEqual([])
  })

  it('extracts reasons from source, adds MISSING, orders and maps outcomes', () => {
    const classifier = () => {
      // CLASSIFICATION_REASON.PRN_ISSUED CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD
      return null
    }
    expect(
      contributionReasons(
        { classifyForWasteBalance: classifier },
        new Set(['x'])
      )
    ).toEqual([
      { reason: 'MISSING_REQUIRED_FIELD', outcome: 'excluded' },
      { reason: 'OUTSIDE_ACCREDITATION_PERIOD', outcome: 'ignored' },
      { reason: 'PRN_ISSUED', outcome: 'excluded' }
    ])
  })

  it('omits MISSING when the section has no required fields', () => {
    const classifier = () => {
      // CLASSIFICATION_REASON.PRN_ISSUED
      return null
    }
    expect(
      contributionReasons({ classifyForWasteBalance: classifier }, new Set())
    ).toEqual([{ reason: 'PRN_ISSUED', outcome: 'excluded' }])
  })
})

describe('requiredForBalance', () => {
  it('returns an empty set for a section with no classifier', () => {
    expect(requiredForBalance({}, ['A', 'B']).size).toBe(0)
  })

  it('detects the required column via the blank probe', () => {
    const schema = {
      classifyForWasteBalance: (data) =>
        data.A === ''
          ? {
              outcome: 'EXCLUDED',
              reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'A' }]
            }
          : { outcome: 'INCLUDED', reasons: [] }
    }
    const required = requiredForBalance(schema, ['A', 'B'])
    expect([...required]).toEqual(['A'])
  })

  it('treats a thrown classifier as not-required (the catch path)', () => {
    const schema = {
      classifyForWasteBalance: (data) => {
        if (data.A === '') {
          return {
            outcome: 'EXCLUDED',
            reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'A' }]
          }
        }
        if (data.B === '') {
          throw new Error('downstream parse of placeholder value')
        }
        return { outcome: 'INCLUDED', reasons: [] }
      }
    }
    expect([...requiredForBalance(schema, ['A', 'B'])]).toEqual(['A'])
  })
})

describe('generateDocument (against the real schemas)', () => {
  const doc = generateDocument()

  it('covers every template', () => {
    for (const heading of [
      '## Exporter (accredited)',
      '## Exporter (registered only)',
      '## Reprocessor input (accredited)',
      '## Reprocessor output (accredited)',
      '## Reprocessor (registered only)'
    ]) {
      expect(doc).toContain(heading)
    }
  })

  it('lists the accredited exporter Exported contribution reasons', () => {
    // Golden guard for the source-scrape mechanism: a refactor that hides a
    // reason from contributionReasons would drop it here and fail this test.
    const exported = doc.slice(doc.indexOf('#### Exported sheet (`exported`)'))
    const section = exported.slice(0, exported.indexOf('| Column |'))
    for (const reason of [
      'MISSING_REQUIRED_FIELD',
      'OUTSIDE_ACCREDITATION_PERIOD',
      'WASTE_STOPPED',
      'WASTE_REFUSED',
      'ORS_NOT_FOUND',
      'ORS_NOT_APPROVED',
      'PRN_ISSUED'
    ]) {
      expect(section).toContain(`\`${reason}\``)
    }
  })

  it('marks the generated file as not for hand editing', () => {
    expect(doc).toContain('do not edit by hand')
    expect(doc).not.toContain('cannot drift')
  })
})
