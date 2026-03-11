import { describe, expect, it } from 'vitest'
import { discoverPeriods } from './discover-periods.js'
import { MONTHLY, QUARTERLY } from './cadence.js'

const record = (type, data) => ({ type, data })

describe('discoverPeriods', () => {
  describe('monthly cadence', () => {
    it('derives period from month of date', () => {
      const records = [
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2026-01-15' })
      ]

      expect(discoverPeriods(records, 'EXPORTER', MONTHLY)).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        }
      ])
    })

    it('returns distinct periods for different months', () => {
      const records = [
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2026-01-15' }),
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2026-03-10' })
      ]

      expect(discoverPeriods(records, 'EXPORTER', MONTHLY)).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        },
        {
          year: 2026,
          period: 3,
          startDate: '2026-03-01',
          endDate: '2026-03-31'
        }
      ])
    })

    it('handles December correctly', () => {
      const records = [
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2026-12-25' })
      ]

      expect(discoverPeriods(records, 'EXPORTER', MONTHLY)).toStrictEqual([
        {
          year: 2026,
          period: 12,
          startDate: '2026-12-01',
          endDate: '2026-12-31'
        }
      ])
    })
  })

  describe('quarterly cadence', () => {
    it('groups dates within same quarter into one period', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-03-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      ])
    })

    it('returns distinct periods for different quarters', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-07-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        },
        {
          year: 2026,
          period: 3,
          startDate: '2026-07-01',
          endDate: '2026-09-30'
        }
      ])
    })
  })

  describe('date extraction', () => {
    it('extracts multiple dates from a single EXPORTER exported record', () => {
      const records = [
        record('exported', {
          DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
          DATE_OF_EXPORT: '2026-02-20'
        })
      ]

      expect(discoverPeriods(records, 'EXPORTER', MONTHLY)).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        },
        {
          year: 2026,
          period: 2,
          startDate: '2026-02-01',
          endDate: '2026-02-28'
        }
      ])
    })

    it('handles ISO dates with time component', () => {
      const records = [
        record('received', {
          MONTH_RECEIVED_FOR_EXPORT: '2026-05-01T00:00:00.000Z'
        })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 2,
          startDate: '2026-04-01',
          endDate: '2026-06-30'
        }
      ])
    })

    it('extracts dates across all waste record types', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }),
        record('exported', { DATE_OF_EXPORT: '2026-04-10' }),
        record('sentOn', { DATE_LOAD_LEFT_SITE: '2026-07-20' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        },
        {
          year: 2026,
          period: 2,
          startDate: '2026-04-01',
          endDate: '2026-06-30'
        },
        {
          year: 2026,
          period: 3,
          startDate: '2026-07-01',
          endDate: '2026-09-30'
        }
      ])
    })

    it('extracts dates from REPROCESSOR received records', () => {
      const records = [
        record('received', { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-10' })
      ]

      expect(discoverPeriods(records, 'REPROCESSOR', MONTHLY)).toStrictEqual([
        {
          year: 2026,
          period: 2,
          startDate: '2026-02-01',
          endDate: '2026-02-28'
        }
      ])
    })

    it('extracts dates from REPROCESSOR_REGISTERED_ONLY received records', () => {
      const records = [
        record('received', {
          MONTH_RECEIVED_FOR_REPROCESSING: '2026-04-01'
        })
      ]

      expect(
        discoverPeriods(records, 'REPROCESSOR_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 2,
          startDate: '2026-04-01',
          endDate: '2026-06-30'
        }
      ])
    })
  })

  describe('empty and missing data', () => {
    it('returns empty array for empty records array', () => {
      expect(
        discoverPeriods([], 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([])
    })

    it.each([
      { scenario: 'missing date field', data: { SOME_OTHER_FIELD: 'value' } },
      { scenario: 'empty string', data: { MONTH_RECEIVED_FOR_EXPORT: '' } },
      { scenario: 'null value', data: { MONTH_RECEIVED_FOR_EXPORT: null } },
      {
        scenario: 'non-string value',
        data: { MONTH_RECEIVED_FOR_EXPORT: new Date('2026-01-01') }
      },
      {
        scenario: 'invalid date string',
        data: { MONTH_RECEIVED_FOR_EXPORT: 'not-a-date' }
      }
    ])('skips record with $scenario', ({ data }) => {
      const records = [record('received', data)]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([])
    })

    it('returns valid periods while skipping invalid records', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-04-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        },
        {
          year: 2026,
          period: 2,
          startDate: '2026-04-01',
          endDate: '2026-06-30'
        }
      ])
    })

    it('skips records with unknown waste record type', () => {
      const records = [
        record('unknownType', { SOME_FIELD: '2026-01-15' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      ])
    })
  })

  describe('deduplication', () => {
    it('deduplicates periods from records in the same period', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-02-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      ])
    })

    it('deduplicates periods across different waste record types', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' }),
        record('sentOn', { DATE_LOAD_LEFT_SITE: '2026-02-15' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      ])
    })

    it('deduplicates periods from multiple date fields on same record', () => {
      const records = [
        record('exported', {
          DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
          DATE_OF_EXPORT: '2026-01-20'
        })
      ]

      expect(discoverPeriods(records, 'EXPORTER', MONTHLY)).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        }
      ])
    })
  })

  describe('year filtering', () => {
    it('filters periods to given year when option provided', () => {
      const records = [
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2025-12-10' }),
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2026-01-15' }),
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2026-03-10' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER', MONTHLY, { year: 2026 })
      ).toStrictEqual([
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        },
        {
          year: 2026,
          period: 3,
          startDate: '2026-03-01',
          endDate: '2026-03-31'
        }
      ])
    })

    it('returns empty when no periods match year filter', () => {
      const records = [
        record('exported', { DATE_RECEIVED_FOR_EXPORT: '2025-12-10' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER', MONTHLY, { year: 2026 })
      ).toStrictEqual([])
    })

    it('returns periods from all years when no year option', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2025-10-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2025,
          period: 4,
          startDate: '2025-10-01',
          endDate: '2025-12-31'
        },
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      ])
    })

    it('sorts periods chronologically across multiple years', () => {
      const records = [
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-07-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2025-01-01' }),
        record('received', { MONTH_RECEIVED_FOR_EXPORT: '2026-01-01' })
      ]

      expect(
        discoverPeriods(records, 'EXPORTER_REGISTERED_ONLY', QUARTERLY)
      ).toStrictEqual([
        {
          year: 2025,
          period: 1,
          startDate: '2025-01-01',
          endDate: '2025-03-31'
        },
        {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        },
        {
          year: 2026,
          period: 3,
          startDate: '2026-07-01',
          endDate: '2026-09-30'
        }
      ])
    })
  })

  describe('error handling', () => {
    it('throws for unknown operator category', () => {
      expect(() => {
        discoverPeriods([], 'UNKNOWN_TYPE', MONTHLY)
      }).toThrow()
    })
  })
})
