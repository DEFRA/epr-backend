import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { yearCalendar } from './report-calendar.js'

/**
 * @import { Registration, StatusTimeline } from '#organisation-read-model/domain/model.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * @param {string} status
 * @returns {(date: string) => StatusTimeline[number]}
 */
const changeTo = (status) => (date) => ({ status, at: `${date}T00:00:00.000Z` })

const approvedOn = changeTo('approved')
const suspendedOn = changeTo('suspended')
const cancelledOn = changeTo('cancelled')

const AFTER_YEAR_END = new Date('2027-01-02T12:00:00Z')

/**
 * @param {StatusTimeline} [accreditation]
 * @returns {Registration}
 */
const registeredSinceLastYear = (accreditation) =>
  /** @type {Registration} */ (
    /** @type {unknown} */ ({
      status: { timeline: [approvedOn('2025-06-02')] },
      accreditations: accreditation
        ? {
            2026: {
              accreditationNumber: 'ACC-2026',
              status: { timeline: accreditation }
            }
          }
        : {}
    })
  )

/**
 * @param {{
 *   registration: Registration,
 *   storedReports?: PeriodicReport[],
 *   now?: Date
 * }} params
 */
const calendar = ({ registration, storedReports = [], now = AFTER_YEAR_END }) =>
  yearCalendar({ registration, storedReports, year: 2026, now })

/**
 * @param {{ period: number, startDate: string, endDate: string }[] | undefined} periods
 */
const spans = (periods = []) =>
  periods.map(({ period, startDate, endDate }) => ({
    period,
    startDate,
    endDate
  }))

/**
 * @param {{ period: number }[] | undefined} periods
 */
const periodNumbers = (periods = []) => periods.map(({ period }) => period)

describe('yearCalendar', () => {
  it('owes a part quarter and a part month when accredited mid-quarter', () => {
    const result = calendar({
      registration: registeredSinceLastYear([approvedOn('2026-02-15')])
    })

    expect(spans(result.registeredOnly?.reportingPeriods)).toEqual([
      { period: 1, startDate: '2026-01-01', endDate: '2026-02-14' }
    ])
    expect(result.accredited?.accreditationNumber).toBe('ACC-2026')
    expect(spans(result.accredited?.reportingPeriods.slice(0, 2))).toEqual([
      { period: 2, startDate: '2026-02-15', endDate: '2026-02-28' },
      { period: 3, startDate: '2026-03-01', endDate: '2026-03-31' }
    ])
    expect(result.accredited?.reportingPeriods).toHaveLength(11)
  })

  it('owes one month when the accreditation is cancelled and reinstated within it', () => {
    const result = calendar({
      registration: registeredSinceLastYear([
        approvedOn('2026-01-01'),
        suspendedOn('2026-09-01'),
        cancelledOn('2026-09-10'),
        approvedOn('2026-09-25')
      ])
    })

    expect(
      spans(result.accredited?.reportingPeriods).filter(
        ({ period }) => period === 9
      )
    ).toEqual([{ period: 9, startDate: '2026-09-01', endDate: '2026-09-30' }])
    expect(periodNumbers(result.accredited?.reportingPeriods)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ])
    expect(spans(result.registeredOnly?.reportingPeriods)).toEqual([
      { period: 3, startDate: '2026-09-10', endDate: '2026-09-24' }
    ])
  })

  it('owes one quarter when registered-only twice within it', () => {
    const result = calendar({
      registration: registeredSinceLastYear([
        approvedOn('2026-01-01'),
        suspendedOn('2026-06-15'),
        cancelledOn('2026-07-01'),
        approvedOn('2026-08-01'),
        suspendedOn('2026-08-15'),
        cancelledOn('2026-09-01')
      ])
    })

    expect(spans(result.registeredOnly?.reportingPeriods)).toEqual([
      { period: 3, startDate: '2026-07-01', endDate: '2026-09-30' },
      { period: 4, startDate: '2026-10-01', endDate: '2026-12-31' }
    ])
    expect(periodNumbers(result.accredited?.reportingPeriods)).toEqual([
      1, 2, 3, 4, 5, 6, 8
    ])
  })

  it('does not list a month until its last part has ended', () => {
    const result = calendar({
      registration: registeredSinceLastYear([
        approvedOn('2026-01-01'),
        suspendedOn('2026-09-01'),
        cancelledOn('2026-09-10'),
        approvedOn('2026-09-25')
      ]),
      now: new Date('2026-09-15T12:00:00Z')
    })

    expect(periodNumbers(result.accredited?.reportingPeriods)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8
    ])
    expect(result).not.toHaveProperty('registeredOnly')
  })

  it('lists only the periods that have ended while the year is running', () => {
    const result = calendar({
      registration: registeredSinceLastYear(),
      now: new Date('2026-07-15T12:00:00Z')
    })

    expect(periodNumbers(result.registeredOnly?.reportingPeriods)).toEqual([
      1, 2
    ])
    expect(result).not.toHaveProperty('accredited')
  })

  describe('stored reports', () => {
    const submittedReport = {
      id: 'report-1',
      status: REPORT_STATUS.SUBMITTED,
      submissionNumber: 1,
      submittedAt: '2026-04-10T09:00:00.000Z',
      submittedBy: null,
      resubmissionRequired: null
    }

    /**
     * @param {number} year
     * @returns {PeriodicReport}
     */
    const storedQuarterOne = (year) =>
      /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year,
          reports: {
            quarterly: {
              1: {
                startDate: `${year}-01-01`,
                endDate: `${year}-03-31`,
                dueDate: `${year}-04-20`,
                current: submittedReport
              }
            }
          }
        })
      )

    it('shows a stored report on its period', () => {
      const result = calendar({
        registration: registeredSinceLastYear(),
        storedReports: [storedQuarterOne(2026)]
      })

      expect(result.registeredOnly?.reportingPeriods[0].report).toEqual({
        id: 'report-1',
        status: REPORT_STATUS.SUBMITTED,
        submissionNumber: 1,
        submittedAt: '2026-04-10T09:00:00.000Z',
        submittedBy: null
      })
    })

    it('ignores stored reports from other years', () => {
      const result = calendar({
        registration: registeredSinceLastYear(),
        storedReports: [storedQuarterOne(2025)]
      })

      expect(
        result.registeredOnly?.reportingPeriods.map(({ report }) => report)
      ).toEqual([null, null, null, null])
    })
  })
})
