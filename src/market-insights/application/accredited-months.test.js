import { describe, it, expect } from 'vitest'
import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildReadOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { partialMock } from '#test/type-helpers.js'
import { accreditedMonths } from './accredited-months.js'

/** @import { AccreditationStatus } from '#domain/organisations/model.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

const granted = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/**
 * @param {AccreditationStatus} status
 * @param {string} updatedAt
 */
const then = (status, updatedAt) => ({ status, updatedAt })

/**
 * An organisation holding one reprocessor registration and its accreditation.
 *
 * @param {{
 *   statusHistory?: { status: AccreditationStatus, updatedAt: string }[],
 *   validFrom?: string,
 *   validTo?: string
 * }} [accreditation]
 */
const operatorAccredited = ({
  statusHistory = granted,
  validFrom = '2026-01-01',
  validTo = '2026-12-31'
} = {}) => {
  const accreditation = buildAccreditation({
    statusHistory,
    validFrom,
    validTo
  })
  const registration = buildRegistration({
    accreditationId: accreditation.id,
    material: accreditation.material,
    statusHistory: [
      { status: REGISTRATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
    ]
  })
  return buildReadOrganisation({
    registrations: [partialMock(registration)],
    accreditations: [accreditation]
  })
}

/** @param {ReturnType<typeof operatorAccredited>} organisation */
const monthsOf = (organisation) =>
  [
    ...accreditedMonths({
      organisations: [organisation],
      months: JANUARY_TO_MARCH_2026
    })
  ].map(({ month }) => month)

describe('accreditedMonths', () => {
  it('yields every month served of an accreditation granted throughout', () => {
    expect(monthsOf(operatorAccredited())).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields a month the accreditation stood suspended throughout', () => {
    const suspended = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.SUSPENDED, '2026-01-20')
      ]
    })

    expect(monthsOf(suspended)).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields the month an accreditation was cancelled in, and none after', () => {
    const cancelled = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.CANCELLED, '2026-02-10')
      ]
    })

    expect(monthsOf(cancelled)).toEqual(['2026-01', '2026-02'])
  })

  it('leaves out a month the accreditation stood cancelled throughout, and yields the month it was reinstated in', () => {
    const reinstated = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.CANCELLED, '2026-01-20'),
        then(ACCREDITATION_STATUS.APPROVED, '2026-03-10')
      ]
    })

    expect(monthsOf(reinstated)).toEqual(['2026-01', '2026-03'])
  })

  it('leaves out the months outside the validity window, and yields the months the window opens and closes in', () => {
    const partway = operatorAccredited({
      validFrom: '2026-01-20',
      validTo: '2026-02-10'
    })

    expect(monthsOf(partway)).toEqual(['2026-01', '2026-02'])
  })

  it('leaves out a month whose days inside the validity window all stood cancelled', () => {
    const cancelledBeforeItOpened = operatorAccredited({
      validFrom: '2026-02-15',
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.CANCELLED, '2026-02-10'),
        then(ACCREDITATION_STATUS.APPROVED, '2026-03-01')
      ]
    })

    expect(monthsOf(cancelledBeforeItOpened)).toEqual(['2026-03'])
  })

  it('yields nothing for an accreditation never granted', () => {
    const refused = operatorAccredited({
      statusHistory: [
        then(ACCREDITATION_STATUS.CREATED, '2025-11-01'),
        then(ACCREDITATION_STATUS.REJECTED, '2025-11-20')
      ]
    })

    expect(monthsOf(refused)).toEqual([])
  })

  it('yields only the registrations the caller covers', () => {
    const covered = operatorAccredited()
    const uncovered = operatorAccredited()

    const months = [
      ...accreditedMonths({
        organisations: [covered, uncovered],
        months: JANUARY_TO_MARCH_2026,
        covers: ({ org }) => org.id === covered.id
      })
    ]

    expect(months.map(({ org }) => org.id)).toEqual(
      JANUARY_TO_MARCH_2026.map(() => covered.id)
    )
  })
})
