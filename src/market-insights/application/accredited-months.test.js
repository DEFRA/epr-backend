import { describe, it, expect } from 'vitest'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REGISTRATION_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { partialMock } from '#test/type-helpers.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { accreditedMonths } from './accredited-months.js'

const { buildReadOrganisation } = createOrganisationBuilders()

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

let sequence = 0

/**
 * An organisation holding one reprocessor registration and its accreditation
 * for 2026.
 *
 * @param {{
 *   statusHistory?: { status: AccreditationStatus, updatedAt: string }[],
 *   validFrom?: string
 * }} [accreditation]
 */
const operatorAccredited = ({
  statusHistory = granted,
  validFrom = '2026-01-01'
} = {}) => {
  sequence += 1
  const accreditation = buildAccreditation({
    accreditationNumber: toAccreditationNumber(`ACC-${sequence}`),
    statusHistory,
    validFrom,
    validTo: '2026-12-31',
    material: MATERIAL.PLASTIC,
    glassRecyclingProcess: null
  })
  const registration = buildRegistration({
    registrationNumber: `REG-${sequence}`,
    accreditationId: accreditation.id,
    material: MATERIAL.PLASTIC,
    glassRecyclingProcess: null,
    reprocessingType: REPROCESSING_TYPE.INPUT,
    statusHistory: [
      { status: REGISTRATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
    ],
    validFrom: '2025-12-01'
  })
  return buildReadOrganisation({
    registrations: [partialMock(registration)],
    accreditations: [accreditation]
  })
}

/** @param {ReturnType<typeof operatorAccredited>[]} organisations */
const readModelOf = async (organisations) =>
  (await organisationReadRepositoryOf(organisations))().findAll()

/** @param {ReturnType<typeof operatorAccredited>} organisation */
const monthsOf = async (organisation) =>
  [
    ...accreditedMonths({
      organisations: await readModelOf([organisation]),
      months: JANUARY_TO_MARCH_2026
    })
  ].map(({ month }) => month)

describe('accreditedMonths', () => {
  it('yields every month served of an accreditation granted throughout', async () => {
    expect(await monthsOf(operatorAccredited())).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields a month the accreditation stood suspended throughout', async () => {
    const suspended = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.SUSPENDED, '2026-01-20')
      ]
    })

    expect(await monthsOf(suspended)).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields the month an accreditation was cancelled in, and none after', async () => {
    const cancelled = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.CANCELLED, '2026-02-10')
      ]
    })

    expect(await monthsOf(cancelled)).toEqual(['2026-01', '2026-02'])
  })

  it('leaves out a month the accreditation stood cancelled throughout, and yields the month it was reinstated in', async () => {
    const reinstated = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.CANCELLED, '2026-01-20'),
        then(ACCREDITATION_STATUS.APPROVED, '2026-03-10')
      ]
    })

    expect(await monthsOf(reinstated)).toEqual(['2026-01', '2026-03'])
  })

  it('leaves out the months before the window opens, and yields the month it opens in', async () => {
    const partway = operatorAccredited({ validFrom: '2026-02-15' })

    expect(await monthsOf(partway)).toEqual(['2026-02', '2026-03'])
  })

  it('yields the months of a window backdated before the approval', async () => {
    const backdated = operatorAccredited({
      statusHistory: [
        then(ACCREDITATION_STATUS.CREATED, '2025-11-01'),
        then(ACCREDITATION_STATUS.APPROVED, '2026-02-15')
      ]
    })

    expect(await monthsOf(backdated)).toEqual(JANUARY_TO_MARCH_2026)
  })

  it('yields nothing for an accreditation never granted', async () => {
    const refused = operatorAccredited({
      statusHistory: [
        then(ACCREDITATION_STATUS.CREATED, '2025-11-01'),
        then(ACCREDITATION_STATUS.REJECTED, '2025-11-20')
      ]
    })

    expect(await monthsOf(refused)).toEqual([])
  })

  it('yields nothing for an accreditation reverted to draft, then cancelled with its registration', async () => {
    const reverted = operatorAccredited({
      statusHistory: [
        ...granted,
        then(ACCREDITATION_STATUS.CREATED, '2026-02-01'),
        then(ACCREDITATION_STATUS.CANCELLED, '2026-02-10')
      ]
    })

    expect(await monthsOf(reverted)).toEqual([])
  })

  it('yields only the registrations the caller covers', async () => {
    const covered = operatorAccredited()
    const uncovered = operatorAccredited()

    const months = [
      ...accreditedMonths({
        organisations: await readModelOf([covered, uncovered]),
        months: JANUARY_TO_MARCH_2026,
        covers: ({ organisationNumber }) =>
          organisationNumber === covered.organisationNumber
      })
    ]

    expect(months.map(({ organisationNumber }) => organisationNumber)).toEqual(
      JANUARY_TO_MARCH_2026.map(() => covered.organisationNumber)
    )
  })
})
