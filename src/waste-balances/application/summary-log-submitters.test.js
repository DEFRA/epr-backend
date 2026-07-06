import { describe, expect, it } from 'vitest'

import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'
import {
  addAttribution,
  buildSystemLogSubmitters,
  classifyActorAttribution,
  emptyAttributionCounts,
  formatAttributionMatrix,
  mergeAttributionMatrices,
  toLedgerActor
} from './summary-log-submitters.js'

const summaryLogDoc = (docId, fileId) => ({
  id: docId,
  summaryLog: { file: { id: fileId } }
})

describe('buildSystemLogSubmitters', () => {
  it('bridges the audit document id to the file id and credits the submitter by email', () => {
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
      email: 'alice@example.com'
    })
  })

  it('carries a name and an email distinctly when the audit holds both', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: {
            id: 'user-1',
            name: 'Alice Submitter',
            email: 'alice@example.com',
            scope: []
          }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.get('file-1')).toEqual({
      id: 'user-1',
      name: 'Alice Submitter',
      email: 'alice@example.com'
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

  it('recovers an id-only actor as a real, attributable actor', () => {
    const submitters = buildSystemLogSubmitters({
      submitActors: [
        {
          summaryLogId: 'doc-1',
          createdBy: { id: 'user-1' }
        }
      ],
      summaryLogDocs: [summaryLogDoc('doc-1', 'file-1')]
    })

    expect(submitters.get('file-1')).toEqual({ id: 'user-1' })
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
      email: 'alice@example.com'
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

describe('toLedgerActor', () => {
  it('carries a name and an email distinctly when the audit holds both', () => {
    expect(
      toLedgerActor({
        id: 'user-1',
        name: 'Alice Submitter',
        email: 'alice@example.com'
      })
    ).toEqual({
      id: 'user-1',
      name: 'Alice Submitter',
      email: 'alice@example.com'
    })
  })

  it('carries only the name when the audit holds no email', () => {
    expect(toLedgerActor({ id: 'machine-1', name: 'worker' })).toEqual({
      id: 'machine-1',
      name: 'worker'
    })
  })

  it('carries only the email when the audit holds no name', () => {
    expect(toLedgerActor({ id: 'user-1', email: 'alice@example.com' })).toEqual(
      { id: 'user-1', email: 'alice@example.com' }
    )
  })

  it('carries an id-only actor as a real, attributable actor', () => {
    expect(toLedgerActor({ id: 'user-1' })).toEqual({ id: 'user-1' })
  })

  it('rejects an actor that carries no id', () => {
    expect(
      toLedgerActor({ name: 'Alice', email: 'alice@example.com' })
    ).toBeNull()
  })

  it('rejects an absent actor', () => {
    expect(toLedgerActor(undefined)).toBeNull()
    expect(toLedgerActor(null)).toBeNull()
  })
})

describe('classifyActorAttribution', () => {
  it('counts an actor carrying both a name and an email', () => {
    expect(
      classifyActorAttribution({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com'
      })
    ).toEqual({
      nameAndEmail: 1,
      nameOnly: 0,
      emailOnly: 0,
      idOnly: 0,
      noActor: 0,
      scope: 0
    })
  })

  it('counts a name-only actor', () => {
    expect(classifyActorAttribution({ id: 'user-1', name: 'Alice' })).toEqual({
      nameAndEmail: 0,
      nameOnly: 1,
      emailOnly: 0,
      idOnly: 0,
      noActor: 0,
      scope: 0
    })
  })

  it('counts an email-only actor', () => {
    expect(
      classifyActorAttribution({ id: 'user-1', email: 'alice@example.com' })
    ).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 1,
      idOnly: 0,
      noActor: 0,
      scope: 0
    })
  })

  it('counts an id-only actor as a real, attributed actor', () => {
    expect(classifyActorAttribution({ id: 'user-1' })).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 0,
      idOnly: 1,
      noActor: 0,
      scope: 0
    })
  })

  it('counts an actor-less event as a true backfill with no id', () => {
    expect(classifyActorAttribution(null)).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 0,
      idOnly: 0,
      noActor: 1,
      scope: 0
    })
    expect(classifyActorAttribution(undefined)).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 0,
      idOnly: 0,
      noActor: 1,
      scope: 0
    })
    expect(
      classifyActorAttribution({ name: 'Alice', email: 'alice@example.com' })
    ).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 0,
      idOnly: 0,
      noActor: 1,
      scope: 0
    })
  })

  it('counts scope presence alongside the label combination', () => {
    expect(
      classifyActorAttribution({
        id: 'user-1',
        email: 'alice@example.com',
        scope: ['standard_user']
      })
    ).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 1,
      idOnly: 0,
      noActor: 0,
      scope: 1
    })
  })

  it('does not count an empty scope array as scope presence', () => {
    expect(
      classifyActorAttribution({
        id: 'user-1',
        email: 'alice@example.com',
        scope: []
      })
    ).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 1,
      idOnly: 0,
      noActor: 0,
      scope: 0
    })
  })
})

