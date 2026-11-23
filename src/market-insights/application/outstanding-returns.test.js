import { CADENCE } from '#reports/domain/cadence.js'
import { toYear } from '#common/helpers/dates/year.js'
import { describe, it, expect } from 'vitest'
import {
  MATERIAL,
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  accreditationsByYear,
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/test-support.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
import { buildDraftReport } from '#vite/helpers/build-draft-report.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { countOutstandingReturns } from './outstanding-returns.js'

/** @import { Material, TonnageBand } from '#domain/organisations/model.js' */
/** @import { AccreditationStatus, Organisation, StatusTimeline } from '#organisation-read-model/index.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/**
 * @param {AccreditationStatus} status
 * @param {string} at - `YYYY-MM-DD` or an ISO date-time
 */
const changed = (status, at) => ({ status, at: new Date(at).toISOString() })

const APPROVED = changed('approved', '2026-01-01')
const APPROVED_TIMELINE = [APPROVED]

/**
 * An operator accredited for the whole of 2026, holding one registration. With
 * `registeredOnly` it holds only the registration, so it reports quarterly.
 *
 * @param {{
 *   orgId: number,
 *   material?: Material,
 *   tonnageBand?: TonnageBand,
 *   timeline?: StatusTimeline<AccreditationStatus>,
 *   registeredOnly?: boolean
 * }} options
 */
const makeOperator = ({
  orgId,
  material = MATERIAL.PLASTIC,
  tonnageBand = TONNAGE_BAND.UP_TO_500,
  timeline = APPROVED_TIMELINE,
  registeredOnly = false
}) => {
  const registrationNumber = toRegistrationNumber(`REG-${orgId}`)
  const last = /** @type {StatusTimeline<AccreditationStatus>[number]} */ (
    timeline.at(-1)
  )
  const accreditation = buildReadAccreditation({
    accreditationNumber: toAccreditationNumber(`ACC-${orgId}`),
    prnIssuance: { tonnageBand },
    status: { current: last.status, lastUpdatedAt: last.at, timeline }
  })
  const organisationNumber = toOrganisationNumber(String(orgId))

  return {
    organisation: buildReadOrganisation({
      organisationNumber,
      registrations: {
        [registrationNumber]: buildReadReprocessorRegistration({
          material,
          status: approvedStatusFrom('2025-12-01'),
          accreditations: registeredOnly
            ? {}
            : accreditationsByYear(accreditation)
        })
      }
    }),
    reportRef: { organisationNumber, registrationNumber }
  }
}

/**
 * @typedef {{ operator: ReturnType<typeof makeOperator>, period: number, submissionNumber?: number }} MonthlyReportRef
 */

/**
 * @param {MonthlyReportRef} ref
 */
const reportParams = ({ operator, period, submissionNumber }) => ({
  ...operator.reportRef,
  year: toYear(2026),
  cadence: CADENCE.monthly,
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

const EVERY_MONTH = [
  { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
  { month: '2026-02', material: 'plastic', tonnageBand: 'up_to_500', n: 1 },
  { month: '2026-03', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
]

const JANUARY_ONLY = [
  { month: '2026-01', material: 'plastic', tonnageBand: 'up_to_500', n: 1 }
]

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

    expect(outstanding(counts)).toEqual(EVERY_MONTH)
  })

  it('does not count a month the operator has submitted for', async () => {
    const operator = makeOperator({ orgId: 500031 })

    const counts = await count({
      operators: [operator.organisation],
      submissions: [{ operator, period: 1 }]
    })

    expect(outstanding(counts)).toEqual(EVERY_MONTH.slice(1))
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

    expect(outstanding(counts)).toEqual(EVERY_MONTH.slice(1))
  })

  it('still counts a month whose report is a draft never submitted', async () => {
    const operator = makeOperator({ orgId: 500039 })

    const counts = await count({
      operators: [operator.organisation],
      drafts: [{ operator, period: 1 }]
    })

    expect(outstanding(counts)).toEqual(EVERY_MONTH)
  })

  it('does not count a month whose report was submitted and then unsubmitted, as the public register does', async () => {
    const operator = makeOperator({ orgId: 500040 })

    const counts = await count({
      operators: [operator.organisation],
      unsubmissions: [{ operator, period: 1 }]
    })

    expect(outstanding(counts)).toEqual(EVERY_MONTH.slice(1))
  })

  it('owes nothing before the start of an accreditation suspended before it started', async () => {
    const operator = makeOperator({
      orgId: 500042,
      timeline: [
        changed('approved', '2026-03-01'),
        changed('suspended', '2026-03-01')
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(EVERY_MONTH.slice(2))
  })

  it('still counts an accreditation suspended throughout the period, since a suspended accreditation owes its reports', async () => {
    const operator = makeOperator({
      orgId: 500041,
      timeline: [APPROVED, changed('suspended', '2026-01-01')]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(EVERY_MONTH)
  })

  it('counts nothing for an accreditation cancelled throughout the period', async () => {
    const operator = makeOperator({
      orgId: 500033,
      timeline: [...APPROVED_TIMELINE, changed('cancelled', '2026-01-01')]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([])
  })

  it('counts nothing for an accreditation cancelled without being approved', async () => {
    const operator = makeOperator({
      orgId: 500050,
      timeline: [changed('cancelled', '2026-02-10')]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual([])
  })

  it('still counts the months an accreditation held before its cancellation', async () => {
    const operator = makeOperator({
      orgId: 500044,
      timeline: [...APPROVED_TIMELINE, changed('cancelled', '2026-02-01')]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(JANUARY_ONLY)
  })

  it('counts nothing for the month an accreditation was cancelled in, whose report falls due after the cancellation', async () => {
    const operator = makeOperator({
      orgId: 500046,
      timeline: [
        ...APPROVED_TIMELINE,
        changed('cancelled', '2026-02-10T09:00:00.000Z')
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(JANUARY_ONLY)
  })

  it('counts nothing for a month an accreditation was cancelled on its last day', async () => {
    const operator = makeOperator({
      orgId: 500047,
      timeline: [
        ...APPROVED_TIMELINE,
        changed('cancelled', '2026-02-28T15:00:00.000Z')
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(JANUARY_ONLY)
  })

  it('still counts a month when the cancellation falls in the next month on the UK calendar, though not in UTC', async () => {
    const operator = makeOperator({
      orgId: 500050,
      timeline: [
        ...APPROVED_TIMELINE,
        changed('cancelled', '2026-03-31T23:30:00.000Z')
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(EVERY_MONTH)
  })

  it('still counts a month whose cancellation was reversed before the month ended', async () => {
    const operator = makeOperator({
      orgId: 500048,
      timeline: [
        ...APPROVED_TIMELINE,
        changed('cancelled', '2026-02-10'),
        changed('approved', '2026-02-20')
      ]
    })

    const counts = await count({ operators: [operator.organisation] })

    expect(outstanding(counts)).toEqual(EVERY_MONTH)
  })

  it('counts nothing for a registered-only operator, which reports quarterly', async () => {
    const operator = makeOperator({ orgId: 500034, registeredOnly: true })

    const counts = await count({ operators: [operator.organisation] })

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
