import { describe, it, expect } from 'vitest'

import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

import { backfillRegistrationRowStates } from './backfill-registration-rowstates.js'

const partition = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}
const nullPartition = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null
}
const accreditation = { id: 'acc-1' }
/** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} */
const overseasSites = ORS_VALIDATION_DISABLED

const submittedLog = (id, submittedAt) => ({
  id,
  status: SUMMARY_LOG_STATUS.SUBMITTED,
  submittedAt
})

const receivedRecord = (rowId, versions) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: versions.at(-1).data,
  versions
})

const rowHistory = (repository, rowId) =>
  repository.findRowHistory('org-1', 'reg-1', rowId, WASTE_RECORD_TYPE.RECEIVED)

describe('backfillRegistrationRowStates', () => {
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
    const rowStateRepository = createInMemoryRowStateRepository()()

    await backfillRegistrationRowStates({
      partition,
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites,
      rowStateRepository,
      streamRepository: createInMemoryStreamRepository()()
    })

    expect(
      (await rowStateRepository.findBySummaryLogId('sl-1')).map((d) => d.rowId)
    ).toEqual(['row-1'])
    expect(
      (await rowStateRepository.findBySummaryLogId('sl-2')).map((d) => d.rowId)
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
    const rowStateRepository = createInMemoryRowStateRepository()()

    await backfillRegistrationRowStates({
      partition,
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites,
      rowStateRepository,
      streamRepository: createInMemoryStreamRepository()()
    })

    const history = await rowHistory(rowStateRepository, 'row-1')
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
    const rowStateRepository = createInMemoryRowStateRepository()()

    await backfillRegistrationRowStates({
      partition,
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites,
      rowStateRepository,
      streamRepository: createInMemoryStreamRepository()()
    })

    const history = await rowHistory(rowStateRepository, 'row-1')
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
    const rowStateRepository = createInMemoryRowStateRepository()()
    const run = () =>
      backfillRegistrationRowStates({
        partition,
        wasteRecords,
        summaryLogs,
        accreditation,
        overseasSites,
        rowStateRepository,
        streamRepository: createInMemoryStreamRepository()()
      })

    await run()
    const afterFirst = await rowHistory(rowStateRepository, 'row-1')
    await run()
    const afterSecond = await rowHistory(rowStateRepository, 'row-1')

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
    const rowStateRepository = createInMemoryRowStateRepository()()

    const summary = await backfillRegistrationRowStates({
      partition,
      wasteRecords,
      summaryLogs,
      accreditation,
      overseasSites,
      rowStateRepository,
      streamRepository: createInMemoryStreamRepository()()
    })

    expect(summary).toEqual({
      submissionCount: 2,
      rowStateWriteCount: 3,
      headWriteCount: 0
    })
  })

  describe('registered-only committed heads', () => {
    it('emits a zero-delta committed head per submission into the null partition', async () => {
      const summaryLogs = [
        submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
        submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
      ]
      const wasteRecords = [
        receivedRecord('row-1', [
          { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
        ])
      ]
      const rowStateRepository = createInMemoryRowStateRepository()()
      const streamRepository = createInMemoryStreamRepository()()

      await backfillRegistrationRowStates({
        partition: nullPartition,
        wasteRecords,
        summaryLogs,
        accreditation: null,
        overseasSites,
        rowStateRepository,
        streamRepository
      })

      const heads = await streamRepository.findAllByPartition('reg-1', null)
      expect(heads.map((h) => h.kind)).toEqual([
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      ])
      expect(
        heads.map((h) => /** @type {any} */ (h.payload).summaryLogId)
      ).toEqual(['sl-1', 'sl-2'])
      expect(heads.every((h) => h.closingBalance.amount === 0)).toBe(true)
      expect(heads.every((h) => h.closingBalance.availableAmount === 0)).toBe(
        true
      )
    })

    it('is idempotent — a second run emits no duplicate head', async () => {
      const summaryLogs = [
        submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
        submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
      ]
      const wasteRecords = [
        receivedRecord('row-1', [
          { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
        ])
      ]
      const rowStateRepository = createInMemoryRowStateRepository()()
      const streamRepository = createInMemoryStreamRepository()()
      const run = () =>
        backfillRegistrationRowStates({
          partition: nullPartition,
          wasteRecords,
          summaryLogs,
          accreditation: null,
          overseasSites,
          rowStateRepository,
          streamRepository
        })

      await run()
      const summary = await run()

      const heads = await streamRepository.findAllByPartition('reg-1', null)
      expect(heads).toHaveLength(2)
      expect(summary.headWriteCount).toBe(0)
    })

    it('emits no committed head for an accredited (non-null) partition', async () => {
      const summaryLogs = [submittedLog('sl-1', '2025-01-01T00:00:00.000Z')]
      const wasteRecords = [
        receivedRecord('row-1', [
          { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
        ])
      ]
      const rowStateRepository = createInMemoryRowStateRepository()()
      const streamRepository = createInMemoryStreamRepository()()

      const summary = await backfillRegistrationRowStates({
        partition,
        wasteRecords,
        summaryLogs,
        accreditation,
        overseasSites,
        rowStateRepository,
        streamRepository
      })

      expect(await streamRepository.findAllByPartition('reg-1', 'acc-1')).toEqual(
        []
      )
      expect(summary.headWriteCount).toBe(0)
    })

    it('reports headWriteCount for migration logging', async () => {
      const summaryLogs = [
        submittedLog('sl-1', '2025-01-01T00:00:00.000Z'),
        submittedLog('sl-2', '2025-02-01T00:00:00.000Z')
      ]
      const wasteRecords = [
        receivedRecord('row-1', [
          { summaryLog: { id: 'sl-1' }, data: { supplierName: 'Acme' } }
        ])
      ]
      const rowStateRepository = createInMemoryRowStateRepository()()
      const streamRepository = createInMemoryStreamRepository()()

      const summary = await backfillRegistrationRowStates({
        partition: nullPartition,
        wasteRecords,
        summaryLogs,
        accreditation: null,
        overseasSites,
        rowStateRepository,
        streamRepository
      })

      expect(summary.headWriteCount).toBe(2)
    })
  })
})
