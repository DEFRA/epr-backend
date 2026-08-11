import { describe, expect, it, vi } from 'vitest'

import {
  findOverExportedLoads,
  formatOverExportedLoadsFinding,
  summariseOverExportedLoadsByMaterial,
  summariseOverExportedLoadsFindings
} from './over-exported-loads.js'
import { buildExporterRegistration } from './monitoring-test-helpers.js'

/**
 * @import { OverExportedLoadsFinding } from './over-exported-loads.js'
 */

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

/**
 * @param {{
 *   organisationId?: string,
 *   registrationId?: string,
 *   reportId?: string,
 *   period?: number,
 *   startDate?: string,
 *   endDate?: string,
 *   storedUnexported?: number | null
 * }} [options]
 */
const monthlyReport = ({
  organisationId = 'org-1',
  registrationId = 'reg-1',
  reportId = 'report-1',
  period = 2,
  startDate = '2026-02-01',
  endDate = '2026-02-28',
  storedUnexported = 0
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
          exportActivity: { tonnageReceivedNotExported: storedUnexported }
        },
        previousSubmissions: []
      }
    }
  }
})

/**
 * A finding as the scan produces one. The pure formatters and summarisers take
 * these directly, so their tests do not run the scan to build their input.
 *
 * @param {Partial<OverExportedLoadsFinding>} [overrides]
 * @returns {OverExportedLoadsFinding}
 */
