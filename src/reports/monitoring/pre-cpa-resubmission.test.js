import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import {
  findPreCpaResubmissionReports,
  formatPreCpaResubmissionFinding,
  summarisePreCpaResubmissionFindings
} from './pre-cpa-resubmission.js'

const newId = () => new ObjectId().toHexString()

const ACTOR = { id: 'u', name: 'U' }
const APPROVED_STATUS_HISTORY = [
  { status: 'approved', updatedAt: '2025-01-01T00:00:00.000Z' }
]

/**
 * A submitted monthly report persisted as stored, seeded straight into the
 * in-memory reports repository (bypassing the create/status-transition API,
 * which read-path diagnostics do not need).
 */
const buildStoredReport = ({
  organisationId,
  registrationId,
  reportId,
  submittedAt,
  submissionNumber = 1,
  period = 6,
  year = 2025,
  cadence = 'monthly',
  currentStatus = 'submitted'
}) => ({
  id: reportId,
  version: 1,
  schemaVersion: 1,
  organisationId,
  registrationId,
  year,
  cadence,
  period,
  submissionNumber,
  startDate: '2025-06-01',
  endDate: '2025-06-30',
  dueDate: '2025-07-15T00:00:00.000Z',
  status: {
    currentStatus,
    currentStatusAt: submittedAt,
    ...(currentStatus === 'submitted'
      ? { submitted: { at: submittedAt, by: ACTOR } }
      : {}),
    history: [{ status: currentStatus, at: submittedAt, by: ACTOR }]
  }
})

const buildOrganisationWithAccreditation = ({
  organisationId,
  registrationId,
  accreditationId
}) =>
  /** @type {any} */ ({
    id: organisationId,
    statusHistory: APPROVED_STATUS_HISTORY,
    registrations: [
      {
        id: registrationId,
        accreditationId,
        statusHistory: APPROVED_STATUS_HISTORY
      }
    ],
    accreditations: accreditationId
      ? [{ id: accreditationId, statusHistory: APPROVED_STATUS_HISTORY }]
      : []
  })

/**
 * A committed row-state snapshot document as `findRowStatesForSummaryLog`
 * returns it. Two documents sharing a `rowId` but carrying different `id`s
 * (distinct committed content) is the restatement signal the diagnostic diffs
 * on; one document whose `summaryLogIds` spans two uploads is an unchanged
 * re-commit.
 */
const buildRowState = ({
  id,
  ledger,
  rowId = 'row-1',
  summaryLogIds,
  dateReceived,
  data,
  processingType = PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType = WASTE_RECORD_TYPE.RECEIVED,
  outcome = WASTE_BALANCE_OUTCOME.INCLUDED,
  // Registered-only uploads commit under a null accreditationId even for a
  // registration that later accredits -- the ledger the diagnostic must read.
  registeredOnly = false
}) => ({
  id,
  organisationId: ledger.organisationId,
  registrationId: ledger.registrationId,
  accreditationId: registeredOnly ? null : ledger.accreditationId,
  wasteRecordType,
  rowId,
  processingType,
  data: data ?? { DATE_RECEIVED_FOR_REPROCESSING: dateReceived },
  classification: { outcome, reasons: [], transactionAmount: 10 },
  summaryLogIds
})

const ledgerOf = ({ organisationId, registrationId, accreditationId }) => ({
  organisationId,
  registrationId,
  accreditationId: accreditationId ?? null
})

/**
 * Builds the four in-memory repositories from a list of registration specs.
 * Each spec: { organisationId, registrationId, accreditationId, reports[],
 * logs[], rowStates[] }.
 */
const buildRepos = async (registrations) => {
  const reportDocs = new Map()
  const rowStateDocs = []
  const organisations = []
  const summaryLogsRepository = createInMemorySummaryLogsRepository()(
    /** @type {any} */ ({ error: () => {} })
  )

  for (const reg of registrations) {
    if (!reg.omitOrganisation) {
      organisations.push(buildOrganisationWithAccreditation(reg))
    }
    for (const report of reg.reports) {
      reportDocs.set(
        report.reportId,
        buildStoredReport({
          organisationId: reg.organisationId,
          registrationId: reg.registrationId,
          ...report
        })
      )
    }
    for (const rowState of reg.rowStates) {
      rowStateDocs.push(buildRowState({ ledger: ledgerOf(reg), ...rowState }))
    }
    for (const log of reg.logs) {
      await summaryLogsRepository.insert(
        log.id,
        summaryLogFactory.submitted({
          organisationId: reg.organisationId,
          registrationId: reg.registrationId,
          submittedAt: log.submittedAt
        })
      )
    }
  }

  return {
    reportsRepository: createInMemoryReportsRepository(reportDocs)(),
    summaryLogsRepository,
    summaryLogRowStateRepository:
      createInMemorySummaryLogRowStateRepository(rowStateDocs)(),
    organisationsRepository:
      createInMemoryOrganisationsRepository(organisations)()
  }
}

