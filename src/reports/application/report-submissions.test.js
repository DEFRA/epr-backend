import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { toYear } from '#common/helpers/dates/year.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateReportSubmissions } from './report-submissions.js'
import { createInMemoryOrganisationReadRepository } from '#organisation-read-model/repository/inmemory.js'
import {
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration,
  registrationOf,
  servedOrganisations
} from '#organisation-read-model/repository/read-model-test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
import { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'
import { reportKeyOf } from '#reports/repository/contract/test-data.js'
import { config } from '#root/config.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'

const FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')

// ---------------------------------------------------------------------------
// Integration test — real in-memory repos
// ---------------------------------------------------------------------------

describe('generateReportSubmissions (integration)', () => {
  beforeEach(() => {
    // Only fake Date so setImmediate/setTimeout in the org repo still work
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates full report submissions across multiple orgs', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    // Org 1: one approved accredited registration (glass, monthly cadence); Jan submitted
    const org1 = orgs.approved()
    const org1Reg = registrationOf(org1)
    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org1, org1Reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 1,
      prn: {
        issuedTonnage: 80,
        freeTonnage: 5,
        totalRevenue: 40000,
        averagePricePerTonne: 500
      }
    })

    // Org 2: approved registration with no report submissions
    const org2 = orgs.approved()

    const result = await generateReportSubmissions(
      orgs.repository(),
      reportsRepo
    )

    const baseRow = {
      regulator: 'EA',
      organisationName: 'ACME ltd',
      submitterPhone: '1234567890',
      approvedPersonsPhone: '1234567890',
      submitterEmail: 'luke.skywalker@starwars.com',
      approvedPersonsEmail: 'luke.skywalker@starwars.com',
      material: 'Glass-remelt',
      reportType: 'Monthly'
    }
    /** @param {import('#organisation-read-model/domain/model.js').Organisation} org */
    const rowFor = (org) => ({
      ...baseRow,
      registrationNumber: `REG${org.organisationNumber}`,
      accreditationNumber: `ACC${org.organisationNumber}`
    })

    const emptyTonnage = {
      tonnageReceivedForRecycling: '',
      tonnageRecycled: '',
      tonnageExportedForRecycling: '',
      tonnageSentOnTotal: '',
      tonnageSentOnToReprocessor: '',
      tonnageSentOnToExporter: '',
      tonnageSentOnToOtherFacilities: '',
      tonnagePrnsPernsIssued: '',
      freeTonnagePrnsPerns: '',
      totalRevenuePrnsPerns: '',
      averagePrnPernPricePerTonne: '',
      tonnageReceivedButNotRecycled: '',
      tonnageReceivedButNotExported: '',
      tonnageExportedThatWasStopped: '',
      tonnageExportedThatWasRefused: '',
      tonnageRepatriated: '',
      noteToRegulator: ''
    }

    // buildCreateReportParams has recyclingActivity (zeros/nulls), wasteSent (zeros),
    // prn overridden with non-zero values to exercise freeTonnagePrnsPerns
    const submittedTonnage = {
      tonnageReceivedForRecycling: 0,
      tonnageRecycled: '',
      tonnageExportedForRecycling: '',
      tonnageSentOnTotal: 0,
      tonnageSentOnToReprocessor: 0,
      tonnageSentOnToExporter: 0,
      tonnageSentOnToOtherFacilities: 0,
      tonnagePrnsPernsIssued: 80,
      freeTonnagePrnsPerns: 5,
      totalRevenuePrnsPerns: 40000,
      averagePrnPernPricePerTonne: 500,
      tonnageReceivedButNotRecycled: '',
      tonnageReceivedButNotExported: '',
      tonnageExportedThatWasStopped: '',
      tonnageExportedThatWasRefused: '',
      tonnageRepatriated: '',
      noteToRegulator: ''
    }

    expect(result).toStrictEqual({
      generatedAt: FIXED_DATE.toISOString(),
      reportSubmissions: [
        {
          ...rowFor(org1),
          ...submittedTonnage,
          reportingPeriod: 'Jan 2026',
          dueDate: '2026-02-20',
          submittedDate: FIXED_DATE.toISOString().slice(0, 10),
          submittedBy: 'Jane Smith',
          submissionNumber: 1
        },
        {
          ...rowFor(org1),
          ...emptyTonnage,
          reportingPeriod: 'Feb 2026',
          dueDate: '2026-03-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...rowFor(org1),
          ...emptyTonnage,
          reportingPeriod: 'Mar 2026',
          dueDate: '2026-04-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...rowFor(org2),
          ...emptyTonnage,
          reportingPeriod: 'Jan 2026',
          dueDate: '2026-02-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...rowFor(org2),
          ...emptyTonnage,
          reportingPeriod: 'Feb 2026',
          dueDate: '2026-03-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...rowFor(org2),
          ...emptyTonnage,
          reportingPeriod: 'Mar 2026',
          dueDate: '2026-04-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        }
      ]
    })
  })

  it('includes submitted reports from all years when the same org/registration spans multiple years', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    // Accredited for 2025 only, so registered only in 2026.
    const org = orgs.approved({
      year: 2025,
      standingByDate: {
        2025: { '2025-01-01': { standing: 'accredited' } },
        2026: { '2026-01-01': { standing: 'registeredOnly' } }
      }
    })
    const reg = registrationOf(org)

    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2025),
      cadence: 'monthly',
      period: 1
    })
    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'quarterly',
      period: 1
    })

    const result = await generateReportSubmissions(
      orgs.repository(),
      reportsRepo
    )

    expect(
      result.reportSubmissions.map(({ reportingPeriod, submittedDate }) => ({
        reportingPeriod,
        submittedDate
      }))
    ).toEqual([
      {
        reportingPeriod: 'Q1 2026',
        submittedDate: FIXED_DATE.toISOString().slice(0, 10)
      },
      {
        reportingPeriod: 'Jan 2025',
        submittedDate: FIXED_DATE.toISOString().slice(0, 10)
      }
    ])
  })

  it('trims monthly obligation rows to the accreditation validFrom (PAE-1737)', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    // Accredited from mid-February: January is before validFrom, so no January
    // obligation row should be generated. Feb and Mar have ended by Apr 17.
    orgs.approved({ validFrom: '2026-02-15' })

    const result = await generateReportSubmissions(
      orgs.repository(),
      reportsRepo
    )
    const periods = result.reportSubmissions.map((r) => r.reportingPeriod)

    expect(periods).toEqual(['Feb 2026', 'Mar 2026'])
  })

  it('keeps the last submitted figures while an in-flight resubmission draft is current', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    // Submission 1 submitted with PRN figures and a note the feed must keep
    // showing, with an in-flight submission 2 draft sitting over it
    await seedInFlightResubmission(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 1,
      prn: {
        issuedTonnage: 80,
        freeTonnage: 5,
        totalRevenue: 40000,
        averagePricePerTonne: 500
      },
      supportingInformation: 'Submission 1 note to the regulator'
    })

    const result = await generateReportSubmissions(
      orgs.repository(),
      reportsRepo
    )

    // The in-flight draft is not submitted, so it adds no row: the period still
    // has a single row, sourced from submission 1
    const janRows = result.reportSubmissions.filter(
      (r) => r.reportingPeriod === 'Jan 2026'
    )
    expect(janRows).toHaveLength(1)
    const janRow = janRows[0]

    // Date and submitter come from the last submitted report, not the draft
    expect(janRow.submittedDate).toBe(FIXED_DATE.toISOString().slice(0, 10))
    expect(janRow.submittedBy).toBe('Jane Smith')
    // Tonnage/PRN figures and the note to the regulator likewise reflect
    // submission 1, not the empty draft
    expect(janRow.tonnagePrnsPernsIssued).toBe(80)
    expect(janRow.freeTonnagePrnsPerns).toBe(5)
    expect(janRow.totalRevenuePrnsPerns).toBe(40000)
    expect(janRow.averagePrnPernPricePerTonne).toBe(500)
    expect(janRow.noteToRegulator).toBe('Submission 1 note to the regulator')
    // Only submission 1 has been submitted; the in-flight draft is not counted,
    // so SubmissionNumber stays at the latest submitted report's number
    expect(janRow.submissionNumber).toBe(1)
  })

  it('keeps the last submitted figures after a submitted period is unsubmitted', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    // A submitted period a service maintainer then unsubmits for correction,
    // with no newer submission: the submitted slot (date, submitter) is retained
    await buildUnsubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 1,
      prn: {
        issuedTonnage: 80,
        freeTonnage: 5,
        totalRevenue: 40000,
        averagePricePerTonne: 500
      },
      supportingInformation: 'Submitted note retained after unsubmit'
    })

    const result = await generateReportSubmissions(
      orgs.repository(),
      reportsRepo
    )

    const byPeriod = Object.fromEntries(
      result.reportSubmissions.map((r) => [r.reportingPeriod, r])
    )
    const janRow = byPeriod['Jan 2026']

    // The feed retains the last submitted date, submitter, figures and number
    // rather than blanking while the period is a draft again
    expect(janRow.submittedDate).toBe(FIXED_DATE.toISOString().slice(0, 10))
    expect(janRow.submittedBy).toBe('Jane Smith')
    expect(janRow.tonnagePrnsPernsIssued).toBe(80)
    expect(janRow.noteToRegulator).toBe(
      'Submitted note retained after unsubmit'
    )
    expect(janRow.submissionNumber).toBe(1)
  })

  it('fans out a resubmitted period into one row per submitted report', async () => {
    const orgs = servedOrganisations()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = orgs.approved()
    const reg = registrationOf(org)

    // Submission 1: submitted, with the original PRN figures and note
    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 1,
      prn: {
        issuedTonnage: 80,
        freeTonnage: 5,
        totalRevenue: 40000,
        averagePricePerTonne: 500
      },
      supportingInformation: 'Note on the original submission'
    })

    // Submission 2: a correction, itself submitted a day later with revised
    // figures and note (April has not yet ended, so the period set is unchanged)
    vi.setSystemTime(new Date('2026-04-18T10:00:00.000Z'))
    await buildSubmittedReport(reportsRepo, {
      ...reportKeyOf(org, reg),
      year: toYear(2026),
      cadence: 'monthly',
      period: 1,
      submissionNumber: 2,
      prn: {
        issuedTonnage: 120,
        freeTonnage: 8,
        totalRevenue: 60000,
        averagePricePerTonne: 500
      },
      supportingInformation: 'Note on the corrected submission'
    })

    const result = await generateReportSubmissions(
      orgs.repository(),
      reportsRepo
    )

    // Advancing the clock to 18 Apr must not change the applicable period set:
    // April has not yet ended, so no Apr row appears
    const periods = [
      ...new Set(result.reportSubmissions.map((r) => r.reportingPeriod))
    ].sort()
    expect(periods).toEqual(['Feb 2026', 'Jan 2026', 'Mar 2026'])

    // The resubmitted period now fans out into one row per submitted report,
    // ordered by submission number ascending
    const janRows = result.reportSubmissions.filter(
      (r) => r.reportingPeriod === 'Jan 2026'
    )
    expect(janRows).toHaveLength(2)

    const [original, correction] = janRows

    // Row 1 keeps submission 1's original date, figures and note
    expect(original.submissionNumber).toBe(1)
    expect(original.submittedDate).toBe('2026-04-17')
    expect(original.submittedBy).toBe('Jane Smith')
    expect(original.tonnagePrnsPernsIssued).toBe(80)
    expect(original.freeTonnagePrnsPerns).toBe(5)
    expect(original.noteToRegulator).toBe('Note on the original submission')

    // Row 2 carries the correction's revised date, figures and note
    expect(correction.submissionNumber).toBe(2)
    expect(correction.submittedDate).toBe('2026-04-18')
    expect(correction.submittedBy).toBe('Jane Smith')
    expect(correction.tonnagePrnsPernsIssued).toBe(120)
    expect(correction.freeTonnagePrnsPerns).toBe(8)
    expect(correction.totalRevenuePrnsPerns).toBe(60000)
    expect(correction.noteToRegulator).toBe('Note on the corrected submission')
  })
})

