import { describe, it, expect } from 'vitest'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

import { backfillEstateRowStates } from './backfill-estate-rowstates.js'

const reprocessorRegistration = (overrides) =>
  buildRegistration({
    wasteProcessingType: 'reprocessor',
    overseasSites: {},
    ...overrides
  })

const insertLog = (
  summaryLogsRepository,
  id,
  {
    organisationId,
    registrationId,
    submittedAt,
    status = SUMMARY_LOG_STATUS.SUBMITTED
  }
) =>
  summaryLogsRepository.insert(id, {
    status,
    file: { id: `file-${id}`, name: `${id}.xlsx` },
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
  summaryLogsRepository: createInMemorySummaryLogsRepository()(undefined),
  overseasSitesRepository: createInMemoryOverseasSitesRepository()(),
  rowStateRepository: createInMemoryRowStateRepository()()
})

describe('backfillEstateRowStates', () => {
  it('backfills every submission of an accredited registration and reports the sweep', async () => {
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
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
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
      (await deps.rowStateRepository.findBySummaryLogId('sl-1')).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(
      (await deps.rowStateRepository.findBySummaryLogId('sl-2')).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    const [doc] = await deps.rowStateRepository.findBySummaryLogId('sl-1')
    expect(doc.accreditationId).toBe('acc-1')
    expect(summary).toEqual({
      organisationsScanned: 1,
      streamsBackfilled: 1,
      submissionsBackfilled: 2,
      rowStateWrites: 2,
      orphanedAccreditations: []
    })
  })

  it('does not backfill a registered-only registration with no accreditation', async () => {
    const registration = reprocessorRegistration({ id: 'reg-ro' })
    delete registration.accreditationId
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    const wasteRecords = [
      receivedRecord(organisation.id, 'reg-ro', 'row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = inMemoryDeps({ organisations: [organisation], wasteRecords })
    await insertLog(deps.summaryLogsRepository, 'sl-1', {
      organisationId: organisation.id,
      registrationId: 'reg-ro',
      submittedAt: '2025-01-01T00:00:00.000Z'
    })

    const summary = await backfillEstateRowStates(deps)

    expect(await deps.rowStateRepository.findBySummaryLogId('sl-1')).toEqual([])
    expect(summary.streamsBackfilled).toBe(0)
    expect(summary.submissionsBackfilled).toBe(0)
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
        { summaryLog: { id: 'sl-a' }, data: { supplierName: 'Acme' } }
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
      (await deps.rowStateRepository.findBySummaryLogId('sl-a')).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(
      await deps.rowStateRepository.findBySummaryLogId('sl-a-bad')
    ).toEqual([])
    expect(
      await deps.rowStateRepository.findBySummaryLogId('sl-b-bad')
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
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
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
    expect(await deps.rowStateRepository.findBySummaryLogId('sl-1')).toEqual([])
    expect(summary.streamsBackfilled).toBe(0)
  })
})