const run = (repos) => findPreCpaResubmissionReports(repos)

describe('findPreCpaResubmissionReports', () => {
  it('flags a submitted report whose already-closed period a later upload restated', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings, ignoredInClosedPeriods } = await run(
      await buildRepos([reg])
    )

    expect(scanned).toBe(1)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      organisationId: reg.organisationId,
      registrationId: reg.registrationId,
      reportId: 'report-1',
      year: 2025,
      cadence: 'monthly',
      period: 6,
      reportSubmittedAt: '2025-07-01T00:00:00.000Z',
      restatingSummaryLogId: 'sl-restating'
    })
    expect(ignoredInClosedPeriods).toEqual([])
  })

  it('does not flag when a later upload only changes a row in a still-open period', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-later', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        // The later upload changes a July row -- no report submitted for July.
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-open',
          summaryLogIds: ['sl-later'],
          rowId: 'row-2',
          dateReceived: '2025-07-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('does not flag when a later upload re-commits identical row state (unchanged)', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-reupload', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        // One doc whose membership spans both uploads -- an unchanged re-commit.
        {
          id: 'rs-shared',
          summaryLogIds: ['sl-original', 'sl-reupload'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toEqual([])
  })

  it('attributes to the latest submitted report when a period was resubmitted then restated', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-v1',
          submissionNumber: 1,
          submittedAt: '2025-07-01T00:00:00.000Z'
        },
        {
          reportId: 'report-v2',
          submissionNumber: 2,
          submittedAt: '2025-07-20T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reportId: 'report-v2',
      reportSubmittedAt: '2025-07-20T00:00:00.000Z',
      restatingSummaryLogId: 'sl-restating'
    })
  })

  it('closes a period by earliest submission time, not submissionNumber order', async () => {
    // submissionNumber need not increase with submission time. Here the higher
    // submissionNumber (v2) was submitted BEFORE the lower one (v1), so the
    // period first closed at v2's 5 Aug, not the lowest-submissionNumber v1's
    // 10 Aug. A 7 Aug restating upload lands after the true first close but
    // before v1's timestamp, so it is a finding only when the earliest close is
    // taken by timestamp rather than by submissionNumber order.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-v1',
          submissionNumber: 1,
          submittedAt: '2025-08-10T00:00:00.000Z'
        },
        {
          reportId: 'report-v2',
          submissionNumber: 2,
          submittedAt: '2025-08-05T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-08-01T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-07T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reportId: 'report-v2',
      reportSubmittedAt: '2025-08-05T00:00:00.000Z',
      restatingSummaryLogId: 'sl-restating'
    })
  })

  it('surfaces a submitted report missing its submittedAt rather than silently dropping it', async () => {
    // A submitted report should always carry a submittedAt; one that does not
    // cannot be placed in the closed-vs-open timeline (a null submittedAt fails
    // every gate comparison unnoticed), so it is reported for review rather than
    // silently counted as producing no finding.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [{ reportId: 'report-1', submittedAt: undefined }],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings, reportsMissingSubmittedAt } = await run(
      await buildRepos([reg])
    )

    expect(scanned).toBe(0)
    expect(findings).toEqual([])
    expect(reportsMissingSubmittedAt).toHaveLength(1)
    expect(reportsMissingSubmittedAt[0]).toMatchObject({
      organisationId: reg.organisationId,
      registrationId: reg.registrationId,
      reportId: 'report-1',
      year: 2025,
      cadence: 'monthly',
      period: 6
    })
  })

  it('counts an oscillation that returns to its original state (net-zero restatement)', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-a1', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-b', submittedAt: '2025-08-01T00:00:00.000Z' },
        { id: 'sl-a2', submittedAt: '2025-09-01T00:00:00.000Z' }
      ],
      rowStates: [
        // State A committed by the first and third uploads (A -> B -> A).
        {
          id: 'rs-a',
          summaryLogIds: ['sl-a1', 'sl-a2'],
          dateReceived: '2025-06-15'
        },
        { id: 'rs-b', summaryLogIds: ['sl-b'], dateReceived: '2025-06-15' }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ reportId: 'report-1' })
  })

  it('reports restatements across multiple organisations distinctly', async () => {
    const buildAffectedRegistration = (reportId) => ({
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [{ reportId, submittedAt: '2025-07-01T00:00:00.000Z' }],
      logs: [
        { id: `${reportId}-original`, submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: `${reportId}-restating`, submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: `${reportId}-rs-original`,
          summaryLogIds: [`${reportId}-original`],
          dateReceived: '2025-06-15'
        },
        {
          id: `${reportId}-rs-restated`,
          summaryLogIds: [`${reportId}-restating`],
          dateReceived: '2025-06-15'
        }
      ]
    })
    const regA = buildAffectedRegistration('report-a')
    const regB = buildAffectedRegistration('report-b')

    const { scanned, findings } = await run(await buildRepos([regA, regB]))

    expect(scanned).toBe(2)
    expect(findings).toHaveLength(2)
    expect(new Set(findings.map((f) => f.organisationId)).size).toBe(2)
    expect(new Set(findings.map((f) => f.registrationId)).size).toBe(2)
    expect(new Set(findings.map((f) => f.reportId))).toEqual(
      new Set(['report-a', 'report-b'])
    )
  })

  it('keeps an IGNORED restatement out of findings but records it as an invariant-probe hit', async () => {
    // The accreditation subset of report-period invariant means an IGNORED (outside-
    // accreditation) row should never land in a reported closed period, so this
    // input cannot arise in production -- it exercises the probe branch that
    // would surface such an anomaly if the invariant were ever violated.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-ignored',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15',
          outcome: WASTE_BALANCE_OUTCOME.IGNORED
        }
      ]
    }

    const { scanned, findings, ignoredInClosedPeriods } = await run(
      await buildRepos([reg])
    )

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
    expect(ignoredInClosedPeriods).toHaveLength(1)
    expect(ignoredInClosedPeriods[0]).toMatchObject({
      reportId: 'report-1',
      restatingSummaryLogId: 'sl-restating'
    })
  })

  it('does not flag when the report was submitted after the restating upload (period not yet closed)', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      // Report submitted 1 Sep -- after the 1 Aug upload, so June was not closed
      // when that upload landed. The stale-report mechanism makes this the only
      // reachable ordering: a submitted report already reflects prior uploads.
      reports: [
        { reportId: 'report-1', submittedAt: '2025-09-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('flags both period reports when one exporter row spans two reporting dates', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-may',
          period: 5,
          submittedAt: '2025-07-01T00:00:00.000Z'
        },
        {
          reportId: 'report-jun',
          period: 6,
          submittedAt: '2025-07-01T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-exp-original',
          summaryLogIds: ['sl-original'],
          processingType: PROCESSING_TYPES.EXPORTER,
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2025-05-10',
            DATE_OF_EXPORT: '2025-06-10'
          }
        },
        {
          id: 'rs-exp-restated',
          summaryLogIds: ['sl-restating'],
          processingType: PROCESSING_TYPES.EXPORTER,
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2025-05-15',
            DATE_OF_EXPORT: '2025-06-15'
          }
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(2)
    expect(new Set(findings.map((f) => f.reportId))).toEqual(
      new Set(['report-may', 'report-jun'])
    )
  })

  it('maps quarterly periods for a registered-only registration (null accreditation)', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: undefined,
      reports: [
        {
          reportId: 'report-q2',
          cadence: 'quarterly',
          period: 2,
          submittedAt: '2025-07-15T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-q-original',
          summaryLogIds: ['sl-original'],
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2025-05-10' }
        },
        {
          id: 'rs-q-restated',
          summaryLogIds: ['sl-restating'],
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2025-05-20' }
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reportId: 'report-q2',
      cadence: 'quarterly',
      period: 2,
      restatingSummaryLogId: 'sl-restating'
    })
  })

  it('does not scan a period whose only submission is still in progress', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-draft',
          currentStatus: 'in_progress',
          submittedAt: '2025-07-05T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(0)
    expect(findings).toEqual([])
  })

  it('skips a registration whose organisation can no longer be resolved', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      omitOrganisation: true,
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('does not flag a restated row whose processing type has no table schema', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-unknown',
          summaryLogIds: ['sl-restating'],
          processingType: 'UNKNOWN_PROCESSING_TYPE',
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('does not flag a restated row missing its reporting date value', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        // A distinct rowId (an added row) with no reporting date at all.
        {
          id: 'rs-nodate',
          summaryLogIds: ['sl-restating'],
          rowId: 'row-2',
          data: {}
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('skips a registration with a single submitted upload (nothing to diff)', async () => {
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        { reportId: 'report-1', submittedAt: '2025-07-01T00:00:00.000Z' }
      ],
      logs: [{ id: 'sl-only', submittedAt: '2025-06-25T00:00:00.000Z' }],
      rowStates: [
        {
          id: 'rs-only',
          summaryLogIds: ['sl-only'],
          dateReceived: '2025-06-15'
        }
      ]
    }

    const { scanned, findings } = await run(await buildRepos([reg]))

    expect(scanned).toBe(1)
    expect(findings).toEqual([])
  })

  it('flags the closed period a load moved OUT of when a later upload shifts its date', async () => {
    // Live CPA folds the previous row's dates into an adjustment, so a load
    // whose reporting date is corrected from June (closed) to July (open) still
    // restates the closed June report -- the period the load moved out of.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-jun',
          period: 6,
          submittedAt: '2025-07-01T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          dateReceived: '2025-06-15'
        },
        // Same rowId 'row-1' (an adjustment); date moved into still-open July.
        {
          id: 'rs-moved',
          summaryLogIds: ['sl-restating'],
          dateReceived: '2025-07-15'
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reportId: 'report-jun',
      period: 6,
      restatingSummaryLogId: 'sl-restating'
    })
  })

  it('maps each row to its own-cadence report for a registration that changed accreditation state', async () => {
    // A registration that was registered-only (quarterly) then accredited
    // (monthly) accrues reports of both cadences. The registered-only-phase
    // rows are committed under a NULL ledger (registeredOnly) while the
    // accredited rows sit under the accreditation ledger, so the finder must
    // read both ledgers and match each date to its own-cadence report.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-q1',
          cadence: 'quarterly',
          period: 1,
          submittedAt: '2025-05-01T00:00:00.000Z'
        },
        {
          reportId: 'report-jun',
          cadence: 'monthly',
          period: 6,
          submittedAt: '2025-07-01T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-04-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-q-original',
          summaryLogIds: ['sl-original'],
          rowId: 'q-1',
          registeredOnly: true,
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2025-02-10' }
        },
        {
          id: 'rs-q-restated',
          summaryLogIds: ['sl-restating'],
          rowId: 'q-1',
          registeredOnly: true,
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2025-02-20' }
        },
        {
          id: 'rs-m-original',
          summaryLogIds: ['sl-original'],
          rowId: 'm-1',
          dateReceived: '2025-06-15'
        },
        {
          id: 'rs-m-restated',
          summaryLogIds: ['sl-restating'],
          rowId: 'm-1',
          dateReceived: '2025-06-20'
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(2)
    expect(new Set(findings.map((f) => f.reportId))).toEqual(
      new Set(['report-q1', 'report-jun'])
    )
    expect(findings.find((f) => f.reportId === 'report-q1')).toMatchObject({
      cadence: 'quarterly',
      period: 1
    })
    expect(findings.find((f) => f.reportId === 'report-jun')).toMatchObject({
      cadence: 'monthly',
      period: 6
    })
  })

  it('attributes a cross-phase restatement to its own (monthly) cadence, not the registered-only quarterly report', async () => {
    // Registered-only and accredited exporter tables share the `exported`
    // wasteRecordType and the DATE_OF_EXPORT field, so a reg-only row and an
    // accredited row can share a rowIdentityKey. The accredited restatement
    // pairs with the reg-only predecessor (as live CPA does) but folds it under
    // the accredited monthly cadence, so it must never surface the reg-only Q2
    // quarterly report.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-q2',
          cadence: 'quarterly',
          period: 2,
          submittedAt: '2025-05-01T00:00:00.000Z'
        },
        {
          reportId: 'report-jun',
          cadence: 'monthly',
          period: 6,
          submittedAt: '2025-07-01T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-ro', submittedAt: '2025-04-01T00:00:00.000Z' },
        { id: 'sl-acc1', submittedAt: '2025-08-01T00:00:00.000Z' },
        { id: 'sl-acc2', submittedAt: '2025-09-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-ro',
          summaryLogIds: ['sl-ro'],
          rowId: 'exp-1',
          registeredOnly: true,
          processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          data: { DATE_OF_EXPORT: '2025-05-10' }
        },
        {
          id: 'rs-acc1',
          summaryLogIds: ['sl-acc1'],
          rowId: 'exp-1',
          processingType: PROCESSING_TYPES.EXPORTER,
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2025-06-05',
            DATE_OF_EXPORT: '2025-06-10'
          }
        },
        {
          id: 'rs-acc2',
          summaryLogIds: ['sl-acc2'],
          rowId: 'exp-1',
          processingType: PROCESSING_TYPES.EXPORTER,
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2025-06-15',
            DATE_OF_EXPORT: '2025-06-20'
          }
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reportId: 'report-jun',
      cadence: 'monthly',
      period: 6
    })
    expect(findings.map((f) => f.reportId)).not.toContain('report-q2')
  })

  it('maps registered-only rows to the quarterly report even when a non-active accreditation id is present', async () => {
    // A registration that has applied for accreditation (an accreditationId is
    // linked) but is not yet approved still uploads the registered-only template
    // and reports quarterly. Its rows commit under the non-null accreditation
    // ledger, so cadence must come from the row's processing type, not the
    // ledger id, to match the quarterly report.
    const reg = {
      organisationId: newId(),
      registrationId: newId(),
      accreditationId: newId(),
      reports: [
        {
          reportId: 'report-q2',
          cadence: 'quarterly',
          period: 2,
          submittedAt: '2025-07-15T00:00:00.000Z'
        }
      ],
      logs: [
        { id: 'sl-original', submittedAt: '2025-06-25T00:00:00.000Z' },
        { id: 'sl-restating', submittedAt: '2025-08-01T00:00:00.000Z' }
      ],
      rowStates: [
        {
          id: 'rs-original',
          summaryLogIds: ['sl-original'],
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2025-05-10' }
        },
        {
          id: 'rs-restated',
          summaryLogIds: ['sl-restating'],
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
          data: { MONTH_RECEIVED_FOR_REPROCESSING: '2025-05-20' }
        }
      ]
    }

    const { findings } = await run(await buildRepos([reg]))

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      reportId: 'report-q2',
      cadence: 'quarterly',
      period: 2
    })
  })
})

