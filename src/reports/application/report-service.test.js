import { ObjectId } from 'mongodb'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildAwaitingAcceptancePrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  fetchOrGenerateReportForPeriod,
  createReportForPeriod,
  fetchReportBySubmissionNumber,
  createReportsService
} from './report-service.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

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
  return {
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
  }
}

const buildWasteRecord = ({
  data = {},
  createdAt = '2024-01-15T00:00:00Z',
  summaryLogId = 'sl-1'
} = {}) => ({
  id: new ObjectId().toString(),
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    SUPPLIER_NAME: 'Supplier A',
    ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Reprocessor',
    TONNAGE_RECEIVED_FOR_RECYCLING: '100',
    DATE_RECEIVED_FOR_REPROCESSING: '2024-01-10',
    FINAL_DESTINATION_NAME: 'Dest A',
    FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: '50',
    DATE_LOAD_LEFT_SITE: '2024-01-12',
    ...data
  },
  versions: [{ createdAt, summaryLog: { id: summaryLogId } }]
})

const buildWasteRecordsRepository = (params) =>
  createInMemoryWasteRecordsRepository([
    {
      ...buildWasteRecord(),
      organisationId: params.organisationId,
      registrationId: params.registrationId
    }
  ])()

const createPrnRepo = (initialData = []) =>
  createInMemoryPackagingRecyclingNotesRepository(initialData)(
    /** @type {any} */ (null)
  )

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
    submissionNumber: 1,
    overseasSitesRepository: createInMemoryOverseasSitesRepository()()
  }
}

