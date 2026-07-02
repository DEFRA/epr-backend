import { describe, it, expect } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { buildSystemLog } from '#repositories/system-logs/contract/test-data.js'
import {
  SUMMARY_LOG_SUB_CATEGORY,
  SUMMARY_LOG_SUBMIT_ACTION
} from '#root/auditing/summary-logs.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import { backfillEstateRowStates } from './backfill-estate-rowstates.js'

// The summary-log document id and the workbook's file.id are distinct values
// (the doc id is a URL path param; file.id is the uploader's id). Membership and
// version tags key on file.id, so fixtures keep them deliberately different.
const fileId = (documentId) => `file-${documentId}`

const reprocessorRegistration = (overrides) =>
  buildRegistration({
    wasteProcessingType: 'reprocessor',
    overseasSites: {},
    ...overrides
  })

const insertLog = (
  summaryLogsRepository,
  documentId,
  /** @type {{ organisationId: string, registrationId: string, submittedAt: string, status?: import('#domain/summary-logs/status.js').SummaryLogStatus }} */
  {
    organisationId,
    registrationId,
    submittedAt,
    status = SUMMARY_LOG_STATUS.SUBMITTED
  }
) =>
  summaryLogsRepository.insert(documentId, {
    status,
    file: { id: fileId(documentId), name: `${documentId}.xlsx` },
    organisationId,
    registrationId,
    createdAt: submittedAt,
    expiresAt: null,
    submittedAt
  })

const receivedRecord = (organisationId, registrationId, rowId, versions) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: versions.at(-1).data,
  versions
})

const inMemoryDeps = ({ organisations, wasteRecords }) => {
  const streamRepository = createInMemoryStreamRepository()()
  return {
    organisationsRepository:
      createInMemoryOrganisationsRepository(organisations)(),
    wasteRecordsRepository:
      createInMemoryWasteRecordsRepository(wasteRecords)(),
    summaryLogsRepository: createInMemorySummaryLogsRepository()(logger),
    overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
    rowStateRepository: createInMemoryRowStateRepository()(),
    systemLogsRepository: createSystemLogsRepository()(logger),
    streamRepository,
    wasteBalanceService: createWasteBalanceService(streamRepository)
  }
}

const insertSubmitAudit = (
  systemLogsRepository,
  documentId,
  { organisationId, userId, email }
) =>
  systemLogsRepository.insert(
    buildSystemLog({
      organisationId,
      userId,
      email,
      subCategory: SUMMARY_LOG_SUB_CATEGORY,
      action: SUMMARY_LOG_SUBMIT_ACTION,
      summaryLogId: documentId
    })
  )

