import { describe, expect, it, vi } from 'vitest'

import {
  diagnoseReportRow,
  findUnexportedTonnageReports,
  findReviewableReportRows,
  formatUnexportedTonnageFinding,
  largestUnexportedTonnageDeltas,
  summariseUnexportedTonnageByMonth,
  summariseUnexportedTonnageByStatus,
  summariseUnexportedTonnageFindings
} from './unexported-tonnage.js'

/**
 * @import { PeriodicReport } from '#reports/repository/port.js'
 * @import { WasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
 * @import { UnexportedTonnageFinding, ReviewableReportRow } from './unexported-tonnage.js'
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
 * @param {Partial<ReviewableReportRow>} [overrides]
 * @returns {ReviewableReportRow}
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
  storedUnexported: 0,
  ...overrides
})

const FEB_2026_IDENTITY = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  reportId: 'report-1',
  year: 2026,
  period: 2,
  reportStatus: 'submitted'
}

/**
 * @param {Partial<UnexportedTonnageFinding>} [overrides]
 * @returns {UnexportedTonnageFinding}
 */
const mismatch = (overrides = {}) =>
  /** @type {UnexportedTonnageFinding} */ ({
    kind: 'mismatch',
    ...FEB_2026_IDENTITY,
    stored: 0,
    recomputed: 0,
    delta: 0,
    rowsInPeriod: 1,
    rowsUnexported: 1,
    rowsOverExported: 0,
    ...overrides
  })