// ---------------------------------------------------------------------------
// Mock-based edge-case tests
// ---------------------------------------------------------------------------

const MOCK_FIXED_DATE = new Date('2026-04-17T10:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(MOCK_FIXED_DATE)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

const approvedFromJanuary = approvedStatusFrom('2026-01-01')

/**
 * An organisation the read model serves with one registration, `REG-001`, a
 * registered-only reprocessor for plastic approved from January unless
 * overridden.
 *
 * @param {{
 *   organisationNumber?: string,
 *   name?: string,
 *   registration?: Partial<import('#organisation-read-model/domain/model.js').ReprocessorRegistration>
 * }} [options]
 */
const buildOrg = ({
  organisationNumber = '500010',
  name = 'Acme Ltd',
  registration = {}
} = {}) =>
  buildReadOrganisation({
    organisationNumber: toOrganisationNumber(organisationNumber),
    name,
    registrations: {
      'REG-001': buildReadReprocessorRegistration({
        material: 'plastic',
        status: approvedFromJanuary,
        standingByDate: {
          2026: { '2026-01-01': { standing: 'registeredOnly' } }
        },
        submitterContactDetails: {
          fullName: 'Submitter',
          phone: '01234567890',
          email: 'submitter@example.com'
        },
        approvedPersons: [
          {
            fullName: 'Approver',
            phone: '09876543210',
            email: 'ap@example.com'
          }
        ],
        ...registration
      })
    }
  })

/**
 * A registration accredited for 2026 from `from`.
 *
 * @param {string} accreditationNumber
 * @param {import('#organisation-read-model/domain/model.js').Status<'approved' | 'suspended'>} [status]
 * @param {string} [from]
 */
const accreditedAs = (
  accreditationNumber,
  status = approvedFromJanuary,
  from = '2026-01-01'
) => ({
  standingByDate: {
    2026:
      from === '2026-01-01'
        ? { '2026-01-01': { standing: /** @type {const} */ ('accredited') } }
        : {
            '2026-01-01': { standing: /** @type {const} */ ('registeredOnly') },
            [from]: { standing: /** @type {const} */ ('accredited') }
          }
  },
  accreditations: {
    2026: buildReadAccreditation({
      accreditationNumber: toAccreditationNumber(accreditationNumber),
      status
    })
  }
})

/** @param {import('#organisation-read-model/domain/model.js').Organisation[]} orgs */
const makeOrgsRepo = (orgs) => createInMemoryOrganisationReadRepository(orgs)()

const makeReportsRepo = (allPeriodicReports = []) =>
  /** @type {any} */ ({
    findAllPeriodicReports: vi.fn().mockResolvedValue(allPeriodicReports)
  })

describe('generateReportSubmissions (edge cases)', () => {
  afterEach(() => {
    config.reset('featureFlags.midYearStatusTransition')
  })

  it('joins multiple approved persons phone and email with ", "', async () => {
    const org = buildOrg({
      registration: {
        approvedPersons: [
          { fullName: 'A', phone: '111', email: 'a@example.com' },
          { fullName: 'B', phone: '222', email: 'b@example.com' }
        ]
      }
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(result.reportSubmissions[0].approvedPersonsPhone).toBe('111, 222')
    expect(result.reportSubmissions[0].approvedPersonsEmail).toBe(
      'a@example.com, b@example.com'
    )
  })

  it('formats glass material with recycling process', async () => {
    const org = buildOrg({ registration: { material: 'glass_re_melt' } })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(result.reportSubmissions[0].material).toBe('Glass-remelt')
  })

  it('uses monthly cadence and accreditationNumber when accreditation status is suspended', async () => {
    const org = buildOrg({
      registration: accreditedAs('ACC-999', {
        current: 'suspended',
        lastUpdatedAt: '2026-03-01T00:00:00.000Z',
        timeline: [
          ...approvedFromJanuary.timeline,
          { status: 'suspended', at: '2026-03-01T00:00:00.000Z' }
        ]
      })
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    const row = result.reportSubmissions[0]
    expect(row.accreditationNumber).toBe('ACC-999')
    expect(row.reportType).toBe('Monthly')
  })

  it('uses monthly cadence and the accreditationNumber of an accredited registration', async () => {
    const org = buildOrg({ registration: accreditedAs('ACC-EXT') })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    const row = result.reportSubmissions[0]
    expect(row.accreditationNumber).toBe('ACC-EXT')
    expect(row.reportType).toBe('Monthly')
  })

  it('formats accreditationNumber as empty for registered only operator', async () => {
    const result = await generateReportSubmissions(
      makeOrgsRepo([buildOrg()]),
      makeReportsRepo()
    )

    const row = result.reportSubmissions[0]
    expect(row.registrationNumber).toBe('REG-001')
    expect(row.accreditationNumber).toBe('')
    expect(row.reportType).toBe('Quarterly')
  })

  it.each([
    ['ea', 'EA'],
    ['niea', 'NIEA'],
    ['sepa', 'SEPA'],
    ['nrw', 'NRW']
  ])(
    'uppercases regulator %s to %s',
    async (submittedToRegulator, expected) => {
      const org = buildOrg({
        registration: {
          submittedToRegulator: {
            code: /** @type {any} */ (submittedToRegulator)
          }
        }
      })

      const result = await generateReportSubmissions(
        makeOrgsRepo([org]),
        makeReportsRepo()
      )

      expect(result.reportSubmissions[0].regulator).toBe(expected)
    }
  )

  it('excludes test organisations from report submissions', async () => {
    const testOrg = buildOrg({
      organisationNumber: '999999',
      name: 'Test Org Ltd'
    })
    const normalOrg = buildOrg({
      organisationNumber: '500001',
      name: 'Normal Org Ltd'
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([testOrg, normalOrg]),
      makeReportsRepo()
    )

    const orgNames = result.reportSubmissions.map((r) => r.organisationName)
    expect(orgNames).not.toContain('Test Org Ltd')
    expect(orgNames).toContain('Normal Org Ltd')
  })

  it('lists rows for both kinds, split at the accreditation date, with mid-year status transition on', async () => {
    config.set('featureFlags.midYearStatusTransition', true)
    const org = buildOrg({
      registration: accreditedAs(
        'ACC-001',
        approvedStatusFrom('2026-02-15'),
        '2026-02-15'
      )
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(
      result.reportSubmissions.map(
        ({ reportType, reportingPeriod, accreditationNumber }) => ({
          reportType,
          reportingPeriod,
          accreditationNumber
        })
      )
    ).toEqual([
      {
        reportType: 'Quarterly',
        reportingPeriod: 'Q1 2026',
        accreditationNumber: ''
      },
      {
        reportType: 'Monthly',
        reportingPeriod: 'Feb 2026',
        accreditationNumber: 'ACC-001'
      },
      {
        reportType: 'Monthly',
        reportingPeriod: 'Mar 2026',
        accreditationNumber: 'ACC-001'
      }
    ])
  })
})
