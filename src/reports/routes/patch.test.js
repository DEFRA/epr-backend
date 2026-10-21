import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { REPORT_STATUS_SLOT } from '#reports/domain/report-status.js'
import {
  accreditation,
  exporter,
  exporterAccreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { buildUpdatedPrn } from './patch.js'

const { buildOrganisation } = createOrganisationBuilders()

const YEAR = 2026

const STREAMS = {
  registeredOnly: { cadence: 'quarterly', period: 1 },
  accredited: { cadence: 'monthly', period: 7 }
}

const EXPORT_ACTIVITY = {
  overseasSites: [],
  unapprovedOverseasSites: [],
  totalTonnageExported: 0,
  tonnageReceivedNotExported: null,
  tonnageRefusedAtDestination: 0,
  tonnageStoppedDuringExport: 0,
  totalTonnageRefusedOrStopped: 0,
  tonnageRepatriated: 0
}

describe('PATCH /organisations/{organisationNumber}/registrations/{registrationNumber}/.../submissions/{submissionNumber}', () => {
  setupAuthContext()

  /**
   * @param {{
   *   accredited?: boolean,
   *   wasteProcessingType?: 'reprocessor' | 'exporter',
   *   report?: object
   * }} [options]
   */
  const createServer = async ({
    accredited = false,
    wasteProcessingType = 'reprocessor',
    report = {}
  } = {}) => {
    const isExporter = wasteProcessingType === 'exporter'
    const accreditations = accredited
      ? [isExporter ? exporterAccreditation() : accreditation()]
      : []
    const buildRegistration = isExporter ? exporter : reprocessor
    const registration = buildRegistration(
      accredited ? { accreditationId: accreditations[0].id } : {}
    )
    const org = buildOrganisation({
      registrations: [registration],
      accreditations
    })
    const { cadence, period } = accredited
      ? STREAMS.accredited
      : STREAMS.registeredOnly

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const createdReport = await reportsRepository.createReport(
      buildCreateReportParams({
        organisationId: org.id,
        registrationId: registration.id,
        year: YEAR,
        cadence,
        period,
        wasteProcessingType,
        ...report
      })
    )

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(org)
        ]),
        reportsRepository: reportsRepositoryFactory
      }
    })

    const registrationUrl = `/organisations/${org.orgId}/registrations/${registration.registrationNumber}`
    const reports = accredited
      ? `${registrationUrl}/accreditations/${YEAR}/reports/${cadence}`
      : `${registrationUrl}/reports/${YEAR}/${cadence}`

    return {
      organisationId: org.id,
      registrationId: registration.id,
      reportId: createdReport.id,
      reportsRepository,
      /**
       * @param {object} payload
       * @param {{ period?: number, cadence?: string }} [target]
       */
      patchReport: async (
        payload,
        { period: targetPeriod = period, cadence: targetCadence } = {}
      ) => {
        const base = targetCadence
          ? `${registrationUrl}/reports/${YEAR}/${targetCadence}`
          : reports
        const response = await server.inject({
          method: 'PATCH',
          url: `${base}/${targetPeriod}/submissions/1`,
          payload,
          ...asOperator()
        })
        return {
          statusCode: response.statusCode,
          body: JSON.parse(response.payload)
        }
      }
    }
  }

  /**
   * @param {ReportsRepository} reportsRepository
   * @param {string} reportId
   */
  const markReadyToSubmit = (reportsRepository, reportId) =>
    reportsRepository.updateReportStatus({
      reportId,
      version: 1,
      status: 'ready_to_submit',
      slot: REPORT_STATUS_SLOT.READY,
      changedBy: { id: 'user-1', name: 'Test User', position: 'tester' }
    })

  describe('updating supporting information', () => {
    it('returns 200 with updated report', async () => {
      const { reportsRepository, reportId, patchReport } = await createServer()

      const before = await reportsRepository.findReportById(reportId)
      expect(before.supportingInformation).toBeUndefined()

      const { statusCode, body } = await patchReport({
        supportingInformation: 'Supply chain disruption'
      })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.supportingInformation).toBe('Supply chain disruption')
    })

    it('accepts empty string for supporting information', async () => {
      const { patchReport } = await createServer()

      const { statusCode, body } = await patchReport({
        supportingInformation: ''
      })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.supportingInformation).toBe('')
    })

    it('increments report version after update', async () => {
      const { reportsRepository, reportId, patchReport } = await createServer()

      const before = await reportsRepository.findReportById(reportId)
      expect(before.version).toBe(1)

      const { body } = await patchReport({ supportingInformation: 'notes' })

      expect(body.version).toBe(2)
    })
  })

  describe('updating PRN data fields', () => {
    const accreditedWithPrn = (issuedTonnage = 100) =>
      createServer({ accredited: true, report: { prn: { issuedTonnage } } })

    it('returns 200 when patching prnRevenue', async () => {
      const { patchReport } = await accreditedWithPrn()

      const { statusCode, body } = await patchReport({ prnRevenue: 1576.12 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.prn.totalRevenue).toBe(1576.12)
    })

    it('returns 200 when patching freeTonnage', async () => {
      const { patchReport } = await accreditedWithPrn()

      const { statusCode, body } = await patchReport({ freeTonnage: 5 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.prn.freeTonnage).toBe(5)
    })

    it('preserves existing prn fields when patching only one field', async () => {
      const { patchReport } = await accreditedWithPrn()

      await patchReport({ prnRevenue: 500 })
      const { statusCode, body } = await patchReport({ freeTonnage: 10 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.prn.totalRevenue).toBe(500)
      expect(body.prn.freeTonnage).toBe(10)
      expect(body.prn.averagePricePerTonne).toBeCloseTo(5.56, 1)
    })

    it.each([1576.12, 1576.1, 1576, 0, 0.07])(
      'returns 200 when prn-revenue is %s',
      async (prnRevenue) => {
        const { patchReport } = await accreditedWithPrn()

        const { statusCode } = await patchReport({ prnRevenue })

        expect(statusCode).toBe(StatusCodes.OK)
      }
    )

    it.each([1576.123, 0.001, 99.999])(
      'returns 422 when prn-revenue is %s (more than 2 decimal places)',
      async (prnRevenue) => {
        const { patchReport } = await accreditedWithPrn()

        const { statusCode } = await patchReport({ prnRevenue })

        expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )

    it('returns 422 when prnRevenue is negative', async () => {
      const { patchReport } = await accreditedWithPrn()

      const { statusCode } = await patchReport({ prnRevenue: -1 })

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when free-tonnage is not a whole number', async () => {
      const { patchReport } = await accreditedWithPrn()

      const { statusCode } = await patchReport({ freeTonnage: 10.5 })

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 400 when freeTonnage exceeds issued tonnage', async () => {
      const { patchReport } = await accreditedWithPrn()

      const { statusCode } = await patchReport({ freeTonnage: 101 })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 200 when freeTonnage equals issued tonnage', async () => {
      const { patchReport } = await accreditedWithPrn(50)

      const { statusCode } = await patchReport({ freeTonnage: 50 })

      expect(statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('updating recycling activity fields', () => {
    const withRecyclingActivity = () =>
      createServer({
        report: {
          recyclingActivity: {
            totalTonnageReceived: 200,
            suppliers: [],
            tonnageRecycled: null,
            tonnageNotRecycled: null
          }
        }
      })

    it('returns 200 when patching tonnageRecycled', async () => {
      const { patchReport } = await withRecyclingActivity()

      const { statusCode, body } = await patchReport({ tonnageRecycled: 100.5 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.recyclingActivity.tonnageRecycled).toBe(100.5)
    })

    it('returns 200 when patching tonnageNotRecycled', async () => {
      const { patchReport } = await withRecyclingActivity()

      const { statusCode, body } = await patchReport({ tonnageNotRecycled: 20 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.recyclingActivity.tonnageNotRecycled).toBe(20)
    })

    it('returns 200 when patching both tonnage fields in one request', async () => {
      const { patchReport } = await withRecyclingActivity()

      const { statusCode, body } = await patchReport({
        tonnageRecycled: 100,
        tonnageNotRecycled: 20
      })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.recyclingActivity.tonnageRecycled).toBe(100)
      expect(body.recyclingActivity.tonnageNotRecycled).toBe(20)
    })

    it('preserves existing recyclingActivity fields when patching one field', async () => {
      const { patchReport } = await withRecyclingActivity()

      await patchReport({ tonnageRecycled: 100 })
      const { statusCode, body } = await patchReport({ tonnageNotRecycled: 20 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.recyclingActivity.tonnageRecycled).toBe(100)
      expect(body.recyclingActivity.tonnageNotRecycled).toBe(20)
      expect(body.recyclingActivity.totalTonnageReceived).toBe(200)
    })

    it('sets tonnageRecycled on a report with no tonnages entered yet', async () => {
      const { patchReport } = await createServer()

      const { statusCode, body } = await patchReport({ tonnageRecycled: 50 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.recyclingActivity.tonnageRecycled).toBe(50)
    })

    it.each([100.123, 0.001, 20.999])(
      'returns 422 when tonnage-recycled is %s (more than 2 decimal places)',
      async (tonnageRecycled) => {
        const { patchReport } = await createServer()

        const { statusCode } = await patchReport({ tonnageRecycled })

        expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )

    it.each([20.123, 0.001, 5.999])(
      'returns 422 when tonnage-not-recycled is %s (more than 2 decimal places)',
      async (tonnageNotRecycled) => {
        const { patchReport } = await createServer()

        const { statusCode } = await patchReport({ tonnageNotRecycled })

        expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )

    it('returns 422 when tonnageRecycled is negative', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport({ tonnageRecycled: -1 })

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 400 when patching tonnageRecycled on non-in_progress report', async () => {
      const { reportsRepository, reportId, patchReport } = await createServer()
      await markReadyToSubmit(reportsRepository, reportId)

      const { statusCode } = await patchReport({ tonnageRecycled: 100 })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })
  })

  describe('updating export activity fields', () => {
    it('returns 200 when patching tonnageNotExported', async () => {
      const { patchReport } = await createServer({
        wasteProcessingType: 'exporter',
        report: { exportActivity: EXPORT_ACTIVITY }
      })

      const { statusCode, body } = await patchReport({
        tonnageNotExported: 15.5
      })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.exportActivity.tonnageReceivedNotExported).toBe(15.5)
    })

    it('preserves existing exportActivity fields when patching tonnageNotExported', async () => {
      const { patchReport } = await createServer({
        wasteProcessingType: 'exporter',
        report: {
          exportActivity: { ...EXPORT_ACTIVITY, totalTonnageExported: 20 }
        }
      })

      const { statusCode, body } = await patchReport({ tonnageNotExported: 10 })

      expect(statusCode).toBe(StatusCodes.OK)
      expect(body.exportActivity.tonnageReceivedNotExported).toBe(10)
      expect(body.exportActivity.totalTonnageExported).toBe(20)
    })

    it('returns 400 when patching tonnageNotExported for an accredited exporter', async () => {
      const { patchReport } = await createServer({
        accredited: true,
        wasteProcessingType: 'exporter',
        report: { prn: { issuedTonnage: 100 } }
      })

      const { statusCode } = await patchReport({ tonnageNotExported: 10 })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 400 when patching tonnageNotExported for a reprocessor', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport({ tonnageNotExported: 10 })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 422 when tonnageNotExported is negative', async () => {
      const { patchReport } = await createServer({
        wasteProcessingType: 'exporter'
      })

      const { statusCode } = await patchReport({ tonnageNotExported: -1 })

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it.each([10.123, 0.001, 5.999])(
      'returns 422 when tonnageNotExported is %s (more than 2 decimal places)',
      async (tonnageNotExported) => {
        const { patchReport } = await createServer({
          wasteProcessingType: 'exporter'
        })

        const { statusCode } = await patchReport({ tonnageNotExported })

        expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )
  })

  describe('PRN data status guard', () => {
    it('returns 400 when patching PRN fields on a report with no PRN record', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport({ prnRevenue: 100 })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 400 when patching prnRevenue on non-in_progress report', async () => {
      const { reportsRepository, reportId, patchReport } = await createServer({
        accredited: true,
        report: { prn: { issuedTonnage: 100 } }
      })
      await markReadyToSubmit(reportsRepository, reportId)

      const { statusCode } = await patchReport({ prnRevenue: 100 })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })
  })

  describe('error handling', () => {
    it('returns 400 when report is submitted', async () => {
      const { reportsRepository, reportId, patchReport } = await createServer()
      await markReadyToSubmit(reportsRepository, reportId)
      await reportsRepository.updateReportStatus({
        reportId,
        version: 2,
        status: 'submitted',
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy: { id: 'test', name: 'Test', position: 'Officer' },
        submissionDeclaredBy: 'Test User'
      })

      const { statusCode } = await patchReport({
        supportingInformation: 'too late'
      })

      expect(statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 422 when status is sent via PATCH', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport({ status: 'ready_to_submit' })

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 404 when no report exists for period', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport(
        { supportingInformation: 'notes' },
        { period: 2 }
      )

      expect(statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 422 when payload is empty', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport({})

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when supporting information exceeds max length', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport({
        supportingInformation: 'x'.repeat(2001)
      })

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 for invalid cadence', async () => {
      const { patchReport } = await createServer()

      const { statusCode } = await patchReport(
        { supportingInformation: 'notes' },
        { cadence: 'biweekly' }
      )

      expect(statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('when report is stale', () => {
    it('returns 409 with summary_log_changed code', async () => {
      const { organisationId, registrationId, reportsRepository, patchReport } =
        await createServer()

      await reportsRepository.markActiveReportsStaleForSummaryLog(
        organisationId,
        registrationId,
        'sl-new',
        new Date().toISOString()
      )

      const { statusCode, body } = await patchReport({
        supportingInformation: 'notes'
      })

      expect(statusCode).toBe(StatusCodes.CONFLICT)
      expect(body.code).toEqual(['summary_log_changed'])
    })
  })
})

describe('buildUpdatedPrn', () => {
  it('sets revenue and zeros average when freeTonnage is missing', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: 100, freeTonnage: null },
      500,
      undefined
    )

    expect(result.totalRevenue).toBe(500)
    expect(result.issuedTonnage).toBe(100)
    expect(result.averagePricePerTonne).toBe(0)
  })

  it('computes average when all three values are present', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: 100, freeTonnage: 0 },
      500,
      undefined
    )

    expect(result.totalRevenue).toBe(500)
    expect(result.averagePricePerTonne).toBe(5)
  })

  it('sets freeTonnage and computes average excluding free tonnage', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: 100, freeTonnage: null, totalRevenue: 500 },
      undefined,
      10
    )

    expect(result.freeTonnage).toBe(10)
    expect(result.totalRevenue).toBe(500)
    expect(result.averagePricePerTonne).toBeCloseTo(5.56, 1)
  })

  it('returns zero average when denominator is zero', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: 50, freeTonnage: null },
      500,
      50
    )

    expect(result.averagePricePerTonne).toBe(0)
  })

  it('zeros average when issuedTonnage is negative', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: -1, freeTonnage: null },
      100,
      5
    )

    expect(result.totalRevenue).toBe(100)
    expect(result.freeTonnage).toBe(5)
    expect(result.averagePricePerTonne).toBe(0)
  })
})

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 */
