import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateReportCompliance } from './report-compliance.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds an org where the registration is approved but the accreditation
 * remains in 'created' status — i.e. a registered-only (quarterly) operator.
 */
async function buildRegisteredOnlyOrg(orgRepo) {
  const org = buildOrganisation()
  const INITIAL_VERSION = 1

  await orgRepo.insert(org)

  const { VALID_FROM, VALID_TO } = getValidDateRange()

  const approvedRegistrations = [
    {
      ...org.registrations[0],
      status: REG_ACC_STATUS.APPROVED,
      registrationNumber: 'REG1',
      reprocessingType: REPROCESSING_TYPE.INPUT,
      validFrom: VALID_FROM,
      validTo: VALID_TO
    }
  ]

  await orgRepo.replace(
    org.id,
    INITIAL_VERSION,
    prepareOrgUpdate(org, {
      status: ORGANISATION_STATUS.APPROVED,
      registrations: approvedRegistrations,
      accreditations: [
        { ...org.accreditations[0], reprocessingType: REPROCESSING_TYPE.INPUT }
      ]
    })
  )

  return waitForVersion(orgRepo, org.id, INITIAL_VERSION + 1)
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')
const SUBMITTED_DATE = '2026-04-17'

// Accredited from the start of the reporting year, so every period of the year
// is within the accreditation window (no validFrom trim).
const FULL_YEAR_RANGE = { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }

// All ended reporting periods for the current year (2026) at FIXED_DATE 2026-04-17:
// Jan, Feb, Mar, Q1 — Apr has not yet ended.
const EXPECTED_PERIODS = [
  {
    key: '2026:monthly:1',
    cadence: 'monthly',
    year: 2026,
    period: 1,
    label: 'Jan Report',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    dueDate: '2026-02-20'
  },
  {
    key: '2026:monthly:2',
    cadence: 'monthly',
    year: 2026,
    period: 2,
    label: 'Feb Report',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    dueDate: '2026-03-20'
  },
  {
    key: '2026:monthly:3',
    cadence: 'monthly',
    year: 2026,
    period: 3,
    label: 'Mar Report',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    dueDate: '2026-04-20'
  },
  {
    key: '2026:quarterly:1',
    cadence: 'quarterly',
    year: 2026,
    period: 1,
    label: 'Q1 Report',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    dueDate: '2026-04-20'
  }
]

// submittedDates for a monthly operator with no submissions (all applicable period keys present, values null)
const MONTHLY_EMPTY_DATES = new Map([
  ['2026:monthly:1', null],
  ['2026:monthly:2', null],
  ['2026:monthly:3', null]
])

describe('generateReportCompliance', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an ordered periods list covering both cadences', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('places monthly March before quarterly Q1 in the periods list', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    // EXPECTED_PERIODS has Mar 2026 (index 14) before Q1 2026 (index 15)
    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('records submitted date for an accredited (monthly) operator', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: new Map([
              ['2026:monthly:1', SUBMITTED_DATE],
              ['2026:monthly:2', null],
              ['2026:monthly:3', null]
            ])
          }
        ]
      ])
    })
  })

  it('records submitted date for a registered-only (quarterly) operator', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildRegisteredOnlyOrg(orgRepo)
    const reg = org.registrations[0]

    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'quarterly',
      period: 1
    })

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: new Map([['2026:quarterly:1', SUBMITTED_DATE]])
          }
        ]
      ])
    })
  })

  it('has null values in submittedDates for applicable but unsubmitted periods', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('produces one entry per registration across multiple orgs', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org1 = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const org2 = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          org1.registrations[0].id,
          {
            registrationId: org1.registrations[0].id,
            organisationId: org1.id,
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ],
        [
          org2.registrations[0].id,
          {
            registrationId: org2.registrations[0].id,
            organisationId: org2.id,
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('excludes test organisations from entries', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    // orgId 999999 is a test org (see parse-test-organisations config)
    await buildApprovedOrg(orgRepo, { orgId: 999999 }, FULL_YEAR_RANGE)
    const normalOrg = await buildApprovedOrg(
      orgRepo,
      undefined,
      FULL_YEAR_RANGE
    )
    const normalReg = normalOrg.registrations[0]

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          normalReg.id,
          {
            registrationId: normalReg.id,
            organisationId: normalOrg.id,
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('includes submissions from earlier months within the current year', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 2
    })

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: new Map([
              ['2026:monthly:1', null],
              ['2026:monthly:2', SUBMITTED_DATE],
              ['2026:monthly:3', null]
            ])
          }
        ]
      ])
    })
  })

  it('retains the original submitted date while a resubmission is in progress', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    // Submission 1 submitted, with an in-flight submission 2 draft over it. The
    // draft is the current report but carries no submitted date, so reading it
    // would transiently blank a period that has in fact been submitted.
    await seedInFlightResubmission(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    // The public register keeps showing submission 1's date, not a blank.
    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: new Map([
              ['2026:monthly:1', SUBMITTED_DATE],
              ['2026:monthly:2', null],
              ['2026:monthly:3', null]
            ])
          }
        ]
      ])
    })
  })

  it('keeps the original submitted date after a resubmission is completed', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    // Submission 1 submitted on 17 Apr.
    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    // Submission 2, a correction, itself submitted the next day. April has not
    // yet ended, so the applicable period set is unchanged.
    vi.setSystemTime(new Date('2026-04-18T10:00:00.000Z'))
    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 1,
      submissionNumber: 2
    })

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    // Resubmissions are not reflected externally: the register still shows the
    // original submission date (17 Apr), not the correction's (18 Apr).
    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: new Map([
              ['2026:monthly:1', SUBMITTED_DATE],
              ['2026:monthly:2', null],
              ['2026:monthly:3', null]
            ])
          }
        ]
      ])
    })
  })

  it('bounds monthly obligations to the accreditation validFrom (PAE-1737)', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    // Accredited from mid-February: January is before validFrom, so it is not
    // an obligation and must not appear in submittedDates.
    const org = await buildApprovedOrg(orgRepo, undefined, {
      VALID_FROM: '2026-02-15',
      VALID_TO: '2026-12-31'
    })
    const reg = org.registrations[0]

    const result = await generateReportCompliance(orgRepo, reportsRepo)

    // Jan absent, only Feb and Mar remain as obligations.
    expect(result.entries).toEqual(
      new Map([
        [
          reg.id,
          {
            registrationId: reg.id,
            organisationId: org.id,
            submittedDates: new Map([
              ['2026:monthly:2', null],
              ['2026:monthly:3', null]
            ])
          }
        ]
      ])
    )
  })
})