describe('report-service', () => {
  describe('fetchOrGenerateReportForPeriod', () => {
    it('returns computed report when no stored report exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
      expect(report).not.toHaveProperty('id')
    })

    it('returns stored report when one exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await reportsRepository.createReport({
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
        source: {
          summaryLogId: 'sl-1',
          lastUploadedAt: '2026-04-01T21:22:28.351Z'
        },
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

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      const storedReport =
        /** @type {import('#reports/repository/port.js').Report} */ (report)
      expect(storedReport.id).toBeDefined()
      expect(storedReport.status.currentStatus).toBe(REPORT_STATUS.IN_PROGRESS)
    })

    it('returns stored report when submissionNumber matches a previous submission', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const baseReport = {
        organisationId: params.organisationId,
        registrationId: params.registrationId,
        year: 2024,
        cadence: 'monthly',
        period: 1,
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
      }

      const report1 = await reportsRepository.createReport({
        ...baseReport,
        submissionNumber: 1
      })
      await reportsRepository.updateReportStatus({
        reportId: report1.id,
        version: 1,
        status: 'submitted',
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy,
        submissionDeclaredBy: 'Test User'
      })
      await reportsRepository.createReport({
        ...baseReport,
        submissionNumber: 2
      })

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params,
        submissionNumber: 1
      })

      const storedReport =
        /** @type {import('#reports/repository/port.js').Report} */ (report)
      expect(storedReport.id).toBe(report1.id)
    })

    it('returns computed report with aggregated waste data', async () => {
      const params = defaultParams()
      const record = buildWasteRecord()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([
        {
          organisationId: params.organisationId,
          registrationId: params.registrationId,
          ...record
        }
      ])()
      const reportsRepository = createInMemoryReportsRepository()()
      const packagingRecyclingNotesRepository = createPrnRepo()

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity?.suppliers).toHaveLength(1)
      expect(report.recyclingActivity?.suppliers[0]?.supplierName).toBe(
        'Supplier A'
      )
    })
  })

  describe('fetchReportBySubmissionNumber', () => {
    const baseReportFields = (params, changedBy) => ({
      organisationId: params.organisationId,
      registrationId: params.registrationId,
      year: 2024,
      cadence: 'monthly',
      period: 1,
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

    it('returns null when submissionNumber does not match current or any previous submission', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await reportsRepository.createReport({
        ...baseReportFields(params, changedBy),
        submissionNumber: 1
      })

      const result = await fetchReportBySubmissionNumber(
        reportsRepository,
        params.organisationId,
        params.registrationId,
        2024,
        'monthly',
        1,
        99
      )

      expect(result).toBeNull()
    })
  })

  describe('createReportForPeriod', () => {
    it('creates a report and returns the full object', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const wasteRecordsRepository = buildWasteRecordsRepository(params)
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.id).toBeDefined()
      expect(report.status.currentStatus).toBe(REPORT_STATUS.IN_PROGRESS)
      expect(report.material).toBe('plastic')
      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
    })

    it('throws conflict when report already exists for period', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const wasteRecordsRepository = buildWasteRecordsRepository(params)
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await createReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      await expect(
        createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository,
          ...params,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws badRequest for period that has not yet ended', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository = createPrnRepo()
      const params = defaultParams()
      params.year = 2099
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await expect(
        createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository,
          ...params,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('resolves glass material to glass recycling process', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      params.registration = buildRegistration({
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      })
      const wasteRecordsRepository = buildWasteRecordsRepository(params)
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.material).toBe('glass_re_melt')
    })

    it('formats site address into single-line string', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const params = defaultParams()
      const wasteRecordsRepository = buildWasteRecordsRepository(params)
      const packagingRecyclingNotesRepository = createPrnRepo()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.siteAddress).toBe('1 Recycling Lane, Greenville, GR1 1AA')
    })

    describe('prn', () => {
      const IN_PERIOD = new Date('2024-01-15T12:00:00.000Z')
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const accreditationOf = ({
        organisationId,
        registrationId,
        registration
      }) => ({
        organisationId,
        registrationId,
        accreditationId: registration.accreditationId
      })

      const buildIssuedPrn = (accreditation, tonnage) =>
        buildAwaitingAcceptancePrn({
          ...underAccreditation(accreditation),
          tonnage,
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            currentStatusAt: IN_PERIOD,
            issued: { at: IN_PERIOD, by: { id: 'test', name: 'test' } },
            history: [
              {
                status: PRN_STATUS.AWAITING_ACCEPTANCE,
                at: IN_PERIOD,
                by: { id: 'test', name: 'test' }
              }
            ]
          }
        })

      it('is null for non-accredited operator', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const params = defaultParams()
        params.registration = buildRegistration({ accreditationId: undefined })
        const wasteRecordsRepository = buildWasteRecordsRepository(params)
        const prnRepo = createPrnRepo()

        const report = await createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn).toBeNull()
      })

      it('persists prn with issuedTonnage 0 when accredited and no PRNs exist', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const params = defaultParams()
        const wasteRecordsRepository = buildWasteRecordsRepository(params)
        const prnRepo = createPrnRepo()

        const report = await createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn?.issuedTonnage).toBe(0)
      })

      it('persists prn with summed issuedTonnage from PRNs in period', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const params = defaultParams()
        const wasteRecordsRepository = buildWasteRecordsRepository(params)
        const prnRepo = createPrnRepo()

        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 30))
        await prnRepo.create(buildIssuedPrn(accreditationOf(params), 20))

        const report = await createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn?.issuedTonnage).toBe(50)
      })
    })
  })
})

describe('createReportsService', () => {
  it('delegates hasReportSubmittedSince to the repository and returns its result', async () => {
    const reportsRepository = /** @type {any} */ ({
      hasReportSubmittedSince: vi.fn().mockResolvedValue(true),
      findPeriodicReports: vi.fn()
    })
    const service = createReportsService(reportsRepository)

    const result = await service.hasReportSubmittedSince(
      'org-1',
      'reg-1',
      '2026-07-01T00:00:00.000Z'
    )

    expect(reportsRepository.hasReportSubmittedSince).toHaveBeenCalledWith(
      'org-1',
      'reg-1',
      '2026-07-01T00:00:00.000Z'
    )
    expect(result).toBe(true)
  })

  it('delegates findPeriodicReports to the repository and returns its result', async () => {
    const periodicReports = [
      { organisationId: 'org-1', registrationId: 'reg-1' }
    ]
    const reportsRepository = /** @type {any} */ ({
      hasReportSubmittedSince: vi.fn(),
      findPeriodicReports: vi.fn().mockResolvedValue(periodicReports)
    })
    const service = createReportsService(reportsRepository)

    const params = { organisationId: 'org-1', registrationId: 'reg-1' }
    const result = await service.findPeriodicReports(params)

    expect(reportsRepository.findPeriodicReports).toHaveBeenCalledWith(params)
    expect(result).toBe(periodicReports)
  })
})
