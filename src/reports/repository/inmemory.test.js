import { describe, expect, it as base } from 'vitest'
import { createInMemoryReportsRepository } from './inmemory.js'
import { testReportsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  reportsRepository: async ({}, use) => {
    await use(createInMemoryReportsRepository())
  }
})

describe('In-memory reports repository', () => {
  it('creates a repository', ({ reportsRepository }) => {
    expect(reportsRepository).toBeDefined()
  })

  describe('reports repository contract', () => {
    testReportsRepositoryContract(it)
  })

  describe('backward compatibility with already-coerced report documents', () => {
    it('resolves the correct start/end-of-day boundary for a report persisted before the bare-date schema fix', async () => {
      const oldShapeReport = {
        id: 'legacy-report-1',
        version: 1,
        schemaVersion: 1,
        organisationId: '507f1f77bcf86cd799439011',
        registrationId: '507f1f77bcf86cd799439012',
        year: 2024,
        cadence: 'monthly',
        period: 1,
        submissionNumber: 1,
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-31T00:00:00.000Z',
        dueDate: '2024-02-15T00:00:00.000Z',
        prn: { issuedTonnage: 100 },
        status: {
          currentStatus: 'submitted',
          currentStatusAt: '2024-02-01T00:00:00.000Z',
          submitted: { at: '2024-02-01T00:00:00.000Z', by: { id: 'u' } },
          history: []
        }
      }

      const repository = createInMemoryReportsRepository(
        new Map([['legacy-report-1', oldShapeReport]])
      )()

      const [periodicReport] = await repository.findAllPeriodicReports()
      const slot =
        /** @type {NonNullable<typeof periodicReport.reports.monthly>} */ (
          periodicReport.reports.monthly
        )[1]

      expect(slot.startDate).toBe('2024-01-01')
      expect(slot.endDate).toBe('2024-01-31')
      expect(slot.dueDate).toBe('2024-02-15')
    })
  })
})
