import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import {
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import { runWasteRecordStateBackfill } from './run-waste-record-state-backfill.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const reprocessorRegistration = (overrides) =>
  buildRegistration({
    wasteProcessingType: 'reprocessor',
    overseasSites: {},
    ...overrides
  })

const fileId = (documentId) => `file-${documentId}`

const submittedLog = (
  documentId,
  organisationId,
  registrationId,
  submittedAt
) => ({
  id: documentId,
  summaryLog: {
    status: SUMMARY_LOG_STATUS.SUBMITTED,
    file: { id: fileId(documentId), name: `${documentId}.xlsx` },
    organisationId,
    registrationId,
    createdAt: submittedAt,
    expiresAt: null,
    submittedAt
  }
})

const receivedRecord = (
  organisationId,
  registrationId,
  rowId,
  summaryLogFileId
) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { supplierName: 'Acme' },
  versions: [
    { summaryLog: { id: summaryLogFileId }, data: { supplierName: 'Acme' } }
  ]
})

const buildServerApp = async ({ organisations, wasteRecords, logs }) => {
  const summaryLogsRepository = createInMemorySummaryLogsRepository()(undefined)
  for (const { id, summaryLog } of logs) {
    await summaryLogsRepository.insert(id, summaryLog)
  }
  return {
    organisationsRepository:
      createInMemoryOrganisationsRepository(organisations)(),
    wasteRecordsRepository:
      createInMemoryWasteRecordsRepository(wasteRecords)(),
    summaryLogsRepository,
    overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
    wasteRecordStatesRepository: createInMemoryRowStateRepository()()
  }
}

describe('runWasteRecordStateBackfill', () => {
  let mockLock
  let mockServer

  beforeEach(() => {
    vi.clearAllMocks()
    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = { locker: { lock: vi.fn().mockResolvedValue(mockLock) } }
  })

  it('acquires the backfill lock, runs the sweep, logs a summary and releases the lock', async () => {
    const registration = reprocessorRegistration({
      id: 'reg-1',
      accreditationId: 'acc-1'
    })
    const organisation = buildOrganisationWithRegistration(
      registration,
      'approved'
    )
    mockServer.app = await buildServerApp({
      organisations: [organisation],
      wasteRecords: [
        receivedRecord(organisation.id, 'reg-1', 'row-1', fileId('sl-1'))
      ],
      logs: [
        submittedLog(
          'sl-1',
          organisation.id,
          'reg-1',
          '2025-01-01T00:00:00.000Z'
        )
      ]
    })

    await runWasteRecordStateBackfill(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'waste-record-state-backfill'
    )
    expect(mockLock.free).toHaveBeenCalled()
    expect(
      (
        await mockServer.app.wasteRecordStatesRepository.findBySummaryLogId(
          fileId('sl-1')
        )
      ).map((d) => d.rowId)
    ).toEqual(['row-1'])
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste record state backfill: organisationsScanned=1 streamsBackfilled=1 submissionsBackfilled=1 rowStateWrites=1 orphanedAccreditations=0'
    })
  })

  it('skips the backfill when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runWasteRecordStateBackfill(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping waste record state backfill'
    })
  })

  it('surfaces each orphaned accreditation as its own info line', async () => {
    const registration = reprocessorRegistration({
      id: 'reg-1',
      accreditationId: 'acc-gone'
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    mockServer.app = await buildServerApp({
      organisations: [organisation],
      wasteRecords: [
        receivedRecord(organisation.id, 'reg-1', 'row-1', fileId('sl-1'))
      ],
      logs: [
        submittedLog(
          'sl-1',
          organisation.id,
          'reg-1',
          '2025-01-01T00:00:00.000Z'
        )
      ]
    })

    await runWasteRecordStateBackfill(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Waste record state backfill: orphaned accreditation organisationId=${organisation.id} registrationId=reg-1 accreditationId=acc-gone`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste record state backfill: organisationsScanned=1 streamsBackfilled=0 submissionsBackfilled=0 rowStateWrites=0 orphanedAccreditations=1'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('releases the lock and logs an error when the sweep throws', async () => {
    const error = new Error('mongo unavailable')
    mockServer.app = {
      organisationsRepository: {
        findAll: vi.fn().mockRejectedValue(error)
      }
    }

    await runWasteRecordStateBackfill(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste record state backfill'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runWasteRecordStateBackfill(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste record state backfill'
    })
  })
})
