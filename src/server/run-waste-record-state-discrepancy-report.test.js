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

import { runWasteRecordStateDiscrepancyReport } from './run-waste-record-state-discrepancy-report.js'

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

const wasteRecordStateEntry = (
  rowId,
  outcome,
  transactionAmount,
  reasons = []
) =>
  buildRowStateEntry({
    rowId,
    classification: { outcome, reasons, transactionAmount }
  })

const approvedOrg = () =>
  orgsRepository([
    {
      id: 'org-1',
      registrations: [
        { id: 'reg-1', accreditationId: 'acc-1', overseasSites: {} }
      ],
      accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
    }
  ])

const streamWithHead = (creditTotal) =>
  createInMemoryStreamRepository([
    buildStreamEvent({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      payload: { summaryLogId: 'log-1', creditTotal }
    })
  ])()

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

const estateFrom = async (wasteRecordStateEntries, creditTotal) => {
  const wasteRecordStatesRepository = createInMemoryRowStateRepository()()
  await wasteRecordStatesRepository.upsertRowStates(
    {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    },
    wasteRecordStateEntries,
    'log-1'
  )
  return {
    organisationsRepository: approvedOrg(),
    streamRepository: streamWithHead(creditTotal),
    wasteRecordStatesRepository,
    wasteRecordsRepository: createInMemoryWasteRecordsRepository([
      committedRecord('org-1', 'reg-1', 'row-1', 'log-1')
    ])(),
    overseasSitesRepository: sitesRepository([])
  }
}

// Excluded waste record state against an excluded legacy record: no divergence,
// no drift, full coverage — nothing reviewable.
const cleanReconciledEstate = () =>
  estateFrom([wasteRecordStateEntry('row-1', ROW_OUTCOME.EXCLUDED, 0)], 0)

// Included waste record state against an excluded legacy record: a
// classification divergence (the expected overseas-site / factor drift) on an
// otherwise clean partition.
const divergenceOnlyEstate = () =>
  estateFrom([wasteRecordStateEntry('row-1', ROW_OUTCOME.INCLUDED, 10)], 10)

// A committed head with no waste record state data: a backfill coverage gap.
const estateWithMissingWasteRecordStateData = () => ({
  organisationsRepository: approvedOrg(),
  streamRepository: streamWithHead(10),
  wasteRecordStatesRepository: createInMemoryRowStateRepository()(),
  wasteRecordsRepository: createInMemoryWasteRecordsRepository([
    committedRecord('org-1', 'reg-1', 'row-1', 'log-1')
  ])(),
  overseasSitesRepository: sitesRepository([])
})

const loggedInfoMessage = (substring) =>
  expect.objectContaining({ message: expect.stringContaining(substring) })

describe('runWasteRecordStateDiscrepancyReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('acquires a lock scoped to the report and releases it afterwards', async () => {
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(emptyEstate(), lock)

    await runWasteRecordStateDiscrepancyReport(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'waste-record-state-discrepancy-report'
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

    await runWasteRecordStateDiscrepancyReport(server)

    expect(organisationsRepository.findAll).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping waste record state discrepancy report'
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs only the census summary when every partition reconciles cleanly', async () => {
    const server = buildServer(await cleanReconciledEstate())

    await runWasteRecordStateDiscrepancyReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      loggedInfoMessage('Waste record state reconciliation census:')
    )
    expect(logger.info).not.toHaveBeenCalledWith(
      loggedInfoMessage('Waste record state discrepancy:')
    )
  })

  it('logs a discrepancy as an informational diagnostic, not an error alert', async () => {
    const server = buildServer(await estateWithMissingWasteRecordStateData())

    await runWasteRecordStateDiscrepancyReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      loggedInfoMessage('no waste record state data')
    )
    expect(logger.info).toHaveBeenCalledWith(
      loggedInfoMessage('Waste record state reconciliation census:')
    )
  })

  it('logs a classification divergence on an otherwise clean partition for human review', async () => {
    const server = buildServer(await divergenceOnlyEstate())

    await runWasteRecordStateDiscrepancyReport(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      loggedInfoMessage('classification divergences: received:row-1')
    )
  })

  it('releases the lock and logs an error when the run itself throws', async () => {
    const error = new Error('mongo unavailable')
    const lock = { free: vi.fn().mockResolvedValue(undefined) }
    const server = buildServer(
      {
        ...emptyEstate(),
        organisationsRepository: { findAll: vi.fn().mockRejectedValue(error) }
      },
      lock
    )

    await runWasteRecordStateDiscrepancyReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste record state discrepancy report'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    const server = {
      app: emptyEstate(),
      locker: { lock: vi.fn().mockRejectedValue(error) }
    }

    await runWasteRecordStateDiscrepancyReport(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run waste record state discrepancy report'
    })
  })
})