describe('emptyAttributionCounts', () => {
  it('starts every cell at zero', () => {
    expect(emptyAttributionCounts()).toEqual({
      nameAndEmail: 0,
      nameOnly: 0,
      emailOnly: 0,
      idOnly: 0,
      noActor: 0,
      scope: 0
    })
  })

  it('returns a fresh object each call', () => {
    expect(emptyAttributionCounts()).not.toBe(emptyAttributionCounts())
  })
})

describe('addAttribution', () => {
  it('records an actor under its event kind', () => {
    const matrix = {}
    addAttribution(matrix, LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED, {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com'
    })

    expect(matrix).toEqual({
      [LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: {
        nameAndEmail: 1,
        nameOnly: 0,
        emailOnly: 0,
        idOnly: 0,
        noActor: 0,
        scope: 0
      }
    })
  })

  it('accumulates several actors of the same kind', () => {
    const matrix = {}
    addAttribution(matrix, LEDGER_EVENT_KIND.PRN_CREATED, {
      id: 'user-1',
      name: 'Alice'
    })
    addAttribution(matrix, LEDGER_EVENT_KIND.PRN_CREATED, { id: 'user-2' })
    addAttribution(matrix, LEDGER_EVENT_KIND.PRN_CREATED, null)

    expect(matrix[LEDGER_EVENT_KIND.PRN_CREATED]).toEqual({
      nameAndEmail: 0,
      nameOnly: 1,
      emailOnly: 0,
      idOnly: 1,
      noActor: 1,
      scope: 0
    })
  })
})

describe('mergeAttributionMatrices', () => {
  it('sums counts per kind per cell across matrices', () => {
    const a = {
      [LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: {
        nameAndEmail: 1,
        nameOnly: 0,
        emailOnly: 2,
        idOnly: 0,
        noActor: 1,
        scope: 3
      }
    }
    const b = {
      [LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: {
        nameAndEmail: 0,
        nameOnly: 1,
        emailOnly: 1,
        idOnly: 4,
        noActor: 0,
        scope: 1
      },
      [LEDGER_EVENT_KIND.PRN_ACCEPTED]: {
        nameAndEmail: 0,
        nameOnly: 2,
        emailOnly: 0,
        idOnly: 0,
        noActor: 0,
        scope: 0
      }
    }

    expect(mergeAttributionMatrices([a, b])).toEqual({
      [LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: {
        nameAndEmail: 1,
        nameOnly: 1,
        emailOnly: 3,
        idOnly: 4,
        noActor: 1,
        scope: 4
      },
      [LEDGER_EVENT_KIND.PRN_ACCEPTED]: {
        nameAndEmail: 0,
        nameOnly: 2,
        emailOnly: 0,
        idOnly: 0,
        noActor: 0,
        scope: 0
      }
    })
  })

  it('returns an empty matrix when given no matrices', () => {
    expect(mergeAttributionMatrices([])).toEqual({})
  })
})

describe('formatAttributionMatrix', () => {
  it('renders each kind with its cell counts, kinds sorted', () => {
    const matrix = {
      [LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: {
        nameAndEmail: 2,
        nameOnly: 0,
        emailOnly: 1,
        idOnly: 3,
        noActor: 1,
        scope: 2
      },
      [LEDGER_EVENT_KIND.PRN_CREATED]: {
        nameAndEmail: 0,
        nameOnly: 4,
        emailOnly: 0,
        idOnly: 0,
        noActor: 2,
        scope: 0
      }
    }

    expect(formatAttributionMatrix(matrix)).toBe(
      'prn-created{displayAndContact:0,displayOnly:4,contactOnly:0,idOnly:0,noActor:2,scope:0};' +
        'summary-log-submitted{displayAndContact:2,displayOnly:0,contactOnly:1,idOnly:3,noActor:1,scope:2}'
    )
  })

  it('renders an empty matrix as an empty string', () => {
    expect(formatAttributionMatrix({})).toBe('')
  })

  it('renders no cell label that CDP PII masking would redact', () => {
    const matrix = {
      [LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED]: {
        nameAndEmail: 1,
        nameOnly: 1,
        emailOnly: 1,
        idOnly: 1,
        noActor: 1,
        scope: 1
      }
    }

    expect(formatAttributionMatrix(matrix)).not.toMatch(/name|email/i)
  })
})
