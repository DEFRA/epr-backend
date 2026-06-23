import { describe, it, expect } from 'vitest'
import { danglingAccreditationRefRule } from './dangling-accreditation-ref.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

describe('danglingAccreditationRefRule', () => {
  it('is an error-severity rule', () => {
    expect(danglingAccreditationRefRule.code).toBe('DANGLING_ACCREDITATION_REF')
    expect(danglingAccreditationRefRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags a registration whose accreditationId matches no accreditation', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-missing' }],
      [{ id: 'acc-other' }]
    )

    expect(danglingAccreditationRefRule.evaluate(org)).toEqual([
      {
        code: 'DANGLING_ACCREDITATION_REF',
        severity: SEVERITY.ERROR,
        target: { type: TARGET_TYPE.REGISTRATION, id: 'reg-1' },
        message:
          'Registration reg-1 references accreditation acc-missing, which does not exist on the organisation'
      }
    ])
  })

  it('does not flag a registration whose accreditationId resolves', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1' }]
    )

    expect(danglingAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag a registration with no accreditationId', () => {
    const org = organisation([{ id: 'reg-1' }], [])

    expect(danglingAccreditationRefRule.evaluate(org)).toEqual([])
  })
})
