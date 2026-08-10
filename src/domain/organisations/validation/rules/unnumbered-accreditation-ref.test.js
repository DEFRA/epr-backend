import { describe, it, expect } from 'vitest'
import { unnumberedAccreditationRefRule } from './unnumbered-accreditation-ref.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations, accreditations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations })
  )

const historyOf = (...statuses) =>
  statuses.map((status) => ({ status, updatedAt: '2026-01-01' }))

const issueFor = (accreditationId) => ({
  code: 'UNNUMBERED_ACCREDITATION_REF',
  severity: SEVERITY.ERROR,
  target: { type: TARGET_TYPE.REGISTRATION, id: 'reg-1' },
  message: `Registration reg-1 references accreditation ${accreditationId}, which has been accredited but carries no valid accreditation number`
})

describe('unnumberedAccreditationRefRule', () => {
  it('is an error-severity rule', () => {
    expect(unnumberedAccreditationRefRule.code).toBe(
      'UNNUMBERED_ACCREDITATION_REF'
    )
    expect(unnumberedAccreditationRefRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags an approved accreditation whose number is null', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: null,
          statusHistory: historyOf('created', 'approved')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accreditation demoted out of approval that lost its number', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: null,
          statusHistory: historyOf('created', 'approved', 'created')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags a suspended accreditation whose number is absent', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1', statusHistory: historyOf('approved', 'suspended') }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accredited accreditation whose number is blank', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: '   ',
          statusHistory: historyOf('approved')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags an accredited accreditation whose number is numeric', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: 12345,
          statusHistory: historyOf('approved')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('does not flag an accreditation that has never been accredited', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: null,
          statusHistory: historyOf('created')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag an accreditation rejected without ever being accredited', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: null,
          statusHistory: historyOf('created', 'rejected')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag an accredited accreditation that carries a number', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [
        {
          id: 'acc-1',
          accreditationNumber: 'EA-1234',
          statusHistory: historyOf('approved')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag a registration with no accreditationId', () => {
    const org = organisation([{ id: 'reg-1' }], [])

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('leaves a reference to a missing accreditation to the dangling-reference rule', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-missing' }],
      [
        {
          id: 'acc-other',
          accreditationNumber: null,
          statusHistory: historyOf('approved')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag an unnumbered accreditation that no registration references', () => {
    const org = organisation(
      [],
      [
        {
          id: 'acc-1',
          accreditationNumber: null,
          statusHistory: historyOf('approved')
        }
      ]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('flags every registration that references an unnumbered accreditation', () => {
    const org = organisation(
      [
        { id: 'reg-1', accreditationId: 'acc-1' },
        { id: 'reg-2', accreditationId: 'acc-2' }
      ],
      [
        {
          id: 'acc-1',
          accreditationNumber: null,
          statusHistory: historyOf('approved')
        },
        {
          id: 'acc-2',
          accreditationNumber: null,
          statusHistory: historyOf('approved')
        }
      ]
    )

    const targets = unnumberedAccreditationRefRule
      .evaluate(org)
      .map((issue) => issue.target.id)

    expect(targets).toEqual(['reg-1', 'reg-2'])
  })
})
