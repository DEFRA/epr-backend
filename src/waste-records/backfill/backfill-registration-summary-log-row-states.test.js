import { describe, it, expect } from 'vitest'

import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'

import { backfillRegistrationSummaryLogRowStates } from './backfill-registration-summary-log-row-states.js'
import { createInMemorySummaryLogRowStatesBackfillWatermarkRepository } from './watermark/inmemory.js'

const ledgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}
const accreditation = { id: 'acc-1' }
/** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} */
const overseasSites = ORS_VALIDATION_DISABLED

const submittedLog = (id, submittedAt) => ({
  id,
  status: SUMMARY_LOG_STATUS.SUBMITTED,
  submittedAt
})

const receivedRecord = (rowId, versions) => {
  const stamped = versions.map((version) => ({
    ...version,
    data: { processingType: 'REPROCESSOR_INPUT', ...version.data }
  }))
  return {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId,
    type: WASTE_RECORD_TYPE.RECEIVED,
    data: stamped.at(-1).data,
    versions: stamped
  }
}

const rowHistory = (repository, rowId) =>
  repository.findRowHistory('org-1', 'reg-1', rowId, WASTE_RECORD_TYPE.RECEIVED)

const buildDeps = () => ({
  summaryLogRowStateRepository: createInMemorySummaryLogRowStateRepository()(),
  summaryLogRowStatesBackfillWatermarkRepository:
    createInMemorySummaryLogRowStatesBackfillWatermarkRepository()()
})

/**
 * @param {Object} params
 * @param {import('./reconstruct-submission-summary-log-row-states.js').OrderedSummaryLog[]} params.summaryLogs
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {ReturnType<typeof buildDeps>} params.deps
 * @param {import('./watermark/port.js').BackfillWatermark | null} [params.watermark]
 */
const backfill = ({ summaryLogs, wasteRecords, watermark = null, deps }) =>
  backfillRegistrationSummaryLogRowStates({
    ledgerId,
    wasteRecords,
    summaryLogs,
    accreditation,
    overseasSites,
    watermark,
    ...deps
  })

describe('backfillRegistrationSummaryLogRowStates', () => {
  it('commits each submission membership so it is queryable by summaryLogId', async () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = buildDeps()

    await backfill({ summaryLogs, wasteRecords, deps })

    expect(
      (await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-1')).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(
      (await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-2')).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
  })

  it('dedups an unchanged row to one document carrying both submissions in stream order', async () => {
    const summaryLogs = [
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z'),
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = buildDeps()

    await backfill({ summaryLogs, wasteRecords, deps })

    const history = await rowHistory(deps.summaryLogRowStateRepository, 'row-1')
    expect(history).toHaveLength(1)
    expect(history[0].summaryLogIds).toEqual(['sl-1', 'sl-2'])
  })

  it('writes a new document when a row changes content between submissions', async () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        {
          summaryLog: { id: 'sl-1' },
          data: { supplierName: 'Acme', tonnage: 10 }
        },
        { summaryLog: { id: 'sl-2' }, data: { tonnage: 20 } }
      ])
    ]
    const deps = buildDeps()

    await backfill({ summaryLogs, wasteRecords, deps })

    const history = await rowHistory(deps.summaryLogRowStateRepository, 'row-1')
    expect(history).toHaveLength(2)
    expect(history.map((d) => d.summaryLogIds)).toEqual([['sl-1'], ['sl-2']])
  })

  it('is idempotent — a second run adds no document and no membership', async () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = buildDeps()

    await backfill({ summaryLogs, wasteRecords, deps })
    const afterFirst = await rowHistory(
      deps.summaryLogRowStateRepository,
      'row-1'
    )
    await backfill({ summaryLogs, wasteRecords, deps })
    const afterSecond = await rowHistory(
      deps.summaryLogRowStateRepository,
      'row-1'
    )

    expect(afterSecond).toEqual(afterFirst)
  })

  it('reports how much it committed for migration logging', async () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ]),
      receivedRecord('row-2', [
        { summaryLog: { id: 'sl-2' }, data: { supplierName: 'Beta' } }
      ])
    ]
    const deps = buildDeps()

    const summary = await backfill({ summaryLogs, wasteRecords, deps })

    expect(summary).toEqual({
      submissionsCommitted: 2,
      summaryLogRowStateWriteCount: 3
    })
  })

  it('advances the watermark to the last committed submission', async () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = buildDeps()

    await backfill({ summaryLogs, wasteRecords, deps })

    expect(
      await deps.summaryLogRowStatesBackfillWatermarkRepository.read(
        'org-1',
        'reg-1'
      )
    ).toEqual({ submittedAt: '2025-02-01T00:00:00.000Z', summaryLogId: 'sl-2' })
  })

  it('resumes from the watermark, committing only submissions after it', async () => {
    const summaryLogs = [
      submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
      submittedLog('sl-2', '2025-02-01T00:00:00.000Z'),
      submittedLog('sl-3', '2025-03-01T00:00:00.000Z')
    ]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } },
        { summaryLog: { id: 'sl-2' }, data: { tonnage: 20 } },
        { summaryLog: { id: 'sl-3' }, data: { tonnage: 30 } }
      ])
    ]
    const deps = buildDeps()

    const summary = await backfill({
      summaryLogs,
      wasteRecords,
      watermark: {
        submittedAt: '2025-02-01T00:00:00.000Z',
        summaryLogId: 'sl-2'
      },
      deps
    })

    expect(summary.submissionsCommitted).toBe(1)
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-1')
    ).toEqual([])
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-2')
    ).toEqual([])
    expect(
      (await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-3')).map(
        (d) => d.rowId
      )
    ).toEqual(['row-1'])
    expect(
      await deps.summaryLogRowStatesBackfillWatermarkRepository.read(
        'org-1',
        'reg-1'
      )
    ).toEqual({ submittedAt: '2025-03-01T00:00:00.000Z', summaryLogId: 'sl-3' })
  })

  it('commits nothing and leaves the watermark when every submission is already covered', async () => {
    const summaryLogs = [submittedLog('sl-1', '2025-01-01T00:00:00.000Z')]
    const wasteRecords = [
      receivedRecord('row-1', [
        { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
      ])
    ]
    const deps = buildDeps()

    const summary = await backfill({
      summaryLogs,
      wasteRecords,
      watermark: {
        submittedAt: '2025-01-01T00:00:00.000Z',
        summaryLogId: 'sl-1'
      },
      deps
    })

    expect(summary).toEqual({
      submissionsCommitted: 0,
      summaryLogRowStateWriteCount: 0
    })
    expect(
      await deps.summaryLogRowStateRepository.findBySummaryLogId('sl-1')
    ).toEqual([])
  })
})
