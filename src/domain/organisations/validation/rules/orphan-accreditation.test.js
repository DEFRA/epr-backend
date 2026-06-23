import { describe, it, expect } from 'vitest'
import { orphanAccreditationRule } from './orphan-accreditation.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

describe('orphanAccreditationRule', () => {
  it('is a warning-severity rule', () => {
    expect(orphanAccreditationRule.code).toBe('ORPHAN_ACCREDITATION')
    expect(orphanAccreditationRule.severity).toBe(SEVERITY.WARNING)
  })

  it('flags an accreditation referenced by no registration', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1' }, { id: 'acc-orphan' }]
    )

    expect(orphanAccreditationRule.evaluate(org)).toEqual([
      {
        code: 'ORPHAN_ACCREDITATION',
        severity: SEVERITY.WARNING,
        target: { type: TARGET_TYPE.ACCREDITATION, id: 'acc-orphan' },
        message:
          'Accreditation acc-orphan is not referenced by any registration'
      }
    ])
  })

  it('does not flag accreditations that are referenced', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1' }]
    )

    expect(orphanAccreditationRule.evaluate(org)).toEqual([])
  })
})
