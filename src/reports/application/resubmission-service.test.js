import { ObjectId } from 'mongodb'
import { config } from '#root/config.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  createAndSubmitReport,
  buildCreateReportParams
} from '#reports/repository/contract/test-data.js'
import {
  isLatestSubmission,
  canRequestResubmission,
  requestOperatorResubmission
} from './resubmission-service.js'

/**
 * @import { Registration } from '#domain/organisations/registration.js'
 */

/**
 * @param {Partial<Registration>} [overrides]
 * @returns {Registration}
 */
const buildRegistration = (overrides = {}) => {
  const hasAccreditationIdOverride = 'accreditationId' in overrides
  const accreditationId = hasAccreditationIdOverride
    ? overrides.accreditationId
    : new ObjectId().toString()
  const defaultAccreditation = accreditationId ? { status: 'approved' } : null
  const accreditation =
    'accreditation' in overrides
      ? overrides.accreditation
      : defaultAccreditation
  const { accreditation: _a, accreditationId: _b, ...rest } = overrides
  return /** @type {Registration} */ (
    /** @type {unknown} */ ({
      id: new ObjectId().toString(),
      accreditationId,
      accreditation,
      material: 'plastic',
      wasteProcessingType: 'reprocessor',
      site: {
        address: {
          line1: '1 Recycling Lane',
          town: 'Greenville',
          postcode: 'GR1 1AA'
        }
      },
      ...rest
    })
  )
}

const defaultParams = () => {
  const organisationId = new ObjectId().toString()
  const registration = buildRegistration()
  return {
    organisationId,
    registrationId: registration.id,
    registration,
    year: 2024,
    cadence: /** @type {import('#reports/domain/cadence.js').Cadence} */ (
      'monthly'
    ),
    period: 1,
    submissionNumber: 1
  }
}