describe('unexported-tonnage', () => {
  describe('findReviewableReportRows', () => {
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

    it('includes a submitted monthly report with a calculated unexported tonnage', () => {
      const rows = findReviewableReportRows([basePeriodicReport()])

      expect(rows).toStrictEqual([buildRow()])
    })

    it.each([['in_progress'], ['ready_to_submit']])(
      'includes a %s monthly report',
      (status) => {
        const rows = findReviewableReportRows([
          basePeriodicReport({
            current: {
              id: 'report-1',
              status,
              exportActivity: { tonnageReceivedNotExported: 5 }
            }
          })
        ])

        expect(rows).toStrictEqual([
          buildRow({ reportStatus: status, storedUnexported: 5 })
        ])
      }
    )

    it('excludes a registered-only exporter, whose figure is entered by hand and stored as null', () => {
      const rows = findReviewableReportRows([
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
      const rows = findReviewableReportRows([
        basePeriodicReport({
          current: { id: 'report-1', status: 'submitted' }
        })
      ])

      expect(rows).toStrictEqual([])
    })

    it('excludes a report in a status the fix would never regenerate', () => {
      const rows = findReviewableReportRows([
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
      const rows = findReviewableReportRows([
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

      expect(findReviewableReportRows([periodicReport])).toStrictEqual([])
    })
  })

  describe('diagnoseReportRow', () => {
    const diagnoseWithRows = (row, states) => diagnoseReportRow(row, { states })

    it('reports a mismatch when a received load has no exported tonnage', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 29.19 })
      ])

      expect(finding).toStrictEqual(
        mismatch({ recomputed: 29.19, delta: 29.19 })
      )
    })

    it('reports the unexported remainder of a partly exported load', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 10,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 6
        })
      ])

      expect(finding).toStrictEqual(mismatch({ recomputed: 4, delta: 4 }))
    })

    it('returns nothing when a fully exported load already agrees with the stored zero', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 10,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 10
        })
      ])

      expect(finding).toBeNull()
    })

    it('clamps a row exporting more than it received rather than crediting it back', () => {
      const finding = diagnoseWithRows(buildRow({ storedUnexported: 5 }), [
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 10,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 12
        }),
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 8,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5
        })
      ])

      expect(finding).toStrictEqual(
        mismatch({
          stored: 5,
          recomputed: 3,
          delta: -2,
          rowsInPeriod: 2,
          rowsUnexported: 1,
          rowsOverExported: 1
        })
      )
    })

    it('counts the rows behind the figure, so the scale of a backfill is visible', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 10 }),
        buildReceivedRow({
          TONNAGE_RECEIVED_FOR_EXPORT: 8,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8
        }),
        buildReceivedRow({
          DATE_RECEIVED_FOR_EXPORT: '2026-03-02',
          TONNAGE_RECEIVED_FOR_EXPORT: 4
        })
      ])

      expect(finding).toStrictEqual(
        mismatch({
          recomputed: 10,
          delta: 10,
          rowsInPeriod: 2,
          rowsUnexported: 1,
          rowsOverExported: 0
        })
      )
    })

    it('counts a load whose export date falls inside the period, which the live calc drops', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({
          DATE_OF_EXPORT: '2026-02-16',
          TONNAGE_RECEIVED_FOR_EXPORT: 29.19
        })
      ])

      expect(finding).toStrictEqual(
        mismatch({ recomputed: 29.19, delta: 29.19 })
      )
    })

    it('ignores loads received outside the reporting period', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({
          DATE_RECEIVED_FOR_EXPORT: '2026-03-02',
          TONNAGE_RECEIVED_FOR_EXPORT: 29.19
        })
      ])

      expect(finding).toBeNull()
    })

    it('reports a negative delta when the stored figure overstates what is on site', () => {
      const finding = diagnoseWithRows(buildRow({ storedUnexported: 30 }), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 29.19 })
      ])

      expect(finding).toStrictEqual(
        mismatch({ stored: 30, recomputed: 29.19, delta: -0.81 })
      )
    })

    it('marks a report whose source rows could not be resolved, saying why', () => {
      const finding = diagnoseReportRow(buildRow(), {
        unresolved: 'no source summary log recorded on the report'
      })

      expect(finding).toStrictEqual({
        kind: 'source-missing',
        ...FEB_2026_IDENTITY,
        reason: 'no source summary log recorded on the report'
      })
    })

    it('distinguishes rows that were never recorded from rows that could not be found', () => {
      const finding = diagnoseReportRow(buildRow(), {
        unresolved: 'no rows found under the registration ledgers'
      })

      expect(finding).toStrictEqual({
        kind: 'source-missing',
        ...FEB_2026_IDENTITY,
        reason: 'no rows found under the registration ledgers'
      })
    })

    it('marks a report whose row data cannot be read as a tonnage', () => {
      const finding = diagnoseWithRows(buildRow(), [
        buildReceivedRow({ TONNAGE_RECEIVED_FOR_EXPORT: 1.234 })
      ])

      expect(finding).toStrictEqual({
        kind: 'recompute-failed',
        ...FEB_2026_IDENTITY,
        reason: expect.stringContaining('two decimal places')
      })
    })
  })

  describe('formatUnexportedTonnageFinding', () => {
    it('renders a mismatch as one reviewable line, with the rows behind it', () => {
      const line = formatUnexportedTonnageFinding(
        mismatch({
          recomputed: 29.19,
          delta: 29.19,
          rowsInPeriod: 3,
          rowsUnexported: 2,
          rowsOverExported: 1
        })
      )

      expect(line).toBe(
        'Unexported tonnage mismatch: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - stored 0, recomputed 29.19, ' +
          'delta 29.19, rows 3 in period / 2 unexported / 1 over-exported'
      )
    })

    it('renders a source-missing finding with the cause that made it unresolvable', () => {
      const line = formatUnexportedTonnageFinding({
        kind: 'source-missing',
        ...FEB_2026_IDENTITY,
        reason: 'no source summary log recorded on the report'
      })

      expect(line).toBe(
        'Unexported tonnage source-missing: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - ' +
          'no source summary log recorded on the report'
      )
    })

    it('renders a lookup-failed finding with the error that stopped it', () => {
      const line = formatUnexportedTonnageFinding({
        kind: 'lookup-failed',
        ...FEB_2026_IDENTITY,
        reason: 'Report not found: report-1'
      })

      expect(line).toBe(
        'Unexported tonnage lookup-failed: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - Report not found: report-1'
      )
    })

    it('renders a recompute-failed finding with its reason', () => {
      const line = formatUnexportedTonnageFinding({
        kind: 'recompute-failed',
        ...FEB_2026_IDENTITY,
        reason: 'Value is not a tonnage held to two decimal places: 1.234'
      })

      expect(line).toBe(
        'Unexported tonnage recompute-failed: org org-1 / registration reg-1, ' +
          'report report-1 (Feb 2026, submitted) - ' +
          'Value is not a tonnage held to two decimal places: 1.234'
      )
    })
  })

  describe('summariseUnexportedTonnageFindings', () => {
    const mismatchOf = (organisationId, registrationId, delta, rows = {}) => ({
      kind: 'mismatch',
      organisationId,
      registrationId,
      delta,
      rowsInPeriod: 1,
      rowsUnexported: 1,
      rowsOverExported: 0,
      ...rows
    })

    const SPREAD_OF_FINDINGS = /** @type {UnexportedTonnageFinding[]} */ (
      /** @type {unknown} */ ([
        mismatchOf('org-1', 'reg-1', 29.19, {
          rowsInPeriod: 4,
          rowsUnexported: 3,
          rowsOverExported: 1
        }),
        mismatchOf('org-1', 'reg-2', -0.81),
        mismatchOf('org-2', 'reg-3', 4, {
          rowsInPeriod: 2,
          rowsUnexported: 2
        }),
        {
          kind: 'source-missing',
          organisationId: 'org-3',
          registrationId: 'reg-4'
        },
        {
          kind: 'recompute-failed',
          organisationId: 'org-4',
          registrationId: 'reg-5'
        },
        {
          kind: 'lookup-failed',
          organisationId: 'org-5',
          registrationId: 'reg-6'
        }
      ])
    )

    it('splits findings by kind and totals the correctable delta', () => {
      const summary = summariseUnexportedTonnageFindings(SPREAD_OF_FINDINGS)

      expect(summary).toStrictEqual({
        mismatches: 3,
        sourceMissing: 1,
        recomputeFailed: 1,
        lookupFailed: 1,
        affectedExporters: 3,
        affectedOrganisations: 2,
        unresolvedExporters: 3,
        rowsInPeriod: 7,
        rowsUnexported: 6,
        rowsOverExported: 1,
        totalDelta: 32.38,
        totalUnderstated: 33.19,
        totalOverstated: 0.81
      })
    })

    it('counts an exporter once however many of its reports are wrong', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          mismatchOf('org-1', 'reg-1', 5),
          mismatchOf('org-1', 'reg-1', 7)
        ])
      )

      const { affectedExporters, affectedOrganisations } =
        summariseUnexportedTonnageFindings(findings)

      expect({ affectedExporters, affectedOrganisations }).toStrictEqual({
        affectedExporters: 1,
        affectedOrganisations: 1
      })
    })

    it('keeps an exporter whose rows could not be resolved out of the affected count', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          {
            kind: 'source-missing',
            organisationId: 'org-1',
            registrationId: 'reg-1'
          }
        ])
      )

      const { affectedExporters, affectedOrganisations, unresolvedExporters } =
        summariseUnexportedTonnageFindings(findings)

      expect({
        affectedExporters,
        affectedOrganisations,
        unresolvedExporters
      }).toStrictEqual({
        affectedExporters: 0,
        affectedOrganisations: 0,
        unresolvedExporters: 1
      })
    })
  })

  describe('summariseUnexportedTonnageByMonth', () => {
    const mismatchIn = (year, period, delta) => ({
      kind: 'mismatch',
      year,
      period,
      delta
    })

    it('totals the delta for each month a mismatch falls in, oldest first', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          mismatchIn(2026, 3, 29.19),
          mismatchIn(2025, 12, 4),
          mismatchIn(2026, 3, 0.81)
        ])
      )

      expect(summariseUnexportedTonnageByMonth(findings)).toStrictEqual([
        {
          month: 'Dec 2025',
          reports: 1,
          delta: 4,
          understated: 4,
          overstated: 0
        },
        {
          month: 'Mar 2026',
          reports: 2,
          delta: 30,
          understated: 30,
          overstated: 0
        }
      ])
    })

    it('splits a month understated and overstated, so opposing reports do not cancel out of sight', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          mismatchIn(2026, 3, 29.19),
          mismatchIn(2026, 3, -29.19)
        ])
      )

      expect(summariseUnexportedTonnageByMonth(findings)).toStrictEqual([
        {
          month: 'Mar 2026',
          reports: 2,
          delta: 0,
          understated: 29.19,
          overstated: 29.19
        }
      ])
    })

    it('ignores findings with no figure to total', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          { kind: 'source-missing', year: 2026, period: 3 },
          { kind: 'recompute-failed', year: 2026, period: 3 }
        ])
      )

      expect(summariseUnexportedTonnageByMonth(findings)).toStrictEqual([])
    })
  })

  describe('summariseUnexportedTonnageByStatus', () => {
    const mismatchWith = (reportStatus) => ({ kind: 'mismatch', reportStatus })

    it('separates the reports already in front of a regulator from the drafts', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          mismatchWith('submitted'),
          mismatchWith('submitted'),
          mismatchWith('ready_to_submit'),
          mismatchWith('in_progress')
        ])
      )

      expect(summariseUnexportedTonnageByStatus(findings)).toStrictEqual({
        submitted: 2,
        ready_to_submit: 1,
        in_progress: 1
      })
    })

    it('reports every status even when nothing sits in it', () => {
      expect(summariseUnexportedTonnageByStatus([])).toStrictEqual({
        submitted: 0,
        ready_to_submit: 0,
        in_progress: 0
      })
    })

    it('counts only the mismatches, since a draft that cannot be recomputed is not resubmittable either way', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          { kind: 'source-missing', reportStatus: 'submitted' }
        ])
      )

      expect(summariseUnexportedTonnageByStatus(findings)).toStrictEqual({
        submitted: 0,
        ready_to_submit: 0,
        in_progress: 0
      })
    })
  })

  describe('largestUnexportedTonnageDeltas', () => {
    const mismatchOf = (reportId, delta) => ({
      kind: 'mismatch',
      reportId,
      year: 2026,
      period: 2,
      delta
    })

    it('ranks by the size of the correction, not its direction', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([
          mismatchOf('report-1', 4),
          mismatchOf('report-2', -29.19),
          mismatchOf('report-3', 10)
        ])
      )

      expect(largestUnexportedTonnageDeltas(findings, 2)).toStrictEqual([
        { reportId: 'report-2', month: 'Feb 2026', delta: -29.19 },
        { reportId: 'report-3', month: 'Feb 2026', delta: 10 }
      ])
    })

    it('returns everything it has when fewer mismatches than the limit', () => {
      const findings = /** @type {UnexportedTonnageFinding[]} */ (
        /** @type {unknown} */ ([mismatchOf('report-1', 4)])
      )

      expect(largestUnexportedTonnageDeltas(findings, 5)).toStrictEqual([
        { reportId: 'report-1', month: 'Feb 2026', delta: 4 }
      ])
    })
  })

  describe('findUnexportedTonnageReports', () => {
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
      registration = /** @type {{ accreditationId: string } | null} */ ({
        accreditationId: 'acc-1'
      }),
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
      findUnexportedTonnageReports(
        /** @type {Parameters<typeof findUnexportedTonnageReports>[0]} */ (
          /** @type {unknown} */ (deps)
        )
      )

    it('reports a mismatch against the rows the report was built from', async () => {
      const result = await scan(buildDeps())

      expect(result).toStrictEqual({
        scanned: 1,
        findings: [mismatch({ recomputed: 12, delta: 12 })]
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
      expect(findings).toStrictEqual([mismatch({ recomputed: 12, delta: 12 })])
    })

    it('marks a report that records no source summary log', async () => {
      const { findings } = await scan(
        buildDeps({
          report: { id: 'report-1', source: { summaryLogId: null } }
        })
      )

      expect(findings).toStrictEqual([
        {
          kind: 'source-missing',
          ...FEB_2026_IDENTITY,
          reason: 'no source summary log recorded on the report'
        }
      ])
    })

    it('marks a report whose source rows no longer exist', async () => {
      const { findings } = await scan(buildDeps({ rowStates: [] }))

      expect(findings).toStrictEqual([
        {
          kind: 'source-missing',
          ...FEB_2026_IDENTITY,
          reason: 'no rows found under the registration ledgers'
        }
      ])
    })

    it('reports a failed registration lookup as a failure, not as absent data', async () => {
      const deps = buildDeps()
      deps.organisationsRepository.findRegistrationById.mockRejectedValue(
        new Error('connection timed out')
      )

      const { findings } = await scan(deps)

      expect(findings).toStrictEqual([
        {
          kind: 'lookup-failed',
          ...FEB_2026_IDENTITY,
          reason: 'connection timed out'
        }
      ])
    })

    it('reports a deleted report as a failure rather than abandoning the scan', async () => {
      const deps = buildDeps({
        periodicReports: [
          submittedFebReport(0),
          {
            ...submittedFebReport(0),
            organisationId: 'org-2',
            registrationId: 'reg-2'
          }
        ]
      })
      deps.reportsRepository.findReportById.mockRejectedValueOnce(
        new Error('Report not found: report-1')
      )

      const { scanned, findings } = await scan(deps)

      expect({ scanned, findings }).toStrictEqual({
        scanned: 2,
        findings: [
          {
            kind: 'lookup-failed',
            ...FEB_2026_IDENTITY,
            reason: 'Report not found: report-1'
          },
          mismatch({
            organisationId: 'org-2',
            registrationId: 'reg-2',
            recomputed: 12,
            delta: 12
          })
        ]
      })
    })

    it('counts every scanned report even when none is wrong', async () => {
      const result = await scan(
        buildDeps({ periodicReports: [submittedFebReport(12)] })
      )

      expect(result).toStrictEqual({ scanned: 1, findings: [] })
    })
  })
})