describe('backfillEstateRowStates', () => {
  it('backfills every submission of an accredited registration, keyed by file id, and reports the sweep', async () => {
    const registration = reprocessorRegistration({
      id: 'reg-1',
      accreditationId: 'acc-1'
    })
    const organisation = buildOrganisationWithRegistration(
      registration,
      'approved'
    )
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-1', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-1',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })
    await insertLog(deps.summaryLogsRepository, 'sl-2', {
      organisationId: organisation.id,
      registrationId: 'reg-1',
      submittedAt: '2025-02-01T00:00:00.000Z'
    })

    const summary = await backfillEstateRowStates(deps)

    expect(
      (await deps.rowStateRepository.findBySummaryLogId(fileId('sl-1'))).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(
      (await deps.rowStateRepository.findBySummaryLogId(fileId('sl-2'))).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(await deps.rowStateRepository.findBySummaryLogId('sl-1')).toEqual([])
    const [doc] = await deps.rowStateRepository.findBySummaryLogId(
      fileId('sl-1')
    )
    expect(doc.accreditationId).toBe('acc-1')
    expect(summary).toEqual({
      organisationsScanned: 1,
      streamsBackfilled: 1,
      submissionsBackfilled: 2,
      rowStateWrites: 2,
      submittedEventWrites: 0,
      orphanedAccreditations: []
    })
    expect(
      await deps.streamRepository.findAllByPartition('reg-1', 'acc-1')
    ).toEqual([])
  })

  it('emits zero-delta summary-log submitted events for a registered-only registration so its latest state reads through', async () => {
    const registration = reprocessorRegistration({ id: 'reg-ro' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-ro', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })
    await insertLog(deps.summaryLogsRepository, 'sl-2', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-02-01T00:00:00.000Z'
    })

    const summary = await backfillEstateRowStates(deps)

    const submittedEvents = await deps.streamRepository.findAllByPartition(
      'reg-ro',
      null
    )
    expect(submittedEvents.map((event) => event.kind)).toEqual([
      STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
    ])
    expect(
      submittedEvents.map(
        (event) => /** @type {any} */ (event.payload).summaryLogId
      )
    ).toEqual([fileId('sl-1'), fileId('sl-2')])
    expect(
      submittedEvents.every((event) => event.closingBalance.amount === 0)
    ).toBe(true)
    expect(summary.submittedEventWrites).toBe(2)
  })

  it('backfills a registered-only registration under a null-accreditation partition', async () => {
    const registration = reprocessorRegistration({ id: 'reg-ro' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-ro', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })

    const summary = await backfillEstateRowStates(deps)

    const docs = await deps.rowStateRepository.findBySummaryLogId(
      fileId('sl-1')
    )
    expect(docs.map((d) => d.rowId)).toEqual(['row-1'])
    expect(docs[0].accreditationId).toBeNull()
    expect(summary.streamsBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
    expect(summary.orphanedAccreditations).toEqual([])
  })

  it('dates each reg-only backfilled event its original submittedAt and attributes it to the recovered submitter', async () => {
    const registration = reprocessorRegistration({ id: 'reg-ro' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-ro', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })
    await insertLog(deps.summaryLogsRepository, 'sl-2', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-02-01T00:00:00.000Z'
    })
    await insertSubmitAudit(deps.systemLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      userId: 'user-1',
      email: 'ada@example.com'
    })

    await backfillEstateRowStates(deps)

    const submittedEvents = await deps.streamRepository.findAllByPartition(
      'reg-ro',
      null
    )
    expect(
      submittedEvents.map((event) => event.createdAt.toISOString())
    ).toEqual(['2025-01-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z'])
    expect(submittedEvents.map((event) => event.createdBy)).toEqual([
      { id: 'user-1', email: 'ada@example.com' },
      { id: 'system', name: 'backfill' }
    ])
  })

  it('backfills a registered-only processing-type stream rather than dropping it', async () => {
    const registration = reprocessorRegistration({ id: 'reg-ro-pt' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-ro-pt', 'row-1', [
        {
          summaryLog: { id: fileId('sl-1') },
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
            supplierName: 'Acme'
          }
        }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-ro-pt',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })

    const summary = await backfillEstateRowStates(deps)

    const docs = await deps.rowStateRepository.findBySummaryLogId(
      fileId('sl-1')
    )
    expect(docs.map((d) => d.rowId)).toEqual(['row-1'])
    expect(docs[0].accreditationId).toBeNull()
    expect(summary.streamsBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
  })

  it('replays only submitted logs and skips streams whose logs are all unsubmitted', async () => {
    const regA = reprocessorRegistration({
      id: 'reg-a',
      accreditationId: 'acc-a'
    })
    const regB = reprocessorRegistration({
      id: 'reg-b',
      accreditationId: 'acc-b'
    })
    const organisation = buildOrganisation({
      registrations: [regA, regB],
      accreditations: [
        buildAccreditation({ id: 'acc-a', wasteProcessingType: 'reprocessor' }),
        buildAccreditation({ id: 'acc-b', wasteProcessingType: 'reprocessor' })
      ]
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-a', 'row-1', [
        { summaryLog: { id: fileId('sl-a') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-a', {
      organisationId: organisation.id,
      registrationId: 'reg-a',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })
    await insertLog(deps.summaryLogsRepository, 'sl-a-bad', {
      organisationId: organisation.id,
      registrationId: 'reg-a',
      submittedAt: '2025-01-02T00:00:00.000Z',
      status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
    })
    await insertLog(deps.summaryLogsRepository, 'sl-b-bad', {
      organisationId: organisation.id,
      registrationId: 'reg-b',
      submittedAt: '2025-01-03T00:00:00.000Z',
      status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
    })

    const summary = await backfillEstateRowStates(deps)

    expect(
      (await deps.rowStateRepository.findBySummaryLogId(fileId('sl-a'))).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(
      await deps.rowStateRepository.findBySummaryLogId(fileId('sl-a-bad'))
    ).toEqual([])
    expect(
      await deps.rowStateRepository.findBySummaryLogId(fileId('sl-b-bad'))
    ).toEqual([])
    expect(summary.streamsBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
  })

  it('surfaces an orphaned accreditation reference without crashing', async () => {
    const registration = reprocessorRegistration({
      id: 'reg-1',
      accreditationId: 'acc-gone'
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-1', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-1',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })

    const summary = await backfillEstateRowStates(deps)

    expect(summary.orphanedAccreditations).toEqual([
      {
        organisationId: organisation.id,
        registrationId: 'reg-1',
        accreditationId: 'acc-gone'
      }
    ])
    expect(
      await deps.rowStateRepository.findBySummaryLogId(fileId('sl-1'))
    ).toEqual([])
    expect(summary.streamsBackfilled).toBe(0)
  })

  it('propagates an unexpected accreditation-lookup error rather than recording it as orphaned', async () => {
    const registration = reprocessorRegistration({
      id: 'reg-1',
      accreditationId: 'acc-1'
    })
    const organisation = buildOrganisationWithRegistration(
      registration,
      'approved'
    )
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-1', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-1',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })
    deps.organisationsRepository.findAccreditationById = () =>
      Promise.reject(new Error('transient database failure'))

    await expect(backfillEstateRowStates(deps)).rejects.toThrow(
      'transient database failure'
    )
  })
})
