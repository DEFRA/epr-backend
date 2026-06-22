import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { buildRowStateEntry } from '#waste-records/repository/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

import { runRowStateDiscrepancyReport } from './run-row-state-discrepancy-report.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const orgsRepository = (organisations) => ({
  findAll: async () => organisations
})
const sitesRepository = (sites) => ({ findAll: async () => sites })

const committedRecord = (organisationId, registrationId, rowId, head) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  excludedFromWasteBalance: true,
  versions: [{ summaryLog: { id: head } }]
})

const includedEntry = (rowId, transactionAmount) =>
  buildRowStateEntry({
    rowId,
    classification: {
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount
    }
  })

const buildServer = (
  app,
  lock = { free: vi.fn().mockResolvedValue(undefined) }
) => ({
  app,
  locker: { lock: vi.fn().mockResolvedValue(lock) }
})

const emptyEstate = () => ({
  organisationsRepository: orgsRepository([]),
  streamRepository: createInMemoryStreamRepository()(),
  wasteRecordStatesRepository: createInMemoryRowStateRepository()(),
  wasteRecordsRepository: createInMemoryWasteRecordsRepository()(),
  overseasSitesRepository: sitesRepository([])
})

const cleanCoveredEstate = async () => {
  const rowStateRepository = createInMemoryRowStateRepository()()
  await rowStateRepository.upsertRowStates(
    {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    },
    [includedEntry('row-1', 10)],
    'log-1'
  )

  return {
    organisationsRepository: orgsRepository([
      {
        id: 'org-1',
        registrations: [
          { id: 'reg-1', accreditationId: 'acc-1', overseasSites: {} }
        ],
        accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
      }
    ]),
    streamRepository: createInMemoryStreamRepository([
      buildStreamEvent({
        registrationId: 'reg-1',
        accreditationId: 'acc-1',
        payload: { summaryLogId: 'log-1', creditTotal: 10 }
      })
    ])(),
    wasteRecordStatesRepository: rowStateRepository,
    wasteRecordsRepository: createInMemoryWasteRecordsRepository([
      committedRecord('org-1', 'reg-1', 'row-1', 'log-1')
    ])(),
    overseasSitesRepository: sitesRepository([])
  }
}

const estateWithMissingRowState = async () => {
  const rowStateRepository = createInMemoryRowStateRepository()()
  await rowStateRepository.upsertRowStates(
    {
      organisationId: 'org-1',
      registrationId: 'reg-acc',
      accreditationId: 'acc-1'
    },
    [includedEntry('row-1', 10)],
    'log-acc'
  )

  return {
    organisationsRepository: orgsRepository([
      {
        id: 'org-1',
        registrations: [
          { id: 'reg-acc', accreditationId: 'acc-1', overseasSites: {} },
          { id: 'reg-only', overseasSites: {} }
        ],
        accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
      }
    ]),
    streamRepository: createInMemoryStreamRepository([
      buildStreamEvent({
        registrationId: 'reg-acc',
        accreditationId: 'acc-1',
        payload: { summaryLogId: 'log-acc', creditTotal: 10 }
      }),
      buildStreamEvent({
        registrationId: 'reg-only',
        accreditationId: null,
        payload: { summaryLogId: 'log-only', creditTotal: 0 }
      })
    ])(),
    wasteRecordStatesRepository: rowStateRepository,
    wasteRecordsRepository: createInMemoryWasteRecordsRepository([
      committedRecord('org-1', 'reg-acc', 'row-1', 'log-acc')
    ])(),
    overseasSitesRepository: sitesRepository([])
  }
}

describe('runRowStateDiscrepancyReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(emptyEstate(), lock)

    await runRowStateDiscrepancyReport(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'row-state-discrepancy-report'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the report and reads nothing when the lock is held by another instance', async () => {
    const organisationsRepository = {
      findAll: vi.fn().mockResolvedValue([])
    }
    const server = {
      app: { ...emptyEstate(), organisationsRepository },
      locker: { lock: vi.fn().mockResolvedValue(null) }
    }

    await runRowStateDiscrepancyReport(server)

    expect(organisationsRepository.findAll).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping row-state discrepancy report'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs the reconciliation at info when the estate is clean', async () => {
    const server = buildServer(await cleanCoveredEstate())

    await runRowStateDiscrepancyReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        census: expect.objectContaining({ isEstateClean: true }),
        report: expect.stringContaining('VERDICT: CLEAN')
      })
    )
  })

  it('logs the reconciliation at error when discrepancies exist, so the OpenSearch alert surfaces it', async () => {
    const server = buildServer(await estateWithMissingRowState())

    await runRowStateDiscrepancyReport(server)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        census: expect.objectContaining({
          isEstateClean: false,
          partitionsMissingRowStateData: 1
        }),
        report: expect.stringContaining('VERDICT: DISCREPANCIES FOUND')
      })
    )
  })

  it('releases the lock and logs an error when reconciliation throws', async () => {
    const error = new Error('mongo unavailable')
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(
      {
        ...emptyEstate(),
        organisationsRepository: { findAll: vi.fn().mockRejectedValue(error) }
      },
      lock
    )

    await runRowStateDiscrepancyReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run row-state discrepancy report'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    const server = {
      app: emptyEstate(),
      locker: { lock: vi.fn().mockRejectedValue(error) }
    }

    await runRowStateDiscrepancyReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run row-state discrepancy report'
    })
  })
})
