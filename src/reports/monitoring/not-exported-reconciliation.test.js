import { describe, expect, it, vi } from 'vitest'

import {
  diagnoseReportRow,
  findNotExportedReconciliationReports,
  findReconcilableReportRows,
  formatNotExportedReconciliationFinding,
  summariseNotExportedReconciliation
} from './not-exported-reconciliation.js'

/**
 * @import { PeriodicReport } from '#reports/repository/port.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 * @import { NotExportedFinding, ReconcilableReportRow } from './not-exported-reconciliation.js'
 */

/**
 * @param {Record<string, unknown>} [data]
 * @returns {WasteRecordState}
 */
const buildReceivedRow = (data = {}) =>
  /** @type {WasteRecordState} */ (
    /** @type {unknown} */ ({
      rowId: 'row-1',
      wasteRecordType: 'RECEIVED',
      processingType: 'EXPORTER',
      data: {
        DATE_RECEIVED_FOR_EXPORT: '2026-02-11',
        TONNAGE_RECEIVED_FOR_EXPORT: 10,
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: null,
        ...data
      }
    })
  )

/**
 * @param {Partial<ReconcilableReportRow>} [overrides]
 * @returns {ReconcilableReportRow}
 */
const buildRow = (overrides = {}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  year: 2026,
  period: 2,
  startDate: '2026-02-01',
  endDate: '2026-02-28',
  reportId: 'report-1',
  reportStatus: 'submitted',
  storedNotExported: 0,
  ...overrides
})

const FEB_2026_IDENTITY = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  reportId: 'report-1',
  month: 'Feb 2026',
  reportStatus: 'submitted'
}

