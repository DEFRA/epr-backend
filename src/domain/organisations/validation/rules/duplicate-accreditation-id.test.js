import { describe, it, expect } from 'vitest'
import { duplicateAccreditationIdRule } from './duplicate-accreditation-id.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations: [], accreditations })
  )

describe('duplicateAccreditationIdRule', () => {
  it('is an error-severity rule', () => {
    expect(duplicateAccreditationIdRule.code).toBe('DUPLICATE_ACCREDITATION_ID')
    expect(duplicateAccreditationIdRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags an id shared by more than one accreditation, once', () => {
    const org = organisation([
      { id: 'acc-1' },
      { id: 'acc-1' },
      { id: 'acc-1' }
    ])

    expect(duplicateAccreditationIdRule.evaluate(org)).toEqual([
      {
        code: 'DUPLICATE_ACCREDITATION_ID',
        severity: SEVERITY.ERROR,
        target: { type: TARGET_TYPE.ACCREDITATION, id: 'acc-1' },
        message: 'Accreditation id acc-1 is used by more than one accreditation'
      }
    ])
  })

  it('does not flag distinct accreditation ids', () => {
    const org = organisation([{ id: 'acc-1' }, { id: 'acc-2' }])

    expect(duplicateAccreditationIdRule.evaluate(org)).toEqual([])
  })
})
