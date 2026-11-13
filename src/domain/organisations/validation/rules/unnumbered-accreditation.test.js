import { describe, it, expect } from 'vitest'
import { unnumberedAccreditationRule } from './unnumbered-accreditation.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { StoredAccreditationStatus, Organisation } from '#domain/organisations/model.js' */

/**
 * The fields the rule reads. The number is `unknown` so a test can store a
 * malformed one.
 *
 * @typedef {{ id: string, status: StoredAccreditationStatus, accreditationNumber?: unknown }} StoredAccreditation
 */

/** @param {StoredAccreditation[]} accreditations */
const organisation = (accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', accreditations })
  )

/** @param {string} accreditationId */
const issueFor = (accreditationId) => ({
  code: 'UNNUMBERED_ACCREDITATION',
  severity: SEVERITY.ERROR,
  target: { type: TARGET_TYPE.ACCREDITATION, id: accreditationId },
  message: `Accreditation ${accreditationId} is approved or suspended but carries no valid accreditation number`
})

describe('unnumberedAccreditationRule', () => {
  it('is an error-severity rule', () => {
    expect(unnumberedAccreditationRule.code).toBe('UNNUMBERED_ACCREDITATION')
    expect(unnumberedAccreditationRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags an approved accreditation whose number is null', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        status: ACCREDITATION_STATUS.APPROVED
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags a suspended accreditation whose number is absent', () => {
    const org = organisation([
      { id: 'acc-1', status: ACCREDITATION_STATUS.SUSPENDED }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an approved accreditation whose number is blank', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: '   ',
        status: ACCREDITATION_STATUS.APPROVED
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an approved accreditation whose number is numeric', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: 12345,
        status: ACCREDITATION_STATUS.APPROVED
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it.each([
    ACCREDITATION_STATUS.CREATED,
    ACCREDITATION_STATUS.REJECTED,
    ACCREDITATION_STATUS.CANCELLED
  ])('does not flag a %s accreditation without a number', (status) => {
    const org = organisation([
      { id: 'acc-1', accreditationNumber: null, status }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([])
  })

  it('does not flag an approved accreditation that carries a number', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: 'EA-1234',
        status: ACCREDITATION_STATUS.APPROVED
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([])
  })

  it('flags every unnumbered accreditation the organisation holds', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        status: ACCREDITATION_STATUS.APPROVED
      },
      {
        id: 'acc-numbered',
        accreditationNumber: 'EA-1234',
        status: ACCREDITATION_STATUS.APPROVED
      },
      {
        id: 'acc-2',
        accreditationNumber: null,
        status: ACCREDITATION_STATUS.SUSPENDED
      }
    ])

    const targets = unnumberedAccreditationRule
      .evaluate(org)
      .map((issue) => issue.target.id)

    expect(targets).toEqual(['acc-1', 'acc-2'])
  })
})
