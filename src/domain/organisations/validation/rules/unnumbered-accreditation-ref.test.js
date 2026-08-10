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

const issueFor = (accreditationId) => ({
  code: 'UNNUMBERED_ACCREDITATION_REF',
  severity: SEVERITY.ERROR,
  target: { type: TARGET_TYPE.REGISTRATION, id: 'reg-1' },
  message: `Registration reg-1 references accreditation ${accreditationId}, which carries no accreditation number`
})

describe('unnumberedAccreditationRefRule', () => {
  it('is an error-severity rule', () => {
    expect(unnumberedAccreditationRefRule.code).toBe(
      'UNNUMBERED_ACCREDITATION_REF'
    )
    expect(unnumberedAccreditationRefRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags a registration whose accreditation has a null accreditationNumber', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1', accreditationNumber: null }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags a registration whose accreditation has no accreditationNumber at all', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1' }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags a registration whose accreditation has a blank accreditationNumber', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1', accreditationNumber: '   ' }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('flags a registration whose accreditation has a numeric accreditationNumber', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1', accreditationNumber: 12345 }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([
      issueFor('acc-1')
    ])
  })

  it('does not flag a registration whose accreditation carries a number', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-1' }],
      [{ id: 'acc-1', accreditationNumber: 'EA-1234' }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag a registration with no accreditationId', () => {
    const org = organisation([{ id: 'reg-1' }], [])

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag a registration whose accreditationId dangles', () => {
    const org = organisation(
      [{ id: 'reg-1', accreditationId: 'acc-missing' }],
      [{ id: 'acc-other', accreditationNumber: null }]
    )

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('does not flag an unnumbered accreditation that no registration references', () => {
    const org = organisation([], [{ id: 'acc-1', accreditationNumber: null }])

    expect(unnumberedAccreditationRefRule.evaluate(org)).toEqual([])
  })

  it('flags every registration that references an unnumbered accreditation', () => {
    const org = organisation(
      [
        { id: 'reg-1', accreditationId: 'acc-1' },
        { id: 'reg-2', accreditationId: 'acc-2' }
      ],
      [
        { id: 'acc-1', accreditationNumber: null },
        { id: 'acc-2', accreditationNumber: null }
      ]
    )

    const targets = unnumberedAccreditationRefRule
      .evaluate(org)
      .map((issue) => issue.target.id)

    expect(targets).toEqual(['reg-1', 'reg-2'])
  })
})
