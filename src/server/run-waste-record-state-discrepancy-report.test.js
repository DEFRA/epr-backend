import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildOrganisationWithRegistration,
  buildReadOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import {
  runWasteRecordStateDiscrepancyReport,
  summaryLogRowStateSource
} from './run-waste-record-state-discrepancy-report.js'

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
  buildSummaryLogRowStateEntry({
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

const ledgerWithHead = (creditTotal) =>
  createInMemoryLedgerRepository([
    buildLedgerEvent({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      payload: { summaryLogId: 'log-1', creditTotal }
    })
  ])()

const buildServer = (
  app,
  {
    lock = { free: vi.fn().mockResolvedValue(undefined) },
    backfillEnabled = true
  } = {}
) => ({
  app,
  featureFlags: {
    isSummaryLogRowStatesBackfillEnabled: () => backfillEnabled
  },
  locker: { lock: vi.fn().mockResolvedValue(lock) }
})

// A persisted mongo row-state repository the dry-run must never touch — the
// write-gate invariant is that nothing reads or writes the collection while the
// backfill flag is off.
const untouchedPersistedRepository = () => ({
  upsertSummaryLogRowStates: vi.fn(),
  findBySummaryLogId: vi.fn(),
  findRowHistory: vi.fn()
})

// The summary-log document id and the workbook file.id are distinct values;
// membership and version tags key on file.id, so fixtures keep them different.
const fileTag = (documentId) => `file-${documentId}`

const reprocessorRegistration = (overrides) =>
  buildRegistration({
    wasteProcessingType: 'reprocessor',
    overseasSites: {},
    ...overrides
  })

const submittedLog = (summaryLogsRepository, documentId, organisationId) =>
  summaryLogsRepository.insert(documentId, {
    status: SUMMARY_LOG_STATUS.SUBMITTED,
    file: { id: fileTag(documentId), name: `${documentId}.xlsx` },
    organisationId,
    registrationId: 'reg-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    expiresAt: null,
    submittedAt: '2025-01-01T00:00:00.000Z'
  })

const receivedRecord = (organisationId, rowId, versionFileTag) => ({
  organisationId,
  registrationId: 'reg-1',
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { supplierName: 'Acme' },
  versions: [
    { summaryLog: { id: versionFileTag }, data: { supplierName: 'Acme' } }
  ]
})

const approvedReprocessor = () =>
  buildOrganisationWithRegistration(
    reprocessorRegistration({ id: 'reg-1', accreditationId: 'acc-1' }),
    'approved'
  )

const committedHead = (creditTotal) =>
  createInMemoryLedgerRepository([
    buildLedgerEvent({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      payload: { summaryLogId: fileTag('sl-1'), creditTotal }
    })
  ])()

// A dry-run estate the reconstruction sweep can rebuild from: a submitted
// summary log plus the waste record it tagged. Flag off, the runner must
// reconstruct these into the in-memory adapter and reconcile that.
const reconstructableEstate = async () => {
  const organisation = approvedReprocessor()
  const summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  await submittedLog(summaryLogsRepository, 'sl-1', organisation.id)

  return {
    organisationsRepository: createInMemoryOrganisationsRepository([
      organisation
    ])(),
    ledgerRepository: committedHead(0),
    summaryLogsRepository,
    wasteRecordsRepository: createInMemoryWasteRecordsRepository([
      receivedRecord(organisation.id, 'row-1', fileTag('sl-1'))
    ])(),
    overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
    summaryLogRowStatesRepository: untouchedPersistedRepository()
  }
}

// A committed head with no submitted summary log to reconstruct from: the dry
// run rebuilds nothing, so the ledger surfaces as a coverage gap for review.
const headWithoutReconstructableSubmission = () => {
  const organisation = approvedReprocessor()
  return {
    organisationsRepository: createInMemoryOrganisationsRepository([
      organisation
    ])(),
    ledgerRepository: committedHead(0),
    summaryLogsRepository: createInMemorySummaryLogsRepository()(logger),
    wasteRecordsRepository: createInMemoryWasteRecordsRepository()(),
    overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
    summaryLogRowStatesRepository: untouchedPersistedRepository()
  }
}

const emptyEstate = () => ({
  organisationsRepository: orgsRepository([]),
  ledgerRepository: createInMemoryLedgerRepository()(),
  summaryLogRowStatesRepository: createInMemorySummaryLogRowStateRepository()(),
  wasteRecordsRepository: createInMemoryWasteRecordsRepository()(),
  overseasSitesRepository: sitesRepository([])
})

const estateFrom = async (wasteRecordStateEntries, creditTotal) => {
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStateRepository()()
  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
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
    ledgerRepository: ledgerWithHead(creditTotal),
    summaryLogRowStatesRepository,
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
// otherwise clean ledger.
const divergenceOnlyEstate = () =>
  estateFrom([wasteRecordStateEntry('row-1', ROW_OUTCOME.INCLUDED, 10)], 10)

// A committed head with no waste record state data: a backfill coverage gap.
const estateWithMissingWasteRecordStateData = () => ({
  organisationsRepository: approvedOrg(),
  ledgerRepository: ledgerWithHead(10),
  summaryLogRowStatesRepository: createInMemorySummaryLogRowStateRepository()(),
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
    const server = buildServer(emptyEstate(), { lock })

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

  it('logs only the census summary when every ledger reconciles cleanly', async () => {
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

  it('logs a classification divergence on an otherwise clean ledger for human review', async () => {
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
      { lock }
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

  describe('when the backfill flag is off (in-memory dry run)', () => {
    it('reconstructs the estate in-memory and reconciles it, covering the committed head', async () => {
      const app = await reconstructableEstate()
      const server = buildServer(app, { backfillEnabled: false })

      await runWasteRecordStateDiscrepancyReport(server)

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        loggedInfoMessage('covered: 1, missing waste record state data: 0')
      )
    })

    it('never reads or writes the persisted collection', async () => {
      const app = await reconstructableEstate()
      const server = buildServer(app, { backfillEnabled: false })

      await runWasteRecordStateDiscrepancyReport(server)

      expect(
        app.summaryLogRowStatesRepository.findBySummaryLogId
      ).not.toHaveBeenCalled()
      expect(
        app.summaryLogRowStatesRepository.upsertSummaryLogRowStates
      ).not.toHaveBeenCalled()
    })

    it('surfaces a coverage gap at info when the reconstruction rebuilds nothing for a committed head', async () => {
      const app = headWithoutReconstructableSubmission()
      const server = buildServer(app, { backfillEnabled: false })

      await runWasteRecordStateDiscrepancyReport(server)

      expect(logger.error).not.toHaveBeenCalled()
      expect(
        app.summaryLogRowStatesRepository.findBySummaryLogId
      ).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        loggedInfoMessage('no waste record state data')
      )
    })
  })
})

// A submitted summary log for an arbitrary registration — the parameterised
// form the two-registration dry-run estate needs (the single-reg helpers pin
// reg-1).
const submittedLogFor = (
  summaryLogsRepository,
  documentId,
  organisationId,
  registrationId
) =>
  summaryLogsRepository.insert(documentId, {
    status: SUMMARY_LOG_STATUS.SUBMITTED,
    file: { id: fileTag(documentId), name: `${documentId}.xlsx` },
    organisationId,
    registrationId,
    createdAt: '2025-01-01T00:00:00.000Z',
    expiresAt: null,
    submittedAt: '2025-01-01T00:00:00.000Z'
  })

const receivedRecordFor = (
  organisationId,
  registrationId,
  rowId,
  versionTag
) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { supplierName: 'Acme' },
  versions: [{ summaryLog: { id: versionTag }, data: { supplierName: 'Acme' } }]
})

const approvedReprocessorAccreditation = (id) =>
  buildAccreditation({
    id,
    wasteProcessingType: 'reprocessor',
    statusHistory: [
      { status: 'created', updatedAt: new Date('2024-01-01') },
      { status: 'approved', updatedAt: new Date('2024-02-01') }
    ]
  })

// Two reconstructable registrations under one organisation, each with its own
// submitted summary log + tagged waste record. Exposes each registration so a
// caller can drive the per-ledger source for one ledger at a time.
const twoRegistrationReconstructableEstate = async () => {
  const registrationA = reprocessorRegistration({
    id: 'reg-a',
    accreditationId: 'acc-a'
  })
  const registrationB = reprocessorRegistration({
    id: 'reg-b',
    accreditationId: 'acc-b'
  })
  const organisation = buildReadOrganisation({
    registrations: [registrationA, registrationB],
    accreditations: [
      approvedReprocessorAccreditation('acc-a'),
      approvedReprocessorAccreditation('acc-b')
    ]
  })

  const summaryLogsRepository = createInMemorySummaryLogsRepository()(logger)
  await submittedLogFor(summaryLogsRepository, 'sl-a', organisation.id, 'reg-a')
  await submittedLogFor(summaryLogsRepository, 'sl-b', organisation.id, 'reg-b')

  return {
    organisation,
    registrationA,
    registrationB,
    organisationsRepository: createInMemoryOrganisationsRepository([
      organisation
    ])(),
    ledgerRepository: createInMemoryLedgerRepository()(),
    summaryLogsRepository,
    wasteRecordsRepository: createInMemoryWasteRecordsRepository([
      receivedRecordFor(organisation.id, 'reg-a', 'row-a', fileTag('sl-a')),
      receivedRecordFor(organisation.id, 'reg-b', 'row-b', fileTag('sl-b'))
    ])(),
    overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
    summaryLogRowStatesRepository: untouchedPersistedRepository()
  }
}

describe('summaryLogRowStateSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('flag on: returns the same persisted repository for every ledger', async () => {
    const persisted = untouchedPersistedRepository()
    const server = buildServer(
      { summaryLogRowStatesRepository: persisted },
      { backfillEnabled: true }
    )

    const source = summaryLogRowStateSource(server)
    const first = await source(
      /** @type {*} */ ({
        organisation: { id: 'org-1' },
        registration: { id: 'reg-a' }
      })
    )
    const second = await source(
      /** @type {*} */ ({
        organisation: { id: 'org-1' },
        registration: { id: 'reg-b' }
      })
    )

    expect(first).toBe(persisted)
    expect(second).toBe(persisted)
  })

  it('flag off: reconstructs a fresh store per registration, scoped to that ledger, without touching the persisted collection', async () => {
    const app = await twoRegistrationReconstructableEstate()
    const server = buildServer(app, { backfillEnabled: false })

    const source = summaryLogRowStateSource(server)
    const storeA = await source(
      /** @type {*} */ ({
        organisation: app.organisation,
        registration: app.registrationA
      })
    )
    const storeB = await source(
      /** @type {*} */ ({
        organisation: app.organisation,
        registration: app.registrationB
      })
    )

    // Distinct store instances — the dry run never accumulates one global store
    // across ledgers.
    expect(storeA).not.toBe(storeB)

    // Each store holds only its own registration's reconstructed submission:
    // reg-b's store contains none of reg-a's rows, and vice versa.
    expect(await storeA.findBySummaryLogId(fileTag('sl-a'))).not.toHaveLength(0)
    expect(await storeA.findBySummaryLogId(fileTag('sl-b'))).toHaveLength(0)
    expect(await storeB.findBySummaryLogId(fileTag('sl-b'))).not.toHaveLength(0)
    expect(await storeB.findBySummaryLogId(fileTag('sl-a'))).toHaveLength(0)

    expect(
      app.summaryLogRowStatesRepository.upsertSummaryLogRowStates
    ).not.toHaveBeenCalled()
    expect(
      app.summaryLogRowStatesRepository.findBySummaryLogId
    ).not.toHaveBeenCalled()
  })
})
