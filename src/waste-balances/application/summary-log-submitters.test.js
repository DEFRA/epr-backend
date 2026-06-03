import { describe, expect, it } from 'vitest'

import { BACKFILL_ACTOR } from '../repository/stream-schema.js'
import {
  buildSummaryLogSubmitters,
  buildSystemLogSubmitters,
  resolveSummaryLogSubmitters,
  SUBMITTER_SOURCE
} from './summary-log-submitters.js'

const summaryLogDoc = (docId, fileId) => ({
  id: docId,
  summaryLog: { file: { id: fileId } }
})

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

  it('skips historical transactions whose createdBy serialised to null', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [creditTransaction(null, 'v1')]

    const submitters = buildSummaryLogSubmitters({ transactions, wasteRecords })

    expect(submitters.has('sl-1')).toBe(false)
  })

  it('skips a transaction whose actor carries no id', () => {
    const wasteRecords = [
      wasteRecordWithVersions([versionWithSummaryLog('v1', 'sl-1')])
    ]
    const transactions = [
      creditTransaction({ name: 'alice@example.com' }, 'v1')
    ]

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

describe('buildSystemLogSubmitters', () => {
  it('bridges the audit document id to the file id and credits the submitter', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'user-1', email: 'alice@example.com', scope: [] }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.get('file-1')).toEqual({
      id: 'user-1',
      name: 'alice@example.com'
    })
  })

  it('names a machine submitter by its name rather than an email', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'machine-1', name: 'worker' }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.get('file-1')).toEqual({
      id: 'machine-1',
      name: 'worker'
    })
  })

  it('leaves an actor unrecovered when it carries neither a name nor an email', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'user-1' }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.size).toBe(0)
  })

  it('ignores a submit audit whose summary-log document is absent', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-missing',
          createdBy: { id: 'user-1', email: 'alice@example.com', scope: [] }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.size).toBe(0)
  })

  it('ignores a submit audit whose actor carries no id', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [{ summaryLogId: 'doc-1', createdBy: null }],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.size).toBe(0)
  })

  it('keeps the first actor when two audits reference the same document', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'user-1', email: 'alice@example.com', scope: [] }
        },
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'user-2', email: 'bob@example.com', scope: [] }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.get('file-1')).toEqual({
      id: 'user-1',
      name: 'alice@example.com'
    })
  })

  it('skips summary-log documents that carry no file id', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'user-1', email: 'alice@example.com', scope: [] }
        }
      ],
      summaryLogDocs: [{ id: 'doc-1', summaryLog: {} }]
    })

    expect(submitters.size).toBe(0)
  })
})

describe('resolveSummaryLogSubmitters', () => {
  const alice = { id: 'user-1', name: 'alice@example.com' }
  const bob = { id: 'user-2', name: 'bob@example.com' }

  it('prefers the system-log submitter over the transaction submitter', () => {
    const { submitters } = resolveSummaryLogSubmitters({
      systemLogSubmitters: new Map([['file-1', alice]]),
      transactionSubmitters: new Map([['file-1', bob]])
    })

    expect(submitters.get('file-1')).toEqual({
      submitter: alice,
      source: SUBMITTER_SOURCE.SYSTEM_LOG
    })
  })

  it('falls back to the transaction submitter where the system log has none', () => {
    const { submitters } = resolveSummaryLogSubmitters({
      systemLogSubmitters: new Map(),
      transactionSubmitters: new Map([['file-1', bob]])
    })

    expect(submitters.get('file-1')).toEqual({
      submitter: bob,
      source: SUBMITTER_SOURCE.TRANSACTION
    })
  })

  it('counts no disagreement when overlapping sources name the same actor id', () => {
    const { agreement } = resolveSummaryLogSubmitters({
      systemLogSubmitters: new Map([['file-1', alice]]),
      transactionSubmitters: new Map([
        ['file-1', { id: 'user-1', name: 'alice' }]
      ])
    })

    expect(agreement).toEqual({ comparedCount: 1, mismatchedCount: 0 })
  })

  it('counts a disagreement when overlapping sources name different actor ids', () => {
    const { agreement } = resolveSummaryLogSubmitters({
      systemLogSubmitters: new Map([['file-1', alice]]),
      transactionSubmitters: new Map([['file-1', bob]])
    })

    expect(agreement).toEqual({ comparedCount: 1, mismatchedCount: 1 })
  })

  it('compares only the summary logs both sources resolve', () => {
    const { agreement } = resolveSummaryLogSubmitters({
      systemLogSubmitters: new Map([['file-1', alice]]),
      transactionSubmitters: new Map([['file-2', bob]])
    })

    expect(agreement).toEqual({ comparedCount: 0, mismatchedCount: 0 })
  })
})
