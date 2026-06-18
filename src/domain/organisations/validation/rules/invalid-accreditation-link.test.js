import { describe, it, expect } from 'vitest'
import { invalidAccreditationLinkRule } from './invalid-accreditation-link.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

const exporterReg = (id, accreditationId) => ({
  id,
  accreditationId,
  wasteProcessingType: 'exporter',
  material: 'plastic'
})

const exporterAcc = (id) => ({
  id,
  wasteProcessingType: 'exporter',
  material: 'plastic'
})

describe('invalidAccreditationLinkRule', () => {
  it('is an error-severity rule with the correct code', () => {
    expect(invalidAccreditationLinkRule.code).toBe('INVALID_ACCREDITATION_LINK')
    expect(invalidAccreditationLinkRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags a registration linked to a semantically mismatched accreditation', () => {
    const org = organisation(
      [exporterReg('reg-1', 'acc-1')],
      [
        {
          id: 'acc-1',
          wasteProcessingType: 'reprocessor',
          material: 'plastic',
          site: { address: { postcode: 'SW1A 1AA' } }
        }
      ]
    )

    const issues = invalidAccreditationLinkRule.evaluate(org)

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: 'INVALID_ACCREDITATION_LINK',
      severity: SEVERITY.ERROR,
      target: { type: TARGET_TYPE.REGISTRATION, id: 'reg-1' }
    })
    expect(issues[0].message).toContain('reg-1')
    expect(issues[0].message).toContain('acc-1')
    expect(issues[0].message).toContain('key=')
  })

  it('does not flag a registration with a fully matching accreditation link', () => {
    const org = organisation(
      [exporterReg('reg-1', 'acc-1')],
      [exporterAcc('acc-1')]
    )

    expect(invalidAccreditationLinkRule.evaluate(org)).toEqual([])
  })

  it('does not flag a registration with no accreditationId', () => {
    const org = organisation(
      [{ id: 'reg-1', wasteProcessingType: 'exporter', material: 'plastic' }],
      []
    )

    expect(invalidAccreditationLinkRule.evaluate(org)).toEqual([])
  })

  it('does not flag when the accreditation ID does not exist (left to dangling-ref rule)', () => {
    const org = organisation(
      [exporterReg('reg-1', 'acc-missing')],
      [exporterAcc('acc-1')]
    )

    expect(invalidAccreditationLinkRule.evaluate(org)).toEqual([])
  })
})
