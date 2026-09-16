import { describe, it, expect } from 'vitest'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REGISTRATION_STATUS,
  REPROCESSING_TYPE,
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
import { buildDraftReport } from '#vite/helpers/build-draft-report.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { countOutstandingReturns } from './outstanding-returns.js'

/** @import { AppliedForMaterial, Organisation, TonnageBand } from '#domain/organisations/model.js' */
/** @import { StatusHistoryEntry } from '#domain/organisations/accreditation.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/** @type {StatusHistoryEntry[]} */
const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/**
 * A 24-hex id the reports store accepts, distinct per prefix and operator.
 *
 * @param {string} prefix - one hex character
 * @param {number} orgId
 */
const objectIdFor = (prefix, orgId) => `${prefix}${orgId}`.padStart(24, '0')

/**
 * An operator accredited for the whole of 2026, holding one registration.
 *
 * @param {{
 *   orgId: number,
 *   material?: AppliedForMaterial,
 *   tonnageBand?: TonnageBand,
 *   statusHistory?: StatusHistoryEntry[],
 *   validity?: { validFrom?: string, validTo?: string }
 * }} options
 */
const makeOperator = ({
  orgId,
  material = MATERIAL.PLASTIC,
  tonnageBand = TONNAGE_BAND.UP_TO_500,
  statusHistory = approvedHistory,
  validity = { validFrom: '2026-01-01', validTo: '2026-12-31' }
}) => {
  const id = objectIdFor('a', orgId)
  const registrationId = objectIdFor('b', orgId)
  const accreditationId = `acc-${orgId}`

  return {
    // Deeply partial, so partialMock's shallow check cannot stand it in.
    organisation: /** @type {Organisation} */ (
      /** @type {unknown} */ ({
        id,
        orgId,
        statusHistory: approvedHistory,
        registrations: [
          {
            id: registrationId,
            accreditationId,
            status: REGISTRATION_STATUS.APPROVED,
            statusHistory: approvedHistory,
            material,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            reprocessingType: REPROCESSING_TYPE.INPUT
          }
        ],
        accreditations: [
          {
            id: accreditationId,
            status: statusHistory.at(-1)?.status,
            statusHistory,
            ...validity,
            material,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            reprocessingType: REPROCESSING_TYPE.INPUT,
            prnIssuance: { tonnageBand }
          }
        ]
      })
    ),
    reportRef: { organisationId: id, registrationId }
  }
}

/**
 * The same operator holding only a registration, so it reports quarterly.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 */
const registeredOnly = ({ organisation }) => ({
  ...organisation,
  registrations: organisation.registrations.map(
    ({ accreditationId: _accreditationId, ...registration }) => registration
  ),
  accreditations: []
})

/**
 * @typedef {{ operator: ReturnType<typeof makeOperator>, period: number, submissionNumber?: number }} MonthlyReportRef
 */

/**
 * @param {MonthlyReportRef} ref
 */
const reportParams = ({ operator, period, submissionNumber }) => ({
  ...operator.reportRef,
  year: 2026,
  cadence: 'monthly',
  period,
  submissionNumber
})

/**
 * Count over the given operators, with every report written through the
 * reports store: submissions (a resubmission carries its submission number),
 * drafts never submitted, and reports submitted and then unsubmitted.
 *
 * @param {{
 *   operators: Organisation[],
 *   submissions?: MonthlyReportRef[],
 *   drafts?: MonthlyReportRef[],
 *   unsubmissions?: MonthlyReportRef[]
 * }} options
 */
const count = async ({
  operators,
  submissions = [],
  drafts = [],
  unsubmissions = []
}) => {
  const reportsRepository = createInMemoryReportsRepository()()
  for (const ref of submissions) {
    await buildSubmittedReport(reportsRepository, reportParams(ref))
  }
  for (const ref of drafts) {
    await buildDraftReport(reportsRepository, reportParams(ref))
  }
  for (const ref of unsubmissions) {
    await buildUnsubmittedReport(reportsRepository, reportParams(ref))
  }
  return countOutstandingReturns({
    organisations: operators,
    periodicReports: await reportsRepository.findAllPeriodicReports(),
    months: JANUARY_TO_MARCH_2026
  })
}

/**
 * The cells holding a count, flattened to one row each.
 *
 * @param {Awaited<ReturnType<typeof count>>} counts
 */
const outstanding = (counts) =>
  Object.entries(counts).flatMap(([month, byMaterial]) =>
    Object.entries(byMaterial).flatMap(([material, byBand]) =>
      Object.entries(byBand)
        .filter(([, n]) => n !== 0)
        .map(([tonnageBand, n]) => ({ month, material, tonnageBand, n }))
    )
  )

