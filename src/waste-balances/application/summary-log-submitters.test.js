import { describe, expect, it } from 'vitest'

import { BACKFILL_ACTOR } from '../repository/stream-schema.js'
import { buildSummaryLogSubmitters } from './summary-log-submitters.js'

const versionWithSummaryLog = (versionId, summaryLogId) => ({
  id: versionId,
  summaryLog: { id: summaryLogId, uri: `s3://bucket/${summaryLogId}` },
  data: {}
})

const wasteRecordWithVersions = (versions) => ({
  rowId: 'row-1',
  versions
})

const creditTransaction = (createdBy, currentVersionId) => ({
  id: `txn-${currentVersionId}`,
  type: 'credit',
  createdBy,
  entities: [
    {
      id: 'row-1',
      currentVersionId,
      previousVersionIds: [],
      type: 'waste-record-received'
    }
  ]
})

describe('buildSummaryLogSubmitters', () => {
  it('credits a summary log to the actor of the transaction that referenced its version', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [
      creditTransaction({ id: 'user-1', name: 'alice@example.com' }, 'v1')
    ]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.get('sl-1')).toEqual({
      id: 'user-1',
      name: 'alice@example.com'
    })
  })

  it('attributes each summary log to its own submitter across multiple submits', () => {
    const wasteRecords = [
      wasteRecordWithVersions([
        versionWithSummaryLog('v1', 'sl-1'),
        versionWithSummaryLog('v2', 'sl-2')
      ])
    ]
    const transactions = [
      creditTransaction({ id: 'user-1', name: 'alice@example.com' }, 'v1'),
      creditTransaction({ id: 'user-2', name: 'bob@example.com' }, 'v2')
    ]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.get('sl-1')).toEqual({
      id: 'user-1',
      name: 'alice@example.com'
    })
    expect(submitters.get('sl-2')).toEqual({
      id: 'user-2',
      name: 'bob@example.com'
    })
  })

  it('skips system-generated transactions that name no actor', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [creditTransaction(undefined, 'v1')]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.has('sl-1')).toBe(false)
  })

  it('rejects the system placeholder actor so it never masquerades as a real submitter', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [
      creditTransaction({ ...BACKFILL_ACTOR }, 'v1'),
      creditTransaction({ id: 'system', name: 'system' }, 'v1')
    ]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.has('sl-1')).toBe(false)
  })

  it('ignores entities whose version matches no waste record', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [
      creditTransaction({ id: 'user-1', name: 'alice@example.com' }, 'prn-v-9')
    ]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.size).toBe(0)
  })

  it('keeps the first actor when two transactions reference the same summary log', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')]),
      {
        rowId: 'row-2',
        versions: [versionWithSummaryLog('v2', 'sl-1')]
      }
    ]
    const transactions = [
      creditTransaction({ id: 'user-1', name: 'alice@example.com' }, 'v1'),
      creditTransaction({ id: 'user-2', name: 'bob@example.com' }, 'v2')
    ]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.get('sl-1')).toEqual({
      id: 'user-1',
      name: 'alice@example.com'
    })
  })

  it('returns an empty map when there are no transactions', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]

    const submitters = buildSummaryLogSubmitters({
      transactions: [],
      wasteRecords
    })

    expect(submitters.size).toBe(0)
  })

  it('tolerates a transaction that carries no entities', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [
      { createdBy: { id: 'user-1', name: 'alice@example.com' } }
    ]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.size).toBe(0)
  })

  it('tolerates a balance document with no transactions array', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]

    const submitters = buildSummaryLogSubmitters({
      transactions: undefined,
      wasteRecords
    })

    expect(submitters.size).toBe(0)
  })
})
