import { describe, it, expect } from 'vitest'
import { validateOrganisation } from './validate-organisation.js'
import { SEVERITY } from './issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

describe('validateOrganisation', () => {
  it('returns no issues for a conforming organisation', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1', material: 'glass' }],
      [{ id: 'acc-1', material: 'glass' }]
    )

    expect(validateOrganisation(org)).toEqual([])
  })

  it('returns no issues for an organisation with no registrations or accreditations', () => {
    expect(validateOrganisation(organisation([], []))).toEqual([])
  })

  it('aggregates issues from every rule', () => {
    const org = organisation(
      [
        { id: 'reg-1', accreditationId: 'acc-missing', material: 'glass' },
        { id: 'reg-1', accreditationId: 'acc-1', material: 'plastic' }
      ],
      [
        { id: 'acc-1', material: 'glass' },
        { id: 'acc-orphan', material: 'glass' }
      ]
    )

    const codes = validateOrganisation(org).map((issue) => issue.code)

    expect(codes).toContain('DANGLING_ACCREDITATION_REF')
    expect(codes).toContain('DUPLICATE_REGISTRATION_ID')
    expect(codes).toContain('ORPHAN_ACCREDITATION')
    expect(codes).toContain('MATERIAL_MISMATCH')
  })

  it('classifies structural breakages as errors and relationship oddities as warnings', () => {
    const org = organisation(
      [
        { id: 'reg-1', accreditationId: 'acc-1', material: 'glass' },
        { id: 'reg-2', accreditationId: 'acc-1', material: 'glass' }
      ],
      [
        { id: 'acc-1', material: 'glass' },
        { id: 'acc-1', material: 'glass' }
      ]
    )

    const bySeverity = validateOrganisation(org).reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1
      return acc
    }, /** @type {Record<string, number>} */ ({}))

    expect(bySeverity[SEVERITY.ERROR]).toBeGreaterThan(0)
    expect(bySeverity[SEVERITY.WARNING]).toBeGreaterThan(0)
  })
})
