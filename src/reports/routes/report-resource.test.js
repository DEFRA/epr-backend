import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_YEAR,
  buildCreateReportParams,
  createAndSubmitReport
} from '#reports/repository/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import {
  PREVIEW_STATUS,
  reportResourceSchema,
  toReportResource
} from './report-resource.js'

/** @import { PreviewBody } from './report-resource.js' */

const CHANGED_BY = {
  id: 'user-2',
  name: 'Bob',
  email: 'bob@example.com',
  position: 'Manager'
}
const ACCREDITED_PRN = { issuedTonnage: 120 }
const NO_ROWS_RECEIVED = {
  suppliers: [],
  totalTonnageReceived: 0,
  tonnageRecycled: null,
  tonnageNotRecycled: null
}
const NOTHING_SENT = {
  tonnageSentToReprocessor: 0,
  tonnageSentToExporter: 0,
  tonnageSentToAnotherSite: 0,
  finalDestinations: []
}
const SUBMITTED_SOURCE = {
  summaryLogId: 'sl-1',
  lastUploadedAt: '2026-04-01T21:22:28.351Z'
}

const storedPeriod = {
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD,
  submissionNumber: 1,
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  dueDate: '2024-02-15'
}

const newRepository = () => createInMemoryReportsRepository()()

/**
 * @param {import('#reports/repository/port.js').ReportsRepository} repository
 * @param {string} reportId
 * @param {boolean} [canRequestResubmission]
 */
const bodyOf = async (
  repository,
  reportId,
  canRequestResubmission = false
) => ({
  ...(await repository.findReportById(reportId)),
  canRequestResubmission
})

/**
 * @param {object} [overrides]
 */
const createInProgress = async (overrides = {}) => {
  const repository = newRepository()
  const { id } = await repository.createReport(
    buildCreateReportParams(overrides)
  )
  return { repository, id }
}

/**
 * @param {Partial<PreviewBody>} [overrides]
 * @returns {PreviewBody}
 */
const preview = (overrides = {}) => ({
  operatorCategory: 'REPROCESSOR',
  cadence: 'quarterly',
  year: 2026,
  period: 2,
  startDate: calendarDate('2026-04-01'),
  endDate: calendarDate('2026-06-30'),
  source: SUBMITTED_SOURCE,
  recyclingActivity: {
    suppliers: [],
    totalTonnageReceived: 12.5,
    tonnageRecycled: null,
    tonnageNotRecycled: null
  },
  wasteSent: NOTHING_SENT,
  diagnostics: { wasteReceivedRecordsExcluded: 0 },
  prn: null,
  canRequestResubmission: false,
  ...overrides
})

const servedPreview = {
  year: 2026,
  cadence: 'quarterly',
  period: 2,
  submissionNumber: 1,
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  status: 'not_started',
  canRequestResubmission: false,
  recyclingActivity: { suppliers: [], totalTonnageReceived: 12.5 },
  wasteSent: NOTHING_SENT,
  source: SUBMITTED_SOURCE
}

