import { describe, it, expect } from 'vitest'
import { sharedAccreditationRule } from './shared-accreditation.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

describe('sharedAccreditationRule', () => {
  it('is a warning-severity rule', () => {
    expect(sharedAccreditationRule.code).toBe('SHARED_ACCREDITATION')
    expect(sharedAccreditationRule.severity).toBe(SEVERITY.WARNING)
  })

  it('flags an accreditation referenced by more than one registration, once', () => {
    const org = organisation(
      [
        { id: 'reg-1', accreditationId: 'acc-1' },
        { id: 'reg-2', accreditationId: 'acc-1' }
      ],
      [{ id: 'acc-1' }]
    )

    expect(sharedAccreditationRule.evaluate(org)).toEqual([
      {
        code: 'SHARED_ACCREDITATION',
        severity: SEVERITY.WARNING,
        target: { type: TARGET_TYPE.ACCREDITATION, id: 'acc-1' },
        message: 'Accreditation acc-1 is shared by more than one registration'
      }
    ])
  })

  it('does not flag accreditations referenced at most once', () => {
    const org = organisation(
      [
        { id: 'reg-1', accreditationId: 'acc-1' },
        { id: 'reg-2', accreditationId: 'acc-2' },
        { id: 'reg-3' }
      ],
      [{ id: 'acc-1' }, { id: 'acc-2' }]
    )

    expect(sharedAccreditationRule.evaluate(org)).toEqual([])
  })
})
