import { describe, expect, it } from 'vitest'

import { buildSummaryLogSubmitters } from './summary-log-submitters.js'

const summaryLogDoc = (docId, fileId) => ({
  id: docId,
  summaryLog: { file: { id: fileId }, status: 'submitted' }
})

describe('buildSummaryLogSubmitters', () => {
  it('maps file IDs to submitters via the document _id join', () => {
    const systemLogSubmitters = new Map([
      ['doc-1', { id: 'user-a', name: 'alice@example.com' }],
      ['doc-2', { id: 'user-b', name: 'bob@example.com' }]
    ])
    const summaryLogDocs = [
      summaryLogDoc('doc-1', 'file-1'),
      summaryLogDoc('doc-2', 'file-2')
    ]

    const result = buildSummaryLogSubmitters({
      systemLogSubmitters,
      summaryLogDocs
    })

    expect(result.get('file-1')).toEqual({
      id: 'user-a',
      name: 'alice@example.com'
    })
    expect(result.get('file-2')).toEqual({
      id: 'user-b',
      name: 'bob@example.com'
    })
  })

  it('omits summary logs with no matching system-log submitter', () => {
    const systemLogSubmitters = new Map()
    const summaryLogDocs = [summaryLogDoc('doc-1', 'file-1')]

    const result = buildSummaryLogSubmitters({
      systemLogSubmitters,
      summaryLogDocs
    })

    expect(result.size).toBe(0)
  })

  it('returns an empty map when there are no summary log docs', () => {
    const systemLogSubmitters = new Map([
      ['doc-1', { id: 'user-a', name: 'alice@example.com' }]
    ])

    const result = buildSummaryLogSubmitters({
      systemLogSubmitters,
      summaryLogDocs: []
    })

    expect(result.size).toBe(0)
  })

  it('coerces ObjectId-like doc IDs to string for the join', () => {
    const objectIdLike = { toString: () => 'abc123' }
    const systemLogSubmitters = new Map([
      ['abc123', { id: 'user-a', name: 'alice@example.com' }]
    ])
    const summaryLogDocs = [
      { id: objectIdLike, summaryLog: { file: { id: 'file-1' } } }
    ]

    const result = buildSummaryLogSubmitters({
      systemLogSubmitters,
      summaryLogDocs
    })

    expect(result.get('file-1')).toEqual({
      id: 'user-a',
      name: 'alice@example.com'
    })
  })
})