const finding = (overrides = {}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  reportId: 'report-1',
  year: 2026,
  period: 2,
  reportStatus: 'submitted',
  material: 'plastic',
  loads: [{ rowId: 'row-1', received: 10, exported: 12, overshoot: 2 }],
  totalOvershoot: 2,
  net: -2,
  ...overrides
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
    findRegistrationById: vi.fn().mockResolvedValue(buildExporterRegistration())
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
          material: 'plastic',
          loads: [{ rowId: 'row-1', received: 10, exported: 12, overshoot: 2 }],
          totalOvershoot: 2,
          net: -2
        }
      ])
    })

    it('finds a load on a report carrying no stored unexported figure, which this scan never reads', async () => {
      const deps = estate(
        [monthlyReport({ storedUnexported: null })],
        [receivedRow('row-1', 10, 12)]
      )

      const { scanned, findings } = await findOverExportedLoads(deps)

      expect(scanned).toBe(1)
      expect(findings).toHaveLength(1)
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

      const { scanned, unreadable, findings } =
        await findOverExportedLoads(deps)

      expect(scanned).toBe(2)
      expect(unreadable).toStrictEqual([
        { reportId: 'report-1', reason: 'Report not found: report-1' }
      ])
      expect(findings.map(({ reportId }) => reportId)).toStrictEqual([
        'report-2'
      ])
    })

    it('records a report whose registration cannot be read as unreadable, without counting it in scope', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.organisationsRepository.findRegistrationById.mockRejectedValue(
        new Error('connection timed out')
      )

      const { scanned, unreadable, findings } =
        await findOverExportedLoads(deps)

      expect(scanned).toBe(0)
      expect(unreadable).toStrictEqual([
        { reportId: 'report-1', reason: 'connection timed out' }
      ])
      expect(findings).toStrictEqual([])
    })

    it('reports nothing unreadable when every report reads cleanly', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])

      const { unreadable } = await findOverExportedLoads(deps)

      expect(unreadable).toStrictEqual([])
    })

    it('does not scan a reprocessor', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.organisationsRepository.findRegistrationById.mockResolvedValue(
        buildExporterRegistration({ wasteProcessingType: 'reprocessor' })
      )

      const { scanned, findings } = await findOverExportedLoads(deps)

      expect(scanned).toBe(0)
      expect(findings).toStrictEqual([])
    })

    it('scans an exporter whose accreditation has since lapsed, because the report was made under it', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.organisationsRepository.findRegistrationById.mockResolvedValue(
        buildExporterRegistration({ accreditationStatus: 'cancelled' })
      )

      const { scanned, findings } = await findOverExportedLoads(deps)

      expect(scanned).toBe(1)
      expect(findings).toHaveLength(1)
    })

    it('records a report with no source summary log as unreadable, not as a clean scan', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.reportsRepository.findReportById.mockResolvedValue({
        id: 'report-1',
        source: { summaryLogId: null }
      })

      const { unreadable, findings } = await findOverExportedLoads(deps)

      expect(unreadable).toStrictEqual([
        {
          reportId: 'report-1',
          reason: 'no source summary log recorded on the report'
        }
      ])
      expect(findings).toStrictEqual([])
    })
  })

  describe('formatOverExportedLoadsFinding', () => {
    it('names the report, its loads and the overshoot', () => {
      const result = formatOverExportedLoadsFinding(
        finding({
          loads: [
            { rowId: 'row-1', received: 10, exported: 12, overshoot: 2 },
            { rowId: 'row-2', received: 8, exported: 11.5, overshoot: 3.5 }
          ],
          totalOvershoot: 5.5
        })
      )

      expect(result).toBe(
        'Over-exported loads: org org-1 / registration reg-1, report report-1 ' +
          '(Feb 2026, submitted) - 2 load(s), overshoot 5.5 ' +
          '(row-1 received 10 exported 12; row-2 received 8 exported 11.5)'
      )
    })

    it('lists at most five loads, so one report cannot outgrow the log pipeline', () => {
      const result = formatOverExportedLoadsFinding(
        finding({
          loads: Array.from({ length: 7 }, (_, index) => ({
            rowId: `row-${index + 1}`,
            received: 10,
            exported: 12,
            overshoot: 2
          })),
          totalOvershoot: 14
        })
      )

      expect(result).toBe(
        'Over-exported loads: org org-1 / registration reg-1, report report-1 ' +
          '(Feb 2026, submitted) - 7 load(s), overshoot 14 ' +
          '(row-1 received 10 exported 12; row-2 received 10 exported 12; ' +
          'row-3 received 10 exported 12; row-4 received 10 exported 12; ' +
          'row-5 received 10 exported 12; +2 more)'
      )
    })
  })

  describe('summariseOverExportedLoadsFindings', () => {
    it('counts the reports, loads, exporters and organisations behind them', () => {
      const findings = [
        finding(),
        finding({ reportId: 'report-2' }),
        finding({
          organisationId: 'org-2',
          registrationId: 'reg-2',
          reportId: 'report-3'
        })
      ]

      expect(summariseOverExportedLoadsFindings(findings)).toStrictEqual({
        reports: 3,
        loads: 3,
        exporters: 2,
        organisations: 2,
        masked: 0,
        totalOvershoot: 6
      })
    })

    it('reports zeroes when nothing is over-exported', () => {
      expect(summariseOverExportedLoadsFindings([])).toStrictEqual({
        reports: 0,
        loads: 0,
        exporters: 0,
        organisations: 0,
        masked: 0,
        totalOvershoot: 0
      })
    })
  })

  describe('masking', () => {
    it('computes the net across every load, so other loads can absorb an over-export', async () => {
      const deps = estate(
        [monthlyReport()],
        [receivedRow('row-1', 10, 12), receivedRow('row-2', 50, 10)]
      )

      const { findings } = await findOverExportedLoads(deps)

      expect(findings[0].net).toBe(38)
    })

    it.each([
      ['counts a log whose net stays positive as masked', 38, 1],
      ['does not count a log whose own net goes negative', -2, 0]
    ])('%s', (_case, net, masked) => {
      expect(
        summariseOverExportedLoadsFindings([finding({ net })]).masked
      ).toBe(masked)
    })

    it('counts a blank received tonnage against the net, which the over-export loads exclude', async () => {
      const deps = estate(
        [monthlyReport()],
        [receivedRow('row-1', 10, 12), receivedRow('row-2', null, 30)]
      )

      const { findings } = await findOverExportedLoads(deps)

      expect(findings[0].loads).toHaveLength(1)
      expect(findings[0].net).toBe(-32)
    })
  })

  describe('summariseOverExportedLoadsByMaterial', () => {
    it('sums the overshoot of the loads themselves into each material', () => {
      const findings = [finding(), finding({ reportId: 'report-2' })]

      expect(summariseOverExportedLoadsByMaterial(findings)).toStrictEqual([
        { material: 'plastic', loads: 2, exporters: 1, overshoot: 4 }
      ])
    })

    it('counts the over-exported loads in each material, which is the instance count', () => {
      const findings = [
        finding({
          loads: [
            { rowId: 'row-1', received: 10, exported: 12, overshoot: 2 },
            { rowId: 'row-2', received: 4, exported: 9, overshoot: 5 }
          ]
        }),
        finding({ material: 'wood', reportId: 'report-2' })
      ]

      expect(summariseOverExportedLoadsByMaterial(findings)).toStrictEqual([
        { material: 'plastic', loads: 2, exporters: 1, overshoot: 7 },
        { material: 'wood', loads: 1, exporters: 1, overshoot: 2 }
      ])
    })

    it('counts an exporter once per material however many of its reports are affected', () => {
      const findings = [
        finding(),
        finding({ reportId: 'report-2' }),
        finding({ registrationId: 'reg-2', reportId: 'report-3' })
      ]

      expect(summariseOverExportedLoadsByMaterial(findings)).toStrictEqual([
        { material: 'plastic', loads: 3, exporters: 2, overshoot: 6 }
      ])
    })

    it('splits the overshoot across materials, ordered by material', () => {
      const findings = [
        finding({ material: 'wood' }),
        finding({ material: 'glass', reportId: 'report-2' })
      ]

      expect(summariseOverExportedLoadsByMaterial(findings)).toStrictEqual([
        { material: 'glass', loads: 1, exporters: 1, overshoot: 2 },
        { material: 'wood', loads: 1, exporters: 1, overshoot: 2 }
      ])
    })

    it('splits glass by its recycling process, which the business reads separately', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.organisationsRepository.findRegistrationById.mockResolvedValue(
        buildExporterRegistration({
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        })
      )

      const { findings } = await findOverExportedLoads(deps)

      expect(summariseOverExportedLoadsByMaterial(findings)).toStrictEqual([
        { material: 'glass_re_melt', loads: 1, exporters: 1, overshoot: 2 }
      ])
    })

    it('groups a registration with no material under unknown', async () => {
      const deps = estate([monthlyReport()], [receivedRow('row-1', 10, 12)])
      deps.organisationsRepository.findRegistrationById.mockResolvedValue(
        buildExporterRegistration({ material: null })
      )

      const { findings } = await findOverExportedLoads(deps)

      expect(summariseOverExportedLoadsByMaterial(findings)).toStrictEqual([
        { material: 'unknown', loads: 1, exporters: 1, overshoot: 2 }
      ])
    })
  })
})
