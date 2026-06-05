import { describe, it, expect } from 'vitest'
import { materialMismatchRule } from './material-mismatch.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

describe('materialMismatchRule', () => {
  it('is a warning-severity rule', () => {
    expect(materialMismatchRule.code).toBe('MATERIAL_MISMATCH')
    expect(materialMismatchRule.severity).toBe(SEVERITY.WARNING)
  })

  it('flags a registration whose material differs from its linked accreditation', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1', material: 'plastic' }],
      [{ id: 'acc-1', material: 'glass' }]
    )

    expect(materialMismatchRule.evaluate(org)).toEqual([
      {
        code: 'MATERIAL_MISMATCH',
        severity: SEVERITY.WARNING,
        target: { type: TARGET_TYPE.REGISTRATION, id: 'reg-1' },
        message:
          'Registration reg-1 material plastic does not match linked accreditation acc-1 material glass'
      }
    ])
  })

  it('does not flag a registration whose material matches its linked accreditation', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1', material: 'glass' }],
      [{ id: 'acc-1', material: 'glass' }]
    )

    expect(materialMismatchRule.evaluate(org)).toEqual([])
  })

  it('does not flag a registration with no accreditation link', () => {
    const org = organisation([{ id: 'reg-1', material: 'glass' }], [])

    expect(materialMismatchRule.evaluate(org)).toEqual([])
  })

  it('leaves a dangling reference to the dangling-reference rule', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-missing', material: 'glass' }],
      [{ id: 'acc-1', material: 'plastic' }]
    )

    expect(materialMismatchRule.evaluate(org)).toEqual([])
  })
})
