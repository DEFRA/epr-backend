import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateReportSubmissions } from './report-submissions.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
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

  it('generates full report submissions across multiple orgs', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    // Org 1: one approved accredited registration (glass, monthly cadence); Jan submitted
    const org1 = await buildApprovedOrg(orgRepo)
    const org1Reg = org1.registrations[0]
    await buildSubmittedReport(reportsRepo, {
      organisationId: org1.id,
      registrationId: org1Reg.id,
      year: 2026,
      cadence: 'monthly',
      period: 1
    })

    // Org 2: approved registration with no report submissions
    await buildApprovedOrg(orgRepo)

    const result = await generateReportSubmissions(orgRepo, reportsRepo)

    const baseRow = {
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
      totalRevenuePrnsPerns: '',
      averagePrnPernPricePerTonne: '',
      tonnageReceivedButNotRecycled: '',
      tonnageReceivedButNotExported: '',
      tonnageExportedThatWasStopped: '',
      tonnageExportedThatWasRefused: '',
      tonnageRepatriated: '',
      noteToRegulator: ''
    }

    // Default buildCreateReportParams has recyclingActivity (zeros/nulls),
    // wasteSent (zeros), prn: null, no exportActivity, no supportingInformation
    const submittedTonnage = {
      tonnageReceivedForRecycling: '0',
      tonnageRecycled: '',
      tonnageExportedForRecycling: '',
      tonnageSentOnTotal: '0',
      tonnageSentOnToReprocessor: '0',
      tonnageSentOnToExporter: '0',
      tonnageSentOnToOtherFacilities: '0',
      tonnagePrnsPernsIssued: '',
      totalRevenuePrnsPerns: '',
      averagePrnPernPricePerTonne: '',
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
          submittedBy: 'Jane Smith'
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Feb 2026',
          dueDate: '2026-03-20',
          submittedDate: '',
          submittedBy: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Mar 2026',
          dueDate: '2026-04-20',
          submittedDate: '',
          submittedBy: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Jan 2026',
          dueDate: '2026-02-20',
          submittedDate: '',
          submittedBy: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Feb 2026',
          dueDate: '2026-03-20',
          submittedDate: '',
          submittedBy: ''
        },
        {
          ...baseRow,
          ...emptyTonnage,
          reportingPeriod: 'Mar 2026',
          dueDate: '2026-04-20',
          submittedDate: '',
          submittedBy: ''
        }
      ]
    })
  })

  it('includes submitted reports from all years when the same org/registration spans multiple years', async () => {
    const orgRepo = createInMemoryOrganisationsRepository()()
    const reportsRepo = createInMemoryReportsRepository()()

    const org = await buildApprovedOrg(orgRepo)
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
  submitterContactDetails: {
    phone: '01234567890',
    email: 'submitter@example.com'
  },
  approvedPersons: [{ phone: '09876543210', email: 'ap@example.com' }],
  ...overrides
})

const makeOrgsRepo = (orgs) => ({
  findAll: vi.fn().mockResolvedValue(orgs)
})

const makeReportsRepo = (allPeriodicReports = []) => ({
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
