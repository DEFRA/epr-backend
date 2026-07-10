import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateReportSubmissions } from './report-submissions.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
import { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

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

  // Accredited from the start of the reporting year, so every period of the
  // year is within the accreditation window (no validFrom trim).
  const FULL_YEAR_RANGE = { VALID_FROM: '2026-01-01', VALID_TO: '2026-12-31' }

  it('generates full report submissions across multiple orgs', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    // Org 1: one approved accredited registration (glass, monthly cadence); Jan submitted
    const org1 = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const org1Reg = org1.registrations[0]
    await buildSubmittedReport(reportsRepo, {
      organisationId: org1.id,
      registrationId: org1Reg.id,
      year: 2026,
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
    await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)

    const result = await generateReportSubmissions(orgRepo, reportsRepo)

    const baseRow = {
      regulator: 'EA',
      organisationName: 'ACME ltd',
      submitterPhone: '1234567890',
      approvedPersonsPhone: '1234567890',
      submitterEmail: 'luke.skywalker@starwars.com',
      approvedPersonsEmail: 'luke.skywalker@starwars.com',
      material: 'Glass-remelt',
      registrationNumber: 'REG1',
      accreditationNumber: 'ACC1',
      reportType: 'Monthly'
    }

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
          ...baseRow,
          ...submittedTonnage,
          reportingPeriod: 'Jan 2026',
          dueDate: '2026-02-20',
          submittedDate: FIXED_DATE.toISOString().slice(0, 10),
          submittedBy: 'Jane Smith',
          submissionNumber: 1
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Feb 2026',
          dueDate: '2026-03-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Mar 2026',
          dueDate: '2026-04-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Jan 2026',
          dueDate: '2026-02-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Feb 2026',
          dueDate: '2026-03-20',
          submittedDate: '',
          submittedBy: '',
          submissionNumber: ''
        },
        {
          ...baseRow,
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
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2025,
      cadence: 'monthly',
      period: 1
    })
    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    const result = await generateReportSubmissions(orgRepo, reportsRepo)

    const byPeriod = Object.fromEntries(
      result.reportSubmissions.map((r) => [r.reportingPeriod, r])
    )

    expect(byPeriod['Jan 2025'].submittedDate).toBe(
      FIXED_DATE.toISOString().slice(0, 10)
    )
    expect(byPeriod['Jan 2026'].submittedDate).toBe(
      FIXED_DATE.toISOString().slice(0, 10)
    )
  })

  it('trims monthly obligation rows to the accreditation validFrom (PAE-1737)', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    // Accredited from mid-February: January is before validFrom, so no January
    // obligation row should be generated. Feb and Mar have ended by Apr 17.
    await buildApprovedOrg(orgRepo, undefined, {
      VALID_FROM: '2026-02-15',
      VALID_TO: '2026-12-31'
    })

    const result = await generateReportSubmissions(orgRepo, reportsRepo)
    const periods = result.reportSubmissions.map((r) => r.reportingPeriod)

    expect(periods).toEqual(['Feb 2026', 'Mar 2026'])
  })

  it('keeps the last submitted figures while an in-flight resubmission draft is current', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    // Submission 1 submitted with PRN figures and a note the feed must keep
    // showing, with an in-flight submission 2 draft sitting over it
    await seedInFlightResubmission(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
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

    const result = await generateReportSubmissions(orgRepo, reportsRepo)

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
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    // A submitted period a service maintainer then unsubmits for correction,
    // with no newer submission: the submitted slot (date, submitter) is retained
    await buildUnsubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
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

    const result = await generateReportSubmissions(orgRepo, reportsRepo)

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
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo, undefined, FULL_YEAR_RANGE)
    const reg = org.registrations[0]

    // Submission 1: submitted, with the original PRN figures and note
    await buildSubmittedReport(reportsRepo, {
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
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
      organisationId: org.id,
      registrationId: reg.id,
      year: 2026,
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

    const result = await generateReportSubmissions(orgRepo, reportsRepo)

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

const buildOrg = (overrides = {}) => ({
  id: 'org-1',
  companyDetails: { name: 'Acme Ltd' },
  registrations: [],
  accreditations: [],
  ...overrides
})

const buildRegistrationMock = (overrides = {}) => ({
  id: 'reg-1',
  status: 'approved',
  material: 'plastic',
  wasteProcessingType: 'reprocessor',
  accreditationId: null,
  glassRecyclingProcess: null,
  registrationNumber: 'REG-001',
  submittedToRegulator: 'ea',
  submitterContactDetails: {
    phone: '01234567890',
    email: 'submitter@example.com'
  },
  approvedPersons: [{ phone: '09876543210', email: 'ap@example.com' }],
  ...overrides
})

const makeOrgsRepo = (orgs) =>
  /** @type {any} */ ({
    findAll: vi.fn().mockResolvedValue(orgs)
  })

const makeReportsRepo = (allPeriodicReports = []) =>
  /** @type {any} */ ({
    findAllPeriodicReports: vi.fn().mockResolvedValue(allPeriodicReports)
  })

describe('generateReportSubmissions (edge cases)', () => {
  it('skips registrations with created status', async () => {
    const org = buildOrg({
      registrations: [buildRegistrationMock({ status: 'created' })]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(result.reportSubmissions).toHaveLength(0)
  })

  it('skips registrations with rejected status', async () => {
    const org = buildOrg({
      registrations: [buildRegistrationMock({ status: 'rejected' })]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(result.reportSubmissions).toHaveLength(0)
  })

  it('joins multiple approved persons phone and email with ", "', async () => {
    const org = buildOrg({
      registrations: [
        buildRegistrationMock({
          status: 'approved',
          approvedPersons: [
            { phone: '111', email: 'a@example.com' },
            { phone: '222', email: 'b@example.com' }
          ]
        })
      ]
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
    const org = buildOrg({
      registrations: [
        buildRegistrationMock({
          status: 'approved',
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        })
      ]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(result.reportSubmissions[0].material).toBe('Glass-remelt')
  })

  it('returns empty string for accreditationNumber when accreditation has null accreditationNumber', async () => {
    const org = buildOrg({
      accreditations: [{ id: 'acc-1', accreditationNumber: null }],
      registrations: [
        buildRegistrationMock({
          status: 'approved',
          accreditationId: 'acc-1'
        })
      ]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    expect(result.reportSubmissions[0].accreditationNumber).toBe('')
  })

  it('uses quarterly cadence and empty accreditationNumber when accreditation status is not approved or suspended', async () => {
    const org = buildOrg({
      accreditations: [
        { id: 'acc-1', status: 'created', accreditationNumber: 'ACC-001' }
      ],
      registrations: [
        buildRegistrationMock({
          status: REG_ACC_STATUS.APPROVED,
          accreditationId: 'acc-1'
        })
      ]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    const row = result.reportSubmissions[0]
    expect(row.accreditationNumber).toBe('')
    expect(row.reportType).toBe('Quarterly')
  })

  it('uses monthly cadence and accreditationNumber when accreditation status is suspended', async () => {
    const org = buildOrg({
      accreditations: [
        {
          id: 'acc-1',
          status: REG_ACC_STATUS.SUSPENDED,
          accreditationNumber: 'ACC-999'
        }
      ],
      registrations: [
        buildRegistrationMock({
          status: 'approved',
          accreditationId: 'acc-1'
        })
      ]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    const row = result.reportSubmissions[0]
    expect(row.accreditationNumber).toBe('ACC-999')
    expect(row.reportType).toBe('Monthly')
  })

  it('formats accreditationNumber as empty for registered only operator', async () => {
    const org = buildOrg({
      registrations: [
        buildRegistrationMock({
          status: 'approved'
        })
      ]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([org]),
      makeReportsRepo()
    )

    const row = result.reportSubmissions[0]
    expect(row.registrationNumber).toBe('REG-001')
    expect(row.accreditationNumber).toBe('')
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
        registrations: [
          buildRegistrationMock({
            status: 'approved',
            submittedToRegulator
          })
        ]
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
      orgId: 999999,
      companyDetails: { name: 'Test Org Ltd' },
      registrations: [buildRegistrationMock({ status: 'approved' })]
    })
    const normalOrg = buildOrg({
      id: 'org-2',
      orgId: 500001,
      companyDetails: { name: 'Normal Org Ltd' },
      registrations: [buildRegistrationMock({ status: 'approved' })]
    })

    const result = await generateReportSubmissions(
      makeOrgsRepo([testOrg, normalOrg]),
      makeReportsRepo()
    )

    const orgNames = result.reportSubmissions.map((r) => r.organisationName)
    expect(orgNames).not.toContain('Test Org Ltd')
    expect(orgNames).toContain('Normal Org Ltd')
  })
})
