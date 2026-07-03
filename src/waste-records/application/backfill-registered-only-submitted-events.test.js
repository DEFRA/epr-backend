import { describe, it, expect } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
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
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import { backfillRegisteredOnlySubmittedEvents } from './backfill-registered-only-submitted-events.js'

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

const registeredOnlyRegistration = (id) => {
  const registration = reprocessorRegistration({ id })
  delete registration.accreditationId
  return registration
}

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

describe('backfillRegisteredOnlySubmittedEvents', () => {
  it('emits a zero-delta submitted event per submission of a registered-only registration', async () => {
    const organisation = buildOrganisation({
      registrations: [registeredOnlyRegistration('reg-ro')],
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

    const summary = await backfillRegisteredOnlySubmittedEvents(deps)

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
    expect(summary.organisationsScanned).toBe(1)
    expect(summary.registrationsScanned).toBe(1)
    expect(summary.submissionsScanned).toBe(2)
    expect(summary.submittedEventWrites).toBe(2)
  })

  it('dates each event its original submittedAt and attributes it to the recovered submitter, falling back to the backfill actor', async () => {
    const organisation = buildOrganisation({
      registrations: [registeredOnlyRegistration('reg-ro')],
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

    await backfillRegisteredOnlySubmittedEvents(deps)

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

  it('reports the per-registration plan with recovered provenance and head-anchored membership', async () => {
    const organisation = buildOrganisation({
      registrations: [registeredOnlyRegistration('reg-ro')],
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
    await insertSubmitAudit(deps.systemLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      userId: 'user-1',
      email: 'ada@example.com'
    })

    const summary = await backfillRegisteredOnlySubmittedEvents(deps)

    expect(summary.registeredOnlyPlan).toEqual([
      {
        organisationId: organisation.id,
        registrationId: 'reg-ro',
        plannedEvents: [
          {
            summaryLogId: fileId('sl-1'),
            submittedAt: '2025-01-01T00:00:00.000Z',
            submittedBy: { id: 'user-1', email: 'ada@example.com' },
            membershipRowIds: ['row-1']
          }
        ]
      }
    ])
  })

  it('in dry-run writes no events but still reports the plan it would write', async () => {
    const organisation = buildOrganisation({
      registrations: [registeredOnlyRegistration('reg-ro')],
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

    const summary = await backfillRegisteredOnlySubmittedEvents({
      ...deps,
      writeSubmittedEvents: false
    })

    expect(
      await deps.streamRepository.findAllByPartition('reg-ro', null)
    ).toEqual([])
    expect(summary.submittedEventWrites).toBe(1)
    expect(summary.registeredOnlyPlan).toEqual([
      {
        organisationId: organisation.id,
        registrationId: 'reg-ro',
        plannedEvents: [
          {
            summaryLogId: fileId('sl-1'),
            submittedAt: '2025-01-01T00:00:00.000Z',
            membershipRowIds: ['row-1']
          }
        ]
      }
    ])
  })

  it('skips accredited registrations entirely', async () => {
    const registration = reprocessorRegistration({
      id: 'reg-acc',
      accreditationId: 'acc-1'
    })
    const organisation = buildOrganisationWithRegistration(
      registration,
      'approved'
    )
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-acc', 'row-1', [
        { summaryLog: { id: fileId('sl-1') }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-acc',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })

    const summary = await backfillRegisteredOnlySubmittedEvents(deps)

    expect(
      await deps.streamRepository.findAllByPartition('reg-acc', 'acc-1')
    ).toEqual([])
    expect(summary.registrationsScanned).toBe(0)
    expect(summary.submittedEventWrites).toBe(0)
    expect(summary.registeredOnlyPlan).toEqual([])
  })

  it('re-running emits no further events once each submission already has one', async () => {
    const organisation = buildOrganisation({
      registrations: [registeredOnlyRegistration('reg-ro')],
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

    await backfillRegisteredOnlySubmittedEvents(deps)
    const summary = await backfillRegisteredOnlySubmittedEvents(deps)

    expect(
      await deps.streamRepository.findAllByPartition('reg-ro', null)
    ).toHaveLength(1)
    expect(summary.submittedEventWrites).toBe(0)
    expect(summary.registeredOnlyPlan).toEqual([])
  })

  it('replays only submitted logs and skips registrations with none', async () => {
    const organisation = buildOrganisation({
      registrations: [
        registeredOnlyRegistration('reg-ro'),
        registeredOnlyRegistration('reg-empty')
      ],
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
    await insertLog(deps.summaryLogsRepository, 'sl-bad', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-01-02T00:00:00.000Z',
      status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
    })
    await insertLog(deps.summaryLogsRepository, 'sl-empty', {
      organisationId: organisation.id,
      registrationId: 'reg-empty',
      submittedAt: '2025-01-03T00:00:00.000Z',
      status: SUMMARY_LOG_STATUS.SUBMISSION_FAILED
    })

    const summary = await backfillRegisteredOnlySubmittedEvents(deps)

    expect(
      (await deps.streamRepository.findAllByPartition('reg-ro', null)).map(
        (event) => /** @type {any} */ (event.payload).summaryLogId
      )
    ).toEqual([fileId('sl-1')])
    expect(summary.registrationsScanned).toBe(1)
    expect(summary.submissionsScanned).toBe(1)
    expect(summary.submittedEventWrites).toBe(1)
  })
})