describe('resubmission-service', () => {
  describe('isLatestSubmission', () => {
    const stubRepository = (periodicReports) =>
      /** @type {any} */ ({
        findPeriodicReports: vi.fn().mockResolvedValue(periodicReports)
      })

    const slotWith = (current, previousSubmissions = []) => [
      {
        year: 2024,
        reports: { monthly: { 1: { current, previousSubmissions } } }
      }
    ]

    it('returns false when the period has no reports at all', async () => {
      const result = await isLatestSubmission(
        stubRepository([]),
        'org-1',
        'reg-1',
        2024,
        'monthly',
        1,
        1
      )

      expect(result).toBe(false)
    })

    it('returns false for an earlier submission superseded by a later in-progress draft', async () => {
      const draft = { status: REPORT_STATUS.IN_PROGRESS, submissionNumber: 2 }
      const submitted = { status: REPORT_STATUS.SUBMITTED, submissionNumber: 1 }

      const result = await isLatestSubmission(
        stubRepository(slotWith(draft, [submitted])),
        'org-1',
        'reg-1',
        2024,
        'monthly',
        1,
        1
      )

      expect(result).toBe(false)
    })
  })

  describe('canRequestResubmission', () => {
    beforeEach(() => {
      config.set('featureFlags.closedPeriodAdjustments', true)
    })

    afterEach(() => {
      config.set('featureFlags.closedPeriodAdjustments', false)
    })

    const buildReport = (overrides = {}) => ({
      year: 2024,
      cadence: /** @type {import('#reports/domain/cadence.js').Cadence} */ (
        'monthly'
      ),
      period: 1,
      submissionNumber: 1,
      status: REPORT_STATUS.SUBMITTED,
      resubmissionRequired: null,
      ...overrides
    })

    const periodicReportsWith = (current, previousSubmissions = []) => [
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        year: 2024,
        reports: {
          monthly: {
            1: {
              startDate: '2024-01-01',
              endDate: '2024-01-31',
              dueDate: '2024-02-15',
              current,
              previousSubmissions
            }
          }
        }
      }
    ]

    it('returns true for a plain submitted report with no draft and no prior flag', () => {
      const report = buildReport()
      const periodicReports = periodicReportsWith({
        id: 'report-1',
        submissionNumber: 1,
        status: REPORT_STATUS.SUBMITTED
      })

      expect(canRequestResubmission(periodicReports, report)).toBe(true)
    })

    it('returns false when the report is not submitted', () => {
      const report = buildReport({
        status: REPORT_STATUS.READY_TO_SUBMIT
      })
      const periodicReports = periodicReportsWith({
        id: 'report-1',
        submissionNumber: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT
      })

      expect(canRequestResubmission(periodicReports, report)).toBe(false)
    })

    it('returns false when resubmissionRequired.operatorRequested is already set', () => {
      const report = buildReport({
        resubmissionRequired: {
          operatorRequested: {
            requestedAt: '2026-06-01T12:00:00.000Z',
            requestedBy: { id: 'user-1' }
          }
        }
      })
      const periodicReports = periodicReportsWith({
        id: 'report-1',
        submissionNumber: 1,
        status: REPORT_STATUS.SUBMITTED
      })

      expect(canRequestResubmission(periodicReports, report)).toBe(false)
    })

    it('returns false when a later submission exists for the period', () => {
      const report = buildReport()
      const periodicReports = periodicReportsWith(
        {
          id: 'report-2',
          submissionNumber: 2,
          status: REPORT_STATUS.SUBMITTED
        },
        [
          {
            id: 'report-1',
            submissionNumber: 1,
            status: REPORT_STATUS.SUBMITTED
          }
        ]
      )

      expect(canRequestResubmission(periodicReports, report)).toBe(false)
    })

    it('returns false when a draft above the report makes it no longer the latest', () => {
      const report = buildReport()
      const periodicReports = periodicReportsWith(
        {
          id: 'draft-1',
          submissionNumber: 2,
          status: REPORT_STATUS.IN_PROGRESS
        },
        [
          {
            id: 'report-1',
            submissionNumber: 1,
            status: REPORT_STATUS.SUBMITTED
          }
        ]
      )

      expect(canRequestResubmission(periodicReports, report)).toBe(false)
    })

    it('returns false when closedPeriodAdjustments is disabled', () => {
      config.set('featureFlags.closedPeriodAdjustments', false)
      const report = buildReport()
      const periodicReports = periodicReportsWith({
        id: 'report-1',
        submissionNumber: 1,
        status: REPORT_STATUS.SUBMITTED
      })

      expect(canRequestResubmission(periodicReports, report)).toBe(false)
    })
  })

  describe('requestOperatorResubmission', () => {
    const REQUESTED_BY = { id: 'user-1', name: 'Alice', position: 'Officer' }

    beforeEach(() => {
      config.set('featureFlags.closedPeriodAdjustments', true)
    })

    afterEach(() => {
      config.set('featureFlags.closedPeriodAdjustments', false)
    })

    it('flags the report and returns the flagged result', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const { id: reportId } = await reportsRepository.createReport({
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        year: 2024,
        cadence: 'monthly',
        period: 1,
        submissionNumber: 1,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dueDate: '2024-02-15',
        changedBy,
        material: 'plastic',
        wasteProcessingType: 'reprocessor',
        source: { summaryLogId: 'sl-1', lastUploadedAt: null },
        prn: null,
        recyclingActivity: {
          suppliers: [],
          totalTonnageReceived: 0,
          tonnageRecycled: null,
          tonnageNotRecycled: null
        },
        wasteSent: {
          tonnageSentToReprocessor: 0,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 0,
          finalDestinations: []
        }
      })
      await reportsRepository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy
      })
      await reportsRepository.updateReportStatus({
        reportId,
        version: 2,
        status: REPORT_STATUS.SUBMITTED,
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy,
        submissionDeclaredBy: 'Test User'
      })

      const result = await requestOperatorResubmission({
        reportsRepository,
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        year: 2024,
        cadence: 'monthly',
        period: 1,
        submissionNumber: 1,
        requestedBy: REQUESTED_BY
      })

      expect(result).toMatchObject({
        reportId,
        year: 2024,
        cadence: 'monthly',
        period: 1,
        submissionNumber: 1,
        resubmissionRequired: {
          operatorRequested: { requestedBy: REQUESTED_BY }
        }
      })
    })

    it('throws 404 when no report exists at the given submissionNumber', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()

      await expect(
        requestOperatorResubmission({
          reportsRepository,
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          requestedBy: REQUESTED_BY
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws 409 when closedPeriodAdjustments is disabled', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      await createAndSubmitReport(reportsRepository, {
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        submissionNumber: 1
      })

      config.set('featureFlags.closedPeriodAdjustments', false)

      await expect(
        requestOperatorResubmission({
          reportsRepository,
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          requestedBy: REQUESTED_BY
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws 409 when the report is not submitted', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      await reportsRepository.createReport(
        buildCreateReportParams({
          organisationId: params.organisationId,
          registrationId: params.registrationId
        })
      )

      await expect(
        requestOperatorResubmission({
          reportsRepository,
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          requestedBy: REQUESTED_BY
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws 409 when a draft above the submission makes it no longer the latest', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      await createAndSubmitReport(reportsRepository, {
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        submissionNumber: 1
      })
      await reportsRepository.createReport(
        buildCreateReportParams({
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          submissionNumber: 2
        })
      )

      await expect(
        requestOperatorResubmission({
          reportsRepository,
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          year: 2024,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 1,
          requestedBy: REQUESTED_BY
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws 409 when the write loses a race after validation passes', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      await createAndSubmitReport(reportsRepository, {
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        submissionNumber: 1
      })

      const requestParams = {
        reportsRepository,
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        year: 2024,
        cadence: /** @type {import('#reports/domain/cadence.js').Cadence} */ (
          'monthly'
        ),
        period: 1,
        submissionNumber: 1,
        requestedBy: REQUESTED_BY
      }

      // Simulates something changing between the eligibility check passing
      // and this write running (e.g. a concurrent request), independent of
      // whatever the real write would have done.
      reportsRepository.markSubmittedReportRequiringResubmissionByOperator =
        async () => null

      await expect(
        requestOperatorResubmission(requestParams)
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })
  })
})
