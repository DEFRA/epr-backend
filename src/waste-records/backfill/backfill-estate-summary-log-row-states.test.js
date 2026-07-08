import { describe, it, expect } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import { backfillEstateSummaryLogRowStates } from './backfill-estate-summary-log-row-states.js'
import { createInMemorySummaryLogRowStatesBackfillWatermarkRepository } from './watermark/inmemory.js'

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

const inMemoryDeps = ({ organisations, wasteRecords }) => ({
  organisationsRepository:
    createInMemoryOrganisationsRepository(organisations)(),
  wasteRecordsRepository: createInMemoryWasteRecordsRepository(wasteRecords)(),
  summaryLogsRepository: createInMemorySummaryLogsRepository()(logger),
  overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
  summaryLogRowStateRepository: createInMemorySummaryLogRowStateRepository()(),
  summaryLogRowStatesBackfillWatermarkRepository:
    createInMemorySummaryLogRowStatesBackfillWatermarkRepository()()
})

describe('backfillEstateSummaryLogRowStates', () => {
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

    const summary = await backfillEstateSummaryLogRowStates(deps)

    expect(
      (
        await deps.summaryLogRowStateRepository.findBySummaryLogId(
          fileId('sl-1')
        )
      ).map((d) => d.rowId)
    ).toEqual(['row-1'])
    expect(
      (
        await deps.summaryLogRowStateRepository.findBySummaryLogId(
          fileId('sl-2')
        )
      ).map((d) => d.rowId)
    ).toEqual(['row-1'])
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-1')
    ).toEqual([])
    const [doc] = await deps.summaryLogRowStateRepository.findBySummaryLogId(
      fileId('sl-1')
    )
    expect(doc.accreditationId).toBe('acc-1')
    expect(summary).toEqual({
      organisationsScanned: 1,
      ledgersBackfilled: 1,
      ledgersSkippedComplete: 0,
      submissionsBackfilled: 2,
      summaryLogRowStateWrites: 2,
      orphanedAccreditations: []
    })
  })

  it('backfills a registered-only registration under a registered-only ledger', async () => {
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

    const summary = await backfillEstateSummaryLogRowStates(deps)

    const docs = await deps.summaryLogRowStateRepository.findBySummaryLogId(
      fileId('sl-1')
    )
    expect(docs.map((d) => d.rowId)).toEqual(['row-1'])
    expect(docs[0].accreditationId).toBeNull()
    expect(summary.ledgersBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
    expect(summary.orphanedAccreditations).toEqual([])
  })

  it('backfills a registered-only processing-type ledger rather than dropping it', async () => {
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

    const summary = await backfillEstateSummaryLogRowStates(deps)

    const docs = await deps.summaryLogRowStateRepository.findBySummaryLogId(
      fileId('sl-1')
    )
    expect(docs.map((d) => d.rowId)).toEqual(['row-1'])
    expect(docs[0].accreditationId).toBeNull()
    expect(summary.ledgersBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
  })

  it('replays only submitted logs and skips ledgers whose logs are all unsubmitted', async () => {
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

    const summary = await backfillEstateSummaryLogRowStates(deps)

    expect(
      (
        await deps.summaryLogRowStateRepository.findBySummaryLogId(
          fileId('sl-a')
        )
      ).map((d) => d.rowId)
    ).toEqual(['row-1'])
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId(
        fileId('sl-a-bad')
      )
    ).toEqual([])
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId(
        fileId('sl-b-bad')
      )
    ).toEqual([])
    expect(summary.ledgersBackfilled).toBe(1)
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

    const summary = await backfillEstateSummaryLogRowStates(deps)

    expect(summary.orphanedAccreditations).toEqual([
      {
        organisationId: organisation.id,
        registrationId: 'reg-1',
        accreditationId: 'acc-gone'
      }
    ])
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId(fileId('sl-1'))
    ).toEqual([])
    expect(summary.ledgersBackfilled).toBe(0)
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

    await expect(backfillEstateSummaryLogRowStates(deps)).rejects.toThrow(
      'transient database failure'
    )
  })

  it('skips every complete ledger on a second run and commits nothing', async () => {
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

    await backfillEstateSummaryLogRowStates(deps)
    const secondRun = await backfillEstateSummaryLogRowStates(deps)

    expect(secondRun).toEqual({
      organisationsScanned: 1,
      ledgersBackfilled: 0,
      ledgersSkippedComplete: 1,
      submissionsBackfilled: 0,
      summaryLogRowStateWrites: 0,
      orphanedAccreditations: []
    })
  })

  it('does not re-read waste records for a ledger already complete at the watermark', async () => {
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

    await backfillEstateSummaryLogRowStates(deps)

    let reReadCount = 0
    const findByRegistration =
      deps.wasteRecordsRepository.findByRegistration.bind(
        deps.wasteRecordsRepository
      )
    deps.wasteRecordsRepository.findByRegistration = (...args) => {
      reReadCount += 1
      return findByRegistration(...args)
    }

    await backfillEstateSummaryLogRowStates(deps)

    expect(reReadCount).toBe(0)
  })

  it('resumes a partially-backfilled ledger from its watermark', async () => {
    const registration = reprocessorRegistration({ id: 'reg-1' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-1', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } },
        { summaryLog: { id: fileId('sl-2') }, data: { tonnage: 20 } }
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
    await deps.summaryLogRowStatesBackfillWatermarkRepository.advance(
      organisation.id,
      'reg-1',
      { submittedAt: '2025-01-01T00:00:00.000Z', summaryLogId: fileId('sl-1') }
    )

    const summary = await backfillEstateSummaryLogRowStates(deps)

    expect(summary.ledgersBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId(fileId('sl-1'))
    ).toEqual([])
    expect(
      (
        await deps.summaryLogRowStateRepository.findBySummaryLogId(
          fileId('sl-2')
        )
      ).map((d) => d.rowId)
    ).toEqual(['row-1'])
  })

  it('resolves the ledger watermark by summary-log id when two submissions share a submittedAt', async () => {
    const registration = reprocessorRegistration({ id: 'reg-1' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const sharedSubmittedAt = '2025-01-01T00:00:00.000Z'
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-1', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } },
        { summaryLog: { id: fileId('sl-2') }, data: { tonnage: 20 } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-1',
      submittedAt: sharedSubmittedAt
    })
    await insertLog(deps.summaryLogsRepository, 'sl-2', {
      organisationId: organisation.id,
      registrationId: 'reg-1',
      submittedAt: sharedSubmittedAt
    })
    // The watermark sits at the id-lesser submission; the id-greater one (sl-2)
    // shares its submittedAt and is still outstanding, so the last submission
    // resolves by id tiebreak and the ledger must not be treated as complete.
    await deps.summaryLogRowStatesBackfillWatermarkRepository.advance(
      organisation.id,
      'reg-1',
      { submittedAt: sharedSubmittedAt, summaryLogId: fileId('sl-1') }
    )

    const summary = await backfillEstateSummaryLogRowStates(deps)

    expect(summary.ledgersSkippedComplete).toBe(0)
    expect(summary.ledgersBackfilled).toBe(1)
    expect(summary.submissionsBackfilled).toBe(1)
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId(fileId('sl-1'))
    ).toEqual([])
    expect(
      (
        await deps.summaryLogRowStateRepository.findBySummaryLogId(
          fileId('sl-2')
        )
      ).map((d) => d.rowId)
    ).toEqual(['row-1'])
  })
})
