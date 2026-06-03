import { describe, expect, it } from 'vitest'

import { buildSystemLogSubmitters } from './summary-log-submitters.js'

const summaryLogDoc = (docId, fileId) => ({
  id: docId,
  summaryLog: { file: { id: fileId } }
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