describe('toReportResource', () => {
  describe('a stored report', () => {
    it('serves the report by its period, with no ids or internal fields', async () => {
      const { repository, id } = await createInProgress({
        prn: ACCREDITED_PRN,
        supportingInformation: 'Notes'
      })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource).toStrictEqual({
        ...storedPeriod,
        status: 'in_progress',
        version: 1,
        canRequestResubmission: false,
        recyclingActivity: NO_ROWS_RECEIVED,
        wasteSent: NOTHING_SENT,
        prn: { issuedTonnage: 120 },
        supportingInformation: 'Notes',
        source: SUBMITTED_SOURCE
      })
    })

    it('serves an exporter report with its export activity', async () => {
      const exportActivity = {
        overseasSites: [
          {
            orsId: '001',
            siteName: 'Site',
            country: null,
            tonnageExported: 3,
            approved: true
          }
        ],
        unapprovedOverseasSites: [],
        totalTonnageExported: 3,
        tonnageReceivedNotExported: null,
        tonnageRefusedAtDestination: 0,
        tonnageStoppedDuringExport: 0,
        totalTonnageRefusedOrStopped: 0,
        tonnageRepatriated: 0
      }
      const { repository, id } = await createInProgress({ exportActivity })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource.exportActivity).toStrictEqual(exportActivity)
      expect(reportResourceSchema.validate(resource).error).toBeUndefined()
    })

    it('leaves out prn on a registered-only report', async () => {
      const { repository, id } = await createInProgress({ prn: null })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource).not.toHaveProperty('prn')
    })

    it('leaves out source before any summary log is submitted', async () => {
      const { repository, id } = await createInProgress({
        source: { summaryLogId: null, lastUploadedAt: null }
      })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource).not.toHaveProperty('source')
    })

    it('leaves out source on a report stored without one', async () => {
      const { repository, id } = await createInProgress()
      const { source: _, ...withoutSource } = await bodyOf(repository, id)

      const resource = toReportResource(withoutSource, { submissionNumber: 1 })

      expect(resource).not.toHaveProperty('source')
    })

    it('keeps the figures the operator has not entered yet as null', async () => {
      const { repository, id } = await createInProgress({
        prn: ACCREDITED_PRN
      })
      await repository.updateReport({
        reportId: id,
        version: 1,
        fields: { prn: { ...ACCREDITED_PRN, totalRevenue: null } }
      })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource).toMatchObject({
        recyclingActivity: { tonnageRecycled: null, tonnageNotRecycled: null },
        prn: { issuedTonnage: 120, totalRevenue: null }
      })
    })

    it('serves a new report prn with only its issued tonnage', async () => {
      const { repository, id } = await createInProgress({
        prn: ACCREDITED_PRN
      })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource.prn).toStrictEqual({ issuedTonnage: 120 })
    })

    it('says who submitted it and when, without their id or email', async () => {
      const repository = newRepository()
      const id = await createAndSubmitReport(repository)
      const stored = await repository.findReportById(id)

      const resource = toReportResource(await bodyOf(repository, id, true), {
        submissionNumber: 1
      })

      expect(resource).toStrictEqual({
        ...storedPeriod,
        status: 'submitted',
        submittedAt: stored.status.submitted?.at,
        submittedBy: { name: 'Alice', position: 'Officer' },
        version: 3,
        canRequestResubmission: true,
        recyclingActivity: NO_ROWS_RECEIVED,
        wasteSent: NOTHING_SENT,
        source: SUBMITTED_SOURCE
      })
    })

    it('leaves out the name of a submitter who has none', async () => {
      const repository = newRepository()
      const { id } = await repository.createReport(buildCreateReportParams())
      await repository.updateReportStatus({
        reportId: id,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy: CHANGED_BY
      })
      await repository.updateReportStatus({
        reportId: id,
        version: 2,
        status: REPORT_STATUS.SUBMITTED,
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy: { id: 'user-3', position: 'User' },
        submissionDeclaredBy: 'Test User'
      })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource.submittedBy).toStrictEqual({ position: 'User' })
    })

    it.each([
      ['in progress', 0],
      ['ready to submit', 1]
    ])('says nothing of a submission while %s', async (_, transitions) => {
      const { repository, id } = await createInProgress()
      if (transitions) {
        await repository.updateReportStatus({
          reportId: id,
          version: 1,
          status: REPORT_STATUS.READY_TO_SUBMIT,
          slot: REPORT_STATUS_SLOT.READY,
          changedBy: CHANGED_BY
        })
      }

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource).not.toHaveProperty('submittedAt')
      expect(resource).not.toHaveProperty('submittedBy')
    })

    it('says nothing of an earlier submission once unsubmitted', async () => {
      const repository = newRepository()
      const id = await createAndSubmitReport(repository)
      await repository.updateReportStatus({
        reportId: id,
        version: 3,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.UNSUBMITTED,
        changedBy: CHANGED_BY
      })

      const resource = toReportResource(await bodyOf(repository, id), {
        submissionNumber: 1
      })

      expect(resource.status).toBe('ready_to_submit')
      expect(resource).not.toHaveProperty('submittedAt')
      expect(resource).not.toHaveProperty('submittedBy')
    })

    it.each([
      [
        'a newer summary log',
        { summaryLogChanged: { uploadedAt: '2026-05-01T00:00:00.000Z' } },
        true,
        false
      ],
      [
        'a cancelled PRN',
        { prnCancelled: { occurredAt: '2026-05-02T00:00:00.000Z' } },
        false,
        true
      ],
      [
        'both',
        {
          summaryLogChanged: { uploadedAt: '2026-05-01T00:00:00.000Z' },
          prnCancelled: { occurredAt: '2026-05-02T00:00:00.000Z' }
        },
        true,
        true
      ]
    ])(
      'says a report is stale from %s, without ids',
      async (_, expected, summaryLogChanged, prnCancelled) => {
        const { repository, id } = await createInProgress()
        if (summaryLogChanged) {
          await repository.markActiveReportsStaleForSummaryLog(
            DEFAULT_ORG_ID,
            DEFAULT_REG_ID,
            'sl-2',
            '2026-05-01T00:00:00.000Z'
          )
        }
        if (prnCancelled) {
          await repository.markActiveReportsStaleForPrnCancellation({
            organisationId: DEFAULT_ORG_ID,
            registrationId: DEFAULT_REG_ID,
            year: DEFAULT_REPORT_YEAR,
            cadence: 'monthly',
            period: DEFAULT_REPORT_PERIOD,
            prnId: 'prn-1',
            occurredAt: '2026-05-02T00:00:00.000Z'
          })
        }

        const resource = toReportResource(await bodyOf(repository, id), {
          submissionNumber: 1
        })

        expect(resource.stale).toStrictEqual(expected)
      }
    )

    it.each([
      [
        'a restated closed period',
        { closedPeriodRestated: { uploadedAt: '2026-05-01T00:00:00.000Z' } },
        true,
        false
      ],
      [
        'the operator',
        {
          operatorRequested: {
            requestedAt: '2026-05-02T00:00:00.000Z',
            requestedBy: { name: 'Bob', position: 'Manager' }
          }
        },
        false,
        true
      ],
      [
        'both',
        {
          closedPeriodRestated: { uploadedAt: '2026-05-01T00:00:00.000Z' },
          operatorRequested: {
            requestedAt: '2026-05-02T00:00:00.000Z',
            requestedBy: { name: 'Bob', position: 'Manager' }
          }
        },
        true,
        true
      ]
    ])(
      'says a resubmission is required by %s, without ids or emails',
      async (_, expected, restated, operatorRequested) => {
        const repository = newRepository()
        const id = await createAndSubmitReport(repository)
        const periodRef = {
          year: DEFAULT_REPORT_YEAR,
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD
        }
        if (restated) {
          await repository.markSubmittedReportsRequiringResubmission({
            organisationId: DEFAULT_ORG_ID,
            registrationId: DEFAULT_REG_ID,
            summaryLogId: 'sl-2',
            uploadedAt: '2026-05-01T00:00:00.000Z',
            periods: [periodRef]
          })
        }
        if (operatorRequested) {
          await repository.markSubmittedReportRequiringResubmissionByOperator({
            organisationId: DEFAULT_ORG_ID,
            registrationId: DEFAULT_REG_ID,
            ...periodRef,
            submissionNumber: 1,
            requestedBy: CHANGED_BY,
            requestedAt: '2026-05-02T00:00:00.000Z'
          })
        }

        const resource = toReportResource(await bodyOf(repository, id), {
          submissionNumber: 1
        })

        expect(resource.resubmissionRequired).toStrictEqual(expected)
      }
    )
  })

  describe('a generated preview', () => {
    it('serves the period with status not_started and the path submission number', () => {
      const resource = toReportResource(preview(), { submissionNumber: 1 })

      expect(resource).toStrictEqual(servedPreview)
    })

    it('serves only the issued tonnage of an accredited preview', () => {
      const resource = toReportResource(preview({ prn: ACCREDITED_PRN }), {
        submissionNumber: 2
      })

      expect(resource).toStrictEqual({
        ...servedPreview,
        submissionNumber: 2,
        prn: { issuedTonnage: 120 }
      })
    })

    it('serves an exporter preview with its export activity', () => {
      const exportActivity = {
        overseasSites: [],
        unapprovedOverseasSites: [],
        totalTonnageExported: 3,
        tonnageReceivedNotExported: null,
        tonnageRefusedAtDestination: 0,
        tonnageStoppedDuringExport: 0,
        totalTonnageRefusedOrStopped: 0,
        tonnageRepatriated: 0
      }

      const resource = toReportResource(preview({ exportActivity }), {
        submissionNumber: 1
      })

      expect(resource).toStrictEqual({ ...servedPreview, exportActivity })
    })

    it('leaves out source before any summary log is submitted', () => {
      const resource = toReportResource(
        preview({ source: { summaryLogId: null, lastUploadedAt: null } }),
        { submissionNumber: 1 }
      )

      expect(resource).not.toHaveProperty('source')
    })

    it('carries the summary log rows missing mandatory data', () => {
      const incompleteSummaryLogRows = {
        total: 1,
        issues: [{ sheet: 'Received', rowId: '1001', field: 'TONNAGE' }]
      }

      const resource = toReportResource(preview({ incompleteSummaryLogRows }), {
        submissionNumber: 1
      })

      expect(resource).toStrictEqual({
        ...servedPreview,
        incompleteSummaryLogRows
      })
    })
  })
})