describe('not-exported-reconciliation', () => {
  describe('findReconcilableReportRows', () => {
    /**
     * @param {Record<string, unknown>} [monthlyOverrides]
     * @returns {PeriodicReport}
     */
    const basePeriodicReport = (monthlyOverrides = {}) =>
      /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            monthly: {
              2: {
                startDate: '2026-02-01',
                endDate: '2026-02-28',
                current: {
                  id: 'report-1',
                  status: 'submitted',
                  exportActivity: { tonnageReceivedNotExported: 0 }
                },
                previousSubmissions: [],
                ...monthlyOverrides
              }
            }
          }
        })
      )

    it('includes a submitted monthly report with a calculated not-exported figure', () => {
      const rows = findReconcilableReportRows([basePeriodicReport()])

      expect(rows).toStrictEqual([buildRow()])
    })

    it.each([['in_progress'], ['ready_to_submit']])(
      'includes a %s monthly report',
      (status) => {
        const rows = findReconcilableReportRows([
          basePeriodicReport({
            current: {
              id: 'report-1',
              status,
              exportActivity: { tonnageReceivedNotExported: 5 }
            }
          })
        ])

        expect(rows).toStrictEqual([
          buildRow({ reportStatus: status, storedNotExported: 5 })
        ])
      }
    )

    it('excludes a registered-only exporter, whose figure is entered by hand and stored as null', () => {
      const rows = findReconcilableReportRows([
        basePeriodicReport({
          current: {
            id: 'report-1',
            status: 'submitted',
            exportActivity: { tonnageReceivedNotExported: null }
          }
        })
      ])

      expect(rows).toStrictEqual([])
    })

    it('excludes a reprocessor, which has no export activity at all', () => {
      const rows = findReconcilableReportRows([
        basePeriodicReport({
          current: { id: 'report-1', status: 'submitted' }
        })
      ])

      expect(rows).toStrictEqual([])
    })

    it('excludes a report in a status the fix would never regenerate', () => {
      const rows = findReconcilableReportRows([
        basePeriodicReport({
          current: {
            id: 'report-1',
            status: 'deleted',
            exportActivity: { tonnageReceivedNotExported: 5 }
          }
        })
      ])

      expect(rows).toStrictEqual([])
    })

    it('excludes a period with no current report', () => {
      const rows = findReconcilableReportRows([
        basePeriodicReport({ current: null })
      ])

      expect(rows).toStrictEqual([])
    })

    it('ignores quarterly reports, which no accredited exporter produces', () => {
      const periodicReport = /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            quarterly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-03-31',
                current: {
                  id: 'report-1',
                  status: 'submitted',
                  exportActivity: { tonnageReceivedNotExported: 5 }
                },
                previousSubmissions: []
              }
            }
          }
        })
      )

      expect(findReconcilableReportRows([periodicReport])).toStrictEqual([])
    })
  })

  describe('diagnoseReportRow', () => {
    it('reports a mismatch when a received load has no exported tonnage', () => {
      const finding = diagnoseReportRow(buildRow(), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 29.19 })
      ])

      expect(finding).toStrictEqual({
        kind: 'mismatch',
        ...FEB_2026_IDENTITY,
        stored: 0,
        recomputed: 29.19,
        delta: 29.19
      })
    })

    it('reports the unexported remainder of a partly exported load', () => {
      const finding = diagnoseReportRow(buildRow(), [
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 10,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 6
        })
      ])

      expect(finding).toStrictEqual({
        kind: 'mismatch',
        ...FEB_2026_IDENTITY,
        stored: 0,
        recomputed: 4,
        delta: 4
      })
    })

    it('returns nothing when a fully exported load already agrees with the stored zero', () => {
      const finding = diagnoseReportRow(buildRow(), [
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 10,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 10
        })
      ])

      expect(finding).toBeNull()
    })

    it('clamps a row exporting more than it received rather than crediting it back', () => {
      const finding = diagnoseReportRow(buildRow({ storedNotExported: 5 }), [
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 10,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 12
        }),
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 8,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        })
      ])

      expect(finding).toStrictEqual({
        kind: 'mismatch',
        ...FEB_2026_IDENTITY,
        stored: 5,
        recomputed: 3,
        delta: -2
      })
    })

    it('counts a load whose export date falls inside the period, which the live calc drops', () => {
      const finding = diagnoseReportRow(buildRow(), [
        buildReceivedRow({
          DATE_OF_EXPORT: '2026-02-16',
          TONNAGE_RECEIVED_FOR_EXPORT: 29.19
        })
      ])

      expect(finding).toStrictEqual({
        kind: 'mismatch',
        ...FEB_2026_IDENTITY,
        stored: 0,
        recomputed: 29.19,
        delta: 29.19
      })
    })

    it('ignores loads received outside the reporting period', () => {
      const finding = diagnoseReportRow(buildRow(), [
        buildReceivedRow({
          DATE_RECEIVED_FOR_EXPORT: '2026-03-02',
          TONNAGE_RECEIVED_FOR_EXPORT: 29.19
        })
      ])

      expect(finding).toBeNull()
    })

    it('reports a negative delta when the stored figure overstates what is on site', () => {
      const finding = diagnoseReportRow(buildRow({ storedNotExported: 30 }), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 29.19 })
      ])

      expect(finding).toStrictEqual({
        kind: 'mismatch',
        ...FEB_2026_IDENTITY,
        stored: 30,
        recomputed: 29.19,
        delta: -0.81
      })
    })

    it('marks a report whose source rows could not be resolved', () => {
      const finding = diagnoseReportRow(buildRow(), null)

      expect(finding).toStrictEqual({
        kind: 'source-missing',
        ...FEB_2026_IDENTITY
      })
    })

    it('marks a report whose row data cannot be read as a tonnage', () => {
      const finding = diagnoseReportRow(buildRow(), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 1.234 })
      ])

      expect(finding).toStrictEqual({
        kind: 'recompute-failed',
        ...FEB_2026_IDENTITY,
        reason: expect.stringContaining('two decimal places')
      })
    })
  })

  describe('formatNotExportedReconciliationFinding', () => {
    it('renders a mismatch as one reviewable line', () => {
      const line = formatNotExportedReconciliationFinding({
        kind: 'mismatch',
        ...FEB_2026_IDENTITY,
        stored: 0,
        recomputed: 29.19,
        delta: 29.19
      })

      expect(line).toBe(
        'Not-exported reconciliation mismatch: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - stored 0, recomputed 29.19, delta 29.19'
      )
    })

    it('renders a source-missing finding as one reviewable line', () => {
      const line = formatNotExportedReconciliationFinding({
        kind: 'source-missing',
        ...FEB_2026_IDENTITY
      })

      expect(line).toBe(
        'Not-exported reconciliation source-missing: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - source rows could not be resolved, ' +
          'cannot recompute'
      )
    })

    it('renders a recompute-failed finding with its reason', () => {
      const line = formatNotExportedReconciliationFinding({
        kind: 'recompute-failed',
        ...FEB_2026_IDENTITY,
        reason: 'Value is not a tonnage held to two decimal places: 1.234'
      })

      expect(line).toBe(
        'Not-exported reconciliation recompute-failed: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - ' +
          'Value is not a tonnage held to two decimal places: 1.234'
      )
    })
  })

  describe('summariseNotExportedReconciliation', () => {
    it('splits findings by kind and totals the correctable delta', () => {
      const findings = /** @type {NotExportedFinding[]} */ (
        /** @type {unknown} */ ([
          { kind: 'mismatch', organisationId: 'org-1', delta: 29.19 },
          { kind: 'mismatch', organisationId: 'org-1', delta: -0.81 },
          { kind: 'mismatch', organisationId: 'org-2', delta: 4 },
          { kind: 'source-missing', organisationId: 'org-3' },
          { kind: 'recompute-failed', organisationId: 'org-4' }
        ])
      )

      const summary = summariseNotExportedReconciliation(findings)

      expect(summary).toStrictEqual({
        mismatches: 3,
        sourceMissing: 1,
        recomputeFailed: 1,
        affectedOrganisations: 4,
        totalDelta: 32.38
      })
    })
  })

  describe('findNotExportedReconciliationReports', () => {
    const submittedFebReport = (tonnageReceivedNotExported) => ({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      year: 2026,
      reports: {
        monthly: {
          2: {
            startDate: '2026-02-01',
            endDate: '2026-02-28',
            current: {
              id: 'report-1',
              status: 'submitted',
              exportActivity: { tonnageReceivedNotExported }
            },
            previousSubmissions: []
          }
        }
      }
    })

    const buildDeps = ({
      periodicReports = [submittedFebReport(0)],
      report = /** @type {{ id: string, source: { summaryLogId: string | null } }} */ ({
        id: 'report-1',
        source: { summaryLogId: 'log-1' }
      }),
      registration = { accreditationId: 'acc-1' },
      rowStates = [buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 12 })]
    } = {}) => ({
      reportsRepository: {
        findAllPeriodicReports: vi.fn().mockResolvedValue(periodicReports),
        findReportById: vi.fn().mockResolvedValue(report)
      },
      organisationsRepository: {
        findRegistrationById: vi.fn().mockResolvedValue(registration)
      },
      summaryLogRowStateRepository: {
        findRowStatesForSummaryLog: vi
          .fn()
          .mockImplementation(async ({ accreditationId }) =>
            accreditationId === (registration?.accreditationId ?? null)
              ? rowStates
              : []
          )
      }
    })

    /**
     * @param {ReturnType<typeof buildDeps>} deps
     */
    const scan = (deps) =>
      findNotExportedReconciliationReports(
        /** @type {Parameters<typeof findNotExportedReconciliationReports>[0]} */ (
          /** @type {unknown} */ (deps)
        )
      )

    it('reports a mismatch against the rows the report was built from', async () => {
      const result = await scan(buildDeps())

      expect(result).toStrictEqual({
        scanned: 1,
        findings: [
          {
            kind: 'mismatch',
            ...FEB_2026_IDENTITY,
            stored: 0,
            recomputed: 12,
            delta: 12
          }
        ]
      })
    })

    it('reads the rows at the summary log the report was built from, not the current head', async () => {
      const deps = buildDeps()

      await scan(deps)

      expect(
        deps.summaryLogRowStateRepository.findRowStatesForSummaryLog
      ).toHaveBeenCalledWith(
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          accreditationId: 'acc-1'
        },
        'log-1'
      )
    })

    it('also reads the registered-only ledger, so a registration that became accredited still resolves', async () => {
      const deps = buildDeps()

      await scan(deps)

      expect(
        deps.summaryLogRowStateRepository.findRowStatesForSummaryLog
      ).toHaveBeenCalledWith(
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          accreditationId: null
        },
        'log-1'
      )
    })

    it('resolves rows under the registered-only ledger alone when no accreditation is on the registration', async () => {
      const deps = buildDeps({ registration: null })

      const { findings } = await scan(deps)

      expect(
        deps.summaryLogRowStateRepository.findRowStatesForSummaryLog
      ).toHaveBeenCalledExactlyOnceWith(
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          accreditationId: null
        },
        'log-1'
      )
      expect(findings).toStrictEqual([
        {
          kind: 'mismatch',
          ...FEB_2026_IDENTITY,
          stored: 0,
          recomputed: 12,
          delta: 12
        }
      ])
    })

    it('marks a report that records no source summary log', async () => {
      const { findings } = await scan(
        buildDeps({
          report: { id: 'report-1', source: { summaryLogId: null } }
        })
      )

      expect(findings).toStrictEqual([
        { kind: 'source-missing', ...FEB_2026_IDENTITY }
      ])
    })

    it('marks a report whose source rows no longer exist', async () => {
      const { findings } = await scan(buildDeps({ rowStates: [] }))

      expect(findings).toStrictEqual([
        { kind: 'source-missing', ...FEB_2026_IDENTITY }
      ])
    })

    it('marks a report whose registration can no longer be looked up', async () => {
      const deps = buildDeps()
      deps.organisationsRepository.findRegistrationById.mockRejectedValue(
        new Error('gone')
      )

      const { findings } = await scan(deps)

      expect(findings).toStrictEqual([
        { kind: 'source-missing', ...FEB_2026_IDENTITY }
      ])
    })

    it('counts every scanned report even when none is wrong', async () => {
      const result = await scan(
        buildDeps({ periodicReports: [submittedFebReport(12)] })
      )

      expect(result).toStrictEqual({ scanned: 1, findings: [] })
    })
  })
})
