import { describe, expect, it, vi } from 'vitest'

import {
  findOverExportedLoads,
  formatOverExportedLoadsFinding,
  largestOverExportedLoads,
  summariseOverExportedLoadsByMonth,
  summariseOverExportedLoadsFindings
} from './over-exported-loads.js'

const receivedRow = (
  rowId,
  received,
  exported,
  dateReceived = '2026-02-11'
) => ({
  rowId,
  wasteRecordType: 'RECEIVED',
  processingType: 'EXPORTER',
  data: {
    DATE_RECEIVED_FOR_EXPORT: dateReceived,
    TONNAGE_RECEIVED_FOR_EXPORT: received,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: exported
  }
})

const monthlyReport = ({
  organisationId = 'org-1',
  registrationId = 'reg-1',
  reportId = 'report-1',
  period = 2,
  startDate = '2026-02-01',
  endDate = '2026-02-28'
} = {}) => ({
  organisationId,
  registrationId,
  year: 2026,
  reports: {
    monthly: {
      [period]: {
        startDate,
        endDate,
        current: {
          id: reportId,
          status: 'submitted',
          exportActivity: { tonnageReceivedNotExported: 0 }
        },
        previousSubmissions: []
      }
    }
  }
})

const estate = (periodicReports, rowStates) => ({
  reportsRepository: {
    findAllPeriodicReports: vi.fn().mockResolvedValue(periodicReports),
    findReportById: vi.fn().mockImplementation(async (reportId) => ({
      id: reportId,
      source: { summaryLogId: 'log-1' }
    }))
  },
  organisationsRepository: {
    findRegistrationById: vi.fn().mockResolvedValue({ accreditationId: null })
  },
  summaryLogRowStatesRepository: {
    findRowStatesForSummaryLog: vi.fn().mockResolvedValue(rowStates)
  }
})

describe('overExportedLoads', () => {
  describe('findOverExportedLoads', () => {
    it('finds a load exporting more than it received', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])

      const { scanned, findings } = await findOverExportedLoads(deps)

      expect(scanned).toBe(1)
      expect(findings).toStrictEqual([
        {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          reportId: 'report-1',
          year: 2026,
          period: 2,
          reportStatus: 'submitted',
          loads: [{ rowId: 'row-1', received: 10, exported: 12, overshoot: 2 }],
          totalOvershoot: 2
        }
      ])
    })

    it('reports nothing for a load exporting exactly what it received', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 10)])

      const { findings } = await findOverExportedLoads(deps)

      expect(findings).toStrictEqual([])
    })

    it('reports nothing for a load exporting less than it received', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 6)])

      const { findings } = await findOverExportedLoads(deps)

      expect(findings).toStrictEqual([])
    })

    it('ignores a load with no received tonnage, which is a different defect', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', null, 7)])

      const { findings } = await findOverExportedLoads(deps)

      expect(findings).toStrictEqual([])
    })

    it('ignores a load received outside the reporting period', async () => {
      const deps = estate(
        [monthlyReport()],
        [receivedRow('row-1', 10, 12, '2026-03-04')]
      )

      const { findings } = await findOverExportedLoads(deps)

      expect(findings).toStrictEqual([])
    })

    it('totals the overshoot across every over-exported load on a report', async () => {
      const deps = estate(
        [monthlyReport()],
        [
          receivedRow('row-1', 10, 12),
          receivedRow('row-2', 5, 5),
          receivedRow('row-3', 8, 11.5)
        ]
      )

      const { findings } = await findOverExportedLoads(deps)

      expect(findings[0].loads).toHaveLength(2)
      expect(findings[0].totalOvershoot).toBe(5.5)
    })

    it('scans on past a report whose rows cannot be read, rather than losing the run', async () => {
      const deps = estate(
        [
          monthlyReport(),
          monthlyReport({ reportId: 'report-2', registrationId: 'reg-2' })
        ],
        [receivedRow('row-1', 10, 12)]
      )
      deps.reportsRepository.findReportById.mockRejectedValueOnce(
        new Error('Report not found: report-1')
      )

      const { scanned, findings } = await findOverExportedLoads(deps)

      expect(scanned).toBe(2)
      expect(findings.map(({ reportId }) => reportId)).toStrictEqual([
        'report-2'
      ])
    })

    it('reports nothing for a report with no source summary log', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.reportsRepository.findReportById.mockResolvedValue({
        id: 'report-1',
        source: { summaryLogId: null }
      })

      const { findings } = await findOverExportedLoads(deps)

      expect(findings).toStrictEqual([])
    })
  })

  describe('formatOverExportedLoadsFinding', () => {
    it('names the report, its loads and the overshoot', async () => {
      const deps = estate(
        [monthlyReport()],
        [receivedRow('row-1', 10, 12), receivedRow('row-2', 8, 11.5)]
      )
      const { findings } = await findOverExportedLoads(deps)

      expect(formatOverExportedLoadsFinding(findings[0])).toBe(
        'Over-exported loads: org org-1 / registration reg-1, report report-1 ' +
          '(Feb 2026, submitted) - 2 load(s), overshoot 5.5 ' +
          '(row-1 received 10 exported 12; row-2 received 8 exported 11.5)'
      )
    })
  })

  describe('summariseOverExportedLoadsFindings', () => {
    it('counts the reports, loads, exporters and organisations behind them', async () => {
      const deps = estate(
        [
          monthlyReport(),
          monthlyReport({ reportId: 'report-2' }),
          monthlyReport({
            organisationId: 'org-2',
            registrationId: 'reg-2',
            reportId: 'report-3'
          })
        ],
        [receivedRow('row-1', 10, 12)]
      )
      const { findings } = await findOverExportedLoads(deps)

      expect(summariseOverExportedLoadsFindings(findings)).toStrictEqual({
        reports: 3,
        loads: 3,
        exporters: 2,
        organisations: 2,
        totalOvershoot: 6
      })
    })

    it('reports zeroes when nothing is over-exported', () => {
      expect(summariseOverExportedLoadsFindings([])).toStrictEqual({
        reports: 0,
        loads: 0,
        exporters: 0,
        organisations: 0,
        totalOvershoot: 0
      })
    })
  })

  describe('summariseOverExportedLoadsByMonth', () => {
    it('groups the overshoot by the month each report covers', async () => {
      const deps = estate(
        [
          monthlyReport(),
          monthlyReport({
            reportId: 'report-2',
            period: 3,
            startDate: '2026-03-01',
            endDate: '2026-03-31'
          })
        ],
        [receivedRow('row-1', 10, 12), receivedRow('row-2', 4, 9, '2026-03-09')]
      )
      const { findings } = await findOverExportedLoads(deps)

      expect(summariseOverExportedLoadsByMonth(findings)).toStrictEqual([
        { month: 'Feb 2026', reports: 1, loads: 1, overshoot: 2 },
        { month: 'Mar 2026', reports: 1, loads: 1, overshoot: 5 }
      ])
    })
  })

  describe('largestOverExportedLoads', () => {
    it('returns the biggest overshoots first, limited to the count asked for', async () => {
      const deps = estate(
        [monthlyReport()],
        [
          receivedRow('row-1', 10, 12),
          receivedRow('row-2', 1, 20),
          receivedRow('row-3', 8, 11.5)
        ]
      )
      const { findings } = await findOverExportedLoads(deps)

      expect(largestOverExportedLoads(findings, 2)).toStrictEqual([
        { reportId: 'report-1', rowId: 'row-2', overshoot: 19 },
        { reportId: 'report-1', rowId: 'row-3', overshoot: 3.5 }
      ])
    })
  })
})