describe('reportResourceSchema', () => {
  it('accepts a stored report with every optional part', async () => {
    const repository = newRepository()
    const id = await createAndSubmitReport(repository, {
      prn: ACCREDITED_PRN,
      supportingInformation: 'Notes'
    })
    await repository.markSubmittedReportRequiringResubmissionByOperator({
      organisationId: DEFAULT_ORG_ID,
      registrationId: DEFAULT_REG_ID,
      year: DEFAULT_REPORT_YEAR,
      cadence: 'monthly',
      period: DEFAULT_REPORT_PERIOD,
      submissionNumber: 1,
      requestedBy: CHANGED_BY,
      requestedAt: '2026-05-02T00:00:00.000Z'
    })
    const resource = toReportResource(await bodyOf(repository, id), {
      submissionNumber: 1
    })

    expect(reportResourceSchema.validate(resource).error).toBeUndefined()
  })

  it('accepts supporting information the operator has cleared', async () => {
    const { repository, id } = await createInProgress()
    await repository.updateReport({
      reportId: id,
      version: 1,
      fields: { supportingInformation: '' }
    })
    const resource = toReportResource(await bodyOf(repository, id), {
      submissionNumber: 1
    })

    expect(resource.supportingInformation).toBe('')
    expect(reportResourceSchema.validate(resource).error).toBeUndefined()
  })

  it('accepts a stale stored report', async () => {
    const { repository, id } = await createInProgress()
    await repository.markActiveReportsStaleForSummaryLog(
      DEFAULT_ORG_ID,
      DEFAULT_REG_ID,
      'sl-2',
      '2026-05-01T00:00:00.000Z'
    )
    const resource = toReportResource(await bodyOf(repository, id), {
      submissionNumber: 1
    })

    expect(reportResourceSchema.validate(resource).error).toBeUndefined()
  })

  it('accepts a preview', () => {
    const resource = toReportResource(
      preview({
        prn: ACCREDITED_PRN,
        incompleteSummaryLogRows: { total: 0, issues: [] }
      }),
      { submissionNumber: 1 }
    )

    expect(reportResourceSchema.validate(resource).error).toBeUndefined()
  })

  it('rejects a body with a key it does not list', () => {
    expect(
      reportResourceSchema.validate({ ...servedPreview, id: 'report-1' }).error
    ).toBeDefined()
  })

  it('rejects a nested key it does not list', () => {
    expect(
      reportResourceSchema.validate({
        ...servedPreview,
        source: { ...SUBMITTED_SOURCE, internal: true }
      }).error
    ).toBeDefined()
  })

  it('rejects entered figures on a preview', () => {
    expect(
      reportResourceSchema.validate({
        ...servedPreview,
        prn: { issuedTonnage: 120, totalRevenue: 10 }
      }).error
    ).toBeDefined()
  })

  it('is not a status a report can be stored with', () => {
    expect(Object.values(REPORT_STATUS)).not.toContain(PREVIEW_STATUS)
  })
})
