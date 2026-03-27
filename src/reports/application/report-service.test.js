import { ObjectId } from 'mongodb'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import {
  fetchOrGenerateReportForPeriod,
  createReportForPeriod
} from './report-service.js'

const buildRegistration = (overrides = {}) => ({
  id: new ObjectId().toString(),
  accreditationId: new ObjectId().toString(),
  material: 'plastic',
  wasteProcessingType: 'reprocessor',
  site: {
    address: {
      line1: '1 Recycling Lane',
      town: 'Greenville',
      postcode: 'GR1 1AA'
    }
  },
  ...overrides
})

const buildWasteRecord = ({
  data = {},
  createdAt = '2024-01-15T00:00:00Z'
} = {}) => ({
  id: new ObjectId().toString(),
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
  versions: [{ createdAt }]
})

const defaultParams = () => {
  const organisationId = new ObjectId().toString()
  const registration = buildRegistration()
  return {
    organisationId,
    registrationId: registration.id,
    registration,
    year: 2024,
    cadence: 'monthly',
    period: 1
  }
}

describe('report-service', () => {
  describe('fetchOrGenerateReportForPeriod', () => {
    it('returns computed report when no stored report exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      const params = defaultParams()

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
      expect(report.id).toBeUndefined()
    })

    it('returns stored report when one exists', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      await reportsRepository.createReport({
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
        wasteProcessingType: 'reprocessor'
      })

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.id).toBeDefined()
      expect(report.status).toBe(REPORT_STATUS.IN_PROGRESS)
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
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()

      const report = await fetchOrGenerateReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params
      })

      expect(report.recyclingActivity.suppliers).toHaveLength(1)
      expect(report.recyclingActivity.suppliers[0].supplierName).toBe(
        'Supplier A'
      )
    })
  })

  describe('createReportForPeriod', () => {
    it('creates a report and returns the full object', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      const params = defaultParams()
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }

      const report = await createReportForPeriod({
        reportsRepository,
        wasteRecordsRepository,
        packagingRecyclingNotesRepository,
        ...params,
        changedBy
      })

      expect(report.id).toBeDefined()
      expect(report.status).toBe(REPORT_STATUS.IN_PROGRESS)
      expect(report.material).toBe('plastic')
      expect(report.recyclingActivity).toBeDefined()
      expect(report.wasteSent).toBeDefined()
    })

    it('throws conflict when report already exists for period', async () => {
      const reportsRepository = createInMemoryReportsRepository()()
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      const params = defaultParams()
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
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
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
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      const params = defaultParams()
      params.registration = buildRegistration({
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      })
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
      const wasteRecordsRepository = createInMemoryWasteRecordsRepository([])()
      const packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()()
      const params = defaultParams()
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

      const buildIssuedPrn = (accreditationId, tonnage) =>
        buildAwaitingAcceptancePrn({
          accreditation: {
            id: accreditationId,
            accreditationNumber: 'ACC-001',
            accreditationYear: 2024,
            material: 'plastic',
            submittedToRegulator: 'ea',
            siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
          },
          tonnage,
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            currentStatusAt: IN_PERIOD,
            issued: { at: IN_PERIOD, by: { id: 'test', name: 'test' } }
          }
        })

      it('is undefined for non-accredited operator', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const wasteRecordsRepository = createInMemoryWasteRecordsRepository(
          []
        )()
        const prnRepo = createInMemoryPackagingRecyclingNotesRepository()()
        const params = defaultParams()
        params.registration = buildRegistration({ accreditationId: undefined })

        const report = await createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn).toBeUndefined()
      })

      it('persists prn with issuedTonnage 0 when accredited and no PRNs exist', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const wasteRecordsRepository = createInMemoryWasteRecordsRepository(
          []
        )()
        const prnRepo = createInMemoryPackagingRecyclingNotesRepository()()
        const params = defaultParams()

        const report = await createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn.issuedTonnage).toBe(0)
      })

      it('persists prn with summed issuedTonnage from PRNs in period', async () => {
        const reportsRepository = createInMemoryReportsRepository()()
        const wasteRecordsRepository = createInMemoryWasteRecordsRepository(
          []
        )()
        const prnRepo = createInMemoryPackagingRecyclingNotesRepository()()
        const params = defaultParams()

        await prnRepo.create(
          buildIssuedPrn(params.registration.accreditationId, 30)
        )
        await prnRepo.create(
          buildIssuedPrn(params.registration.accreditationId, 20)
        )

        const report = await createReportForPeriod({
          reportsRepository,
          wasteRecordsRepository,
          packagingRecyclingNotesRepository: prnRepo,
          ...params,
          changedBy
        })

        expect(report.prn.issuedTonnage).toBe(50)
      })
    })
  })
})
