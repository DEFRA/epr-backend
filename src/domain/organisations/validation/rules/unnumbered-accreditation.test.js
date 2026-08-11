import { describe, it, expect } from 'vitest'
import { unnumberedAccreditationRule } from './unnumbered-accreditation.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { AccreditationStatus, Organisation } from '#domain/organisations/model.js' */

const organisation = (accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', accreditations })
  )

/** @param {AccreditationStatus[]} statuses */
const historyOf = (...statuses) =>
  statuses.map((status) => ({ status, updatedAt: '2026-01-01' }))

const issueFor = (accreditationId) => ({
  code: 'UNNUMBERED_ACCREDITATION',
  severity: SEVERITY.ERROR,
  target: { type: TARGET_TYPE.ACCREDITATION, id: accreditationId },
  message: `Accreditation ${accreditationId} has been accredited but carries no valid accreditation number`
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
        statusHistory: historyOf('created', 'approved')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accreditation demoted out of approval that lost its number', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        statusHistory: historyOf('created', 'approved', 'created')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accreditation cancelled after approval that lost its number', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        statusHistory: historyOf('created', 'approved', 'cancelled')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags a suspended accreditation whose number is absent', () => {
    const org = organisation([
      { id: 'acc-1', statusHistory: historyOf('approved', 'suspended') }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accredited accreditation whose number is blank', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: '   ',
        statusHistory: historyOf('approved')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accredited accreditation whose number is numeric', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: 12345,
        statusHistory: historyOf('approved')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accredited accreditation that no registration references', () => {
    const org = organisation([
      {
        id: 'acc-orphaned',
        accreditationNumber: null,
        statusHistory: historyOf('created', 'approved', 'created')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([
      issueFor('acc-orphaned')
    ])
  })

  it('does not flag an accreditation that has never been accredited', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        statusHistory: historyOf('created')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([])
  })

  it('does not flag an accreditation rejected without ever being accredited', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        statusHistory: historyOf('created', 'rejected')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([])
  })

  it('does not flag an accredited accreditation that carries a number', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: 'EA-1234',
        statusHistory: historyOf('approved')
      }
    ])

    expect(unnumberedAccreditationRule.evaluate(org)).toEqual([])
  })

  it('flags every unnumbered accreditation the organisation holds', () => {
    const org = organisation([
      {
        id: 'acc-1',
        accreditationNumber: null,
        statusHistory: historyOf('approved')
      },
      {
        id: 'acc-numbered',
        accreditationNumber: 'EA-1234',
        statusHistory: historyOf('approved')
      },
      {
        id: 'acc-2',
        accreditationNumber: null,
        statusHistory: historyOf('approved')
      }
    ])

    const targets = unnumberedAccreditationRule
      .evaluate(org)
      .map((issue) => issue.target.id)

    expect(targets).toEqual(['acc-1', 'acc-2'])
  })
})