describe('formatPreCpaResubmissionFinding', () => {
  const finding = {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    reportId: 'report-1',
    year: 2025,
    cadence: 'monthly',
    period: 6,
    reportSubmittedAt: '2025-07-01T00:00:00.000Z',
    restatingSummaryLogId: 'sl-restating'
  }

  it('renders a finding as a single retrospective log line', () => {
    expect(formatPreCpaResubmissionFinding(finding)).toBe(
      'Pre-CPA resubmission (retrospective): org org-1 / registration reg-1, ' +
        'report report-1 (Jun 2025, monthly) -- closed period restated by ' +
        'summary log sl-restating uploaded after the report was submitted ' +
        '2025-07-01T00:00:00.000Z'
    )
  })

  it('labels a quarterly period with its quarter', () => {
    expect(
      formatPreCpaResubmissionFinding({
        ...finding,
        cadence: 'quarterly',
        period: 2
      })
    ).toContain('report report-1 (Q2 2025, quarterly) --')
  })
})

describe('summarisePreCpaResubmissionFindings', () => {
  it('counts distinct affected organisations and registrations', () => {
    expect(
      summarisePreCpaResubmissionFindings([
        { organisationId: 'org-1', registrationId: 'reg-1' },
        { organisationId: 'org-1', registrationId: 'reg-2' },
        { organisationId: 'org-2', registrationId: 'reg-3' }
      ])
    ).toEqual({ affectedOrganisations: 2, affectedRegistrations: 3 })
  })

  it('returns zero counts for no findings', () => {
    expect(summarisePreCpaResubmissionFindings([])).toEqual({
      affectedOrganisations: 0,
      affectedRegistrations: 0
    })
  })
})
