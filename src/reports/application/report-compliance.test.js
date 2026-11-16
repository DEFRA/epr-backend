import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { toYear } from '#common/helpers/dates/year.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateReportCompliance } from './report-compliance.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'
import { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
import { reportKeyOf } from '#reports/repository/contract/test-data.js'
import { registrationKey } from '#reports/domain/registration-key.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration,
  registrationOf,
  servedOrganisations
} from '#organisation-read-model/repository/read-model-test-data.js'
import { REPROCESSOR_NUMBER } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { config } from '#root/config.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * An organisation the read model serves with one registration, `REG1`, an
 * input reprocessor approved from January and registered only, as its
 * accreditation was never approved.
 */
const registeredOnlyOrg = () =>
  buildReadOrganisation({
    registrations: {
      REG1: buildReadReprocessorRegistration({
        status: approvedStatusFrom('2026-01-01'),
        standingByDate: {
          2026: { '2026-01-01': { standing: 'registeredOnly' } }
        }
      })
    }
  })

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

const FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')
const SUBMITTED_DATE = '2026-04-17'

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
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('places monthly March before quarterly Q1 in the periods list', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    // EXPECTED_PERIODS has Mar 2026 (index 14) before Q1 2026 (index 15)
    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('records submitted date for an accredited (monthly) operator', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 1
    })

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
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
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.add(registeredOnlyOrg())
    const reg = registrationOf(org)

    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'quarterly',
      period: 1
    })

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
            submittedDates: new Map([['2026:quarterly:1', SUBMITTED_DATE]])
          }
        ]
      ])
    })
  })

  it('has null values in submittedDates for applicable but unsubmitted periods', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('produces one entry per registration across multiple orgs', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org1 = orgs.approved()
    const org2 = orgs.approved()

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org1, registrationOf(org1))),
          {
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ],
        [
          registrationKey(reportKeyOf(org2, registrationOf(org2))),
          {
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('excludes test organisations from entries', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    // 999999 is a test organisation (see parse-test-organisations config)
    orgs.approved({ organisationNumber: toOrganisationNumber('999999') })
    const normalOrg = orgs.approved()
    const normalReg = registrationOf(normalOrg)

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(normalOrg, normalReg)),
          {
            submittedDates: MONTHLY_EMPTY_DATES
          }
        ]
      ])
    })
  })

  it('includes submissions from earlier months within the current year', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 2
    })

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
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

  // The register date is the original submission date, stable across every
  // state of the resubmission lifecycle: an in-flight redraft, a completed
  // correction, and an unsubmit all leave period 1 showing its 17 Apr date.
  // Production keys the date on submittedAt truthiness (via
  // selectSubmittedReports), never on status, so each seeded state must yield
  // the identical baseline result below. The retention invariant itself is
  // owned at the domain layer (merge-reporting-periods.test.js).
  it.for([
    {
      // Submission 1 submitted, with an in-flight submission 2 draft over it.
      // The draft is the current report but carries no submitted date, so
      // reading it naively would blank a period that has in fact been submitted.
      state: 'a resubmission is in progress',
      seed: (reportsRepo, ids) => seedInFlightResubmission(reportsRepo, ids)
    },
    {
      // Submission 1 submitted on 17 Apr, then a correction (submission 2) itself
      // submitted the next day. April has not yet ended, so the applicable period
      // set is unchanged and the register must still show the original 17 Apr.
      state: 'a resubmission has completed the next day',
      seed: async (reportsRepo, ids) => {
        await buildSubmittedReport(reportsRepo, ids)
        vi.setSystemTime(new Date('2026-04-18T10:00:00.000Z'))
        await buildSubmittedReport(reportsRepo, {
          ...ids,
          submissionNumber: 2
        })
      }
    },
    {
      // A submitted period a service maintainer then unsubmits for correction:
      // status reverts to ready_to_submit but the submitted date is retained.
      // Keying on status rather than the retained submittedAt would blank it.
      state: 'a submitted period is unsubmitted for correction',
      seed: (reportsRepo, ids) => buildUnsubmittedReport(reportsRepo, ids)
    }
  ])('shows the original submitted date given $state', async ({ seed }) => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    await seed(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    expect(result).toEqual({
      periods: EXPECTED_PERIODS,
      entries: new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
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
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    // Accredited from mid-February: January is before validFrom, so it is not
    // an obligation and must not appear in submittedDates.
    const org = orgs.approved({ validFrom: '2026-02-15' })
    const reg = registrationOf(org)

    const result = await generateReportCompliance(
      await orgs.repository().findAll(),
      reportsRepo
    )

    // Jan absent, only Feb and Mar remain as obligations.
    expect(result.entries).toEqual(
      new Map([
        [
          registrationKey(reportKeyOf(org, reg)),
          {
            submittedDates: new Map([
              ['2026:monthly:2', null],
              ['2026:monthly:3', null]
            ])
          }
        ]
      ])
    )
  })

  describe('read model registrations', () => {
    /**
     * An organisation the read model serves with one reprocessor approved
     * from January and accredited from `accreditedFrom`.
     *
     * @param {string} accreditedFrom
     */
    const accreditedFrom = (accreditedFrom) =>
      buildReadOrganisation({
        registrations: {
          [REPROCESSOR_NUMBER]: buildReadReprocessorRegistration({
            status: approvedStatusFrom('2026-01-01'),
            standingByDate: {
              2026:
                accreditedFrom === '2026-01-01'
                  ? { '2026-01-01': { standing: 'accredited' } }
                  : {
                      '2026-01-01': { standing: 'registeredOnly' },
                      [accreditedFrom]: { standing: 'accredited' }
                    }
            },
            accreditations: {
              2026: buildReadAccreditation({
                status: approvedStatusFrom(accreditedFrom)
              })
            }
          })
        }
      })

    /** @param {import('#organisation-read-model/domain/model.js').Organisation} organisation */
    const complianceFor = async (organisation) =>
      generateReportCompliance(
        await createInMemoryOrganisationReadRepository([
          organisation
        ])().findAll(),
        createInMemoryReportsRepository()()
      )

    /** @param {import('#organisation-read-model/domain/model.js').Organisation} organisation */
    const entryKeyOf = (organisation) =>
      registrationKey(reportKeyOf(organisation, registrationOf(organisation)))

    afterEach(() => {
      config.reset('featureFlags.midYearStatusTransition')
    })

    it('lists both kinds, split at the accreditation date, with mid-year status transition on', async () => {
      config.set('featureFlags.midYearStatusTransition', true)
      const organisation = accreditedFrom('2026-02-15')

      const result = await complianceFor(organisation)

      expect(
        result.entries.get(entryKeyOf(organisation))?.submittedDates
      ).toEqual(
        new Map([
          ['2026:quarterly:1', null],
          ['2026:monthly:2', null],
          ['2026:monthly:3', null]
        ])
      )
    })

    it('owes monthly reports for a registration accredited all year', async () => {
      const organisation = accreditedFrom('2026-01-01')

      const result = await complianceFor(organisation)

      expect(
        result.entries.get(entryKeyOf(organisation))?.submittedDates
      ).toEqual(MONTHLY_EMPTY_DATES)
    })
  })
})