describe('countOutstandingReturns', () => {
  it('carries a cell for every month served, material and tonnage band, at zero when nothing is owed', async () => {
    const counts = await count({ operators: [] })

    expect(Object.keys(counts)).toEqual(JANUARY_TO_MARCH_2026)
    for (const byMaterial of Object.values(counts)) {
      expect(Object.keys(byMaterial)).toEqual(TONNAGE_MONITORING_MATERIALS)
      for (const byBand of Object.values(byMaterial)) {
        expect(byBand).toEqual({
          [TONNAGE_BAND.UP_TO_500]: 0,
          [TONNAGE_BAND.UP_TO_5000]: 0,
          [TONNAGE_BAND.UP_TO_10000]: 0,
          [TONNAGE_BAND.OVER_10000]: 0
        })
      }
    }
  })

  it('counts an operator who has not submitted as outstanding for every month it owes', async () => {
    const operator = makeOperator({ orgId: 500030 })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([
      { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('does not count a month the operator has submitted for', async () => {
    const operator = makeOperator({ orgId: 500031 })

    const counts = await count({
      operators: [operator.organisation],
      submissions: [{ operator, period: 1 }]
    })

    expect(outstanding(counts)).toEqual([
      { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('treats a resubmitted month the same as one submitted once', async () => {
    const operator = makeOperator({ orgId: 500032 })

    const counts = await count({
      operators: [operator.organisation],
      submissions: [
        { operator, period: 1 },
        { operator, period: 1, submissionNumber: 2 }
      ]
    })

    expect(outstanding(counts)).toEqual([
      { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('still counts a month whose report is a draft never submitted', async () => {
    const operator = makeOperator({ orgId: 500039 })

    const counts = await count({
      operators: [operator.organisation],
      drafts: [{ operator, period: 1 }]
    })

    expect(outstanding(counts)).toEqual([
      { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('does not count a month whose report was submitted and then unsubmitted, as the public register does', async () => {
    const operator = makeOperator({ orgId: 500040 })

    const counts = await count({
      operators: [operator.organisation],
      unsubmissions: [{ operator, period: 1 }]
    })

    expect(outstanding(counts)).toEqual([
      { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('still counts an accreditation suspended throughout the period, since a suspended accreditation owes its reports', async () => {
    const operator = makeOperator({
      orgId: 500041,
      statusHistory: [
        ...approvedHistory,
        { status: ACCREDITATION_STATUS.SUSPENDED, updatedAt: '2025-12-15' }
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([
      { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
      { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('counts nothing for an accreditation cancelled throughout the period', async () => {
    const operator = makeOperator({
      orgId: 500033,
      statusHistory: [
        ...approvedHistory,
        { status: ACCREDITATION_STATUS.CANCELLED, updatedAt: '2025-12-15' }
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([])
  })

  it('counts nothing for an accreditation rejected before the period, though it carries validity dates', async () => {
    const operator = makeOperator({
      orgId: 500042,
      statusHistory: [
        { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
        { status: ACCREDITATION_STATUS.REJECTED, updatedAt: '2025-11-20' }
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([])
  })

  it('counts nothing for an approved accreditation since reverted to draft and stripped of its dates', async () => {
    const operator = makeOperator({
      orgId: 500045,
      statusHistory: [
        ...approvedHistory,
        { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2026-02-01' }
      ],
      validity: {}
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([])
  })

  it('counts nothing for an accreditation still awaiting a decision, though it carries validity dates', async () => {
    const operator = makeOperator({
      orgId: 500043,
      statusHistory: [
        { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' }
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([])
  })

  it('still counts the months an accreditation held before its cancellation', async () => {
    const operator = makeOperator({
      orgId: 500044,
      statusHistory: [
        ...approvedHistory,
        { status: ACCREDITATION_STATUS.CANCELLED, updatedAt: '2026-02-01' }
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([
      { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
    ])
  })

  it('counts nothing for a registered-only operator, which reports quarterly', async () => {
    const operator = makeOperator({ orgId: 500034 })

    const counts = await count({ operators: [registeredOnly(operator)] })

    expect(outstanding(counts)).toEqual([])
  })

  it('separates materials and tonnage bands, and sums operators sharing both', async () => {
    const smallPlastic = makeOperator({ orgId: 500035 })
    const anotherSmallPlastic = makeOperator({ orgId: 500036 })
    const largePlastic = makeOperator({
      orgId: 500037,
      tonnageBand: TONNAGE_BAND.OVER_10000
    })
    const smallWood = makeOperator({ orgId: 500038, material: MATERIAL.WOOD })

    const counts = await count({
      operators: [
        smallPlastic.organisation,
        anotherSmallPlastic.organisation,
        largePlastic.organisation,
        smallWood.organisation
      ],
      submissions: [
        { operator: smallPlastic, period: 2 },
        { operator: anotherSmallPlastic, period: 2 },
        { operator: largePlastic, period: 2 },
        { operator: smallWood, period: 2 },
        { operator: smallPlastic, period: 3 },
        { operator: anotherSmallPlastic, period: 3 },
        { operator: largePlastic, period: 3 },
        { operator: smallWood, period: 3 }
      ]
    })

    expect(outstanding(counts)).toEqual([
      { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 2 },
      {
        month: '2026-01',
        material: 'plastic',
        tonnageBand: 'over_10000',
        n: 1
      },
      { month: '2026-01', material: 'wood', tonnageBand: 'up_to_500', n: 1 }
    ])
  })
})
