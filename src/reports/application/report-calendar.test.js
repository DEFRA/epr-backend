import { PERIOD_STATUS } from '#reports/domain/period-status.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { config } from '#root/config.js'
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
              status: {
                current: accreditation.at(-1)?.status,
                timeline: accreditation
              }
            }
          }
        : {}
    })
  )

/**
 * @param {boolean} enabled
 */
const withMidYearStatusTransition = (enabled) => {
  beforeEach(() => {
    config.set('featureFlags.midYearStatusTransition', enabled)
  })
  afterEach(() => {
    config.reset('featureFlags.midYearStatusTransition')
  })
}

/**
 * @param {{
 *   registration: Registration,
 *   storedReports?: PeriodicReport[],
 *   allSubmissions?: boolean,
 *   now?: Date
 * }} params
 */
const calendar = ({
  registration,
  storedReports = [],
  allSubmissions,
  now = AFTER_YEAR_END
}) =>
  yearCalendar({ registration, storedReports, year: 2026, allSubmissions, now })

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
  withMidYearStatusTransition(true)

  it('has part-period reporting obligations for a quarter and a month when accredited mid-quarter', () => {
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

  it('has one reporting obligation for a month in which the accreditation is cancelled and reinstated', () => {
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

  it('has one reporting obligation for a quarter registered-only twice within it', () => {
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

  it('says whether a period is due or overdue as of the given date', () => {
    const result = calendar({
      registration: registeredSinceLastYear(),
      now: new Date('2026-07-15T12:00:00Z')
    })

    expect(
      result.registeredOnly?.reportingPeriods.map(
        ({ period, periodStatus }) => ({ period, periodStatus })
      )
    ).toEqual([
      { period: 1, periodStatus: PERIOD_STATUS.OVERDUE },
      { period: 2, periodStatus: PERIOD_STATUS.DUE }
    ])
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

    it('does not list accredited reports for an accreditation the read model dropped', () => {
      const storedMarch = /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            monthly: {
              3: {
                startDate: '2026-03-01',
                endDate: '2026-03-31',
                dueDate: '2026-04-20',
                current: submittedReport
              }
            }
          }
        })
      )

      const result = calendar({
        registration: registeredSinceLastYear(),
        storedReports: [storedMarch]
      })

      expect(result).not.toHaveProperty('accredited')
    })

    describe('resubmitted period', () => {
      const resubmittedQuarterOne = /** @type {PeriodicReport} */ (
        /** @type {unknown} */ ({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          year: 2026,
          reports: {
            quarterly: {
              1: {
                startDate: '2026-01-01',
                endDate: '2026-03-31',
                dueDate: '2026-04-20',
                current: {
                  ...submittedReport,
                  id: 'report-2',
                  submissionNumber: 2
                },
                previousSubmissions: [submittedReport]
              }
            }
          }
        })
      )

      /**
       * @param {boolean} [allSubmissions]
       */
      const quarterOneSubmissions = (allSubmissions) =>
        calendar({
          registration: registeredSinceLastYear(),
          storedReports: [resubmittedQuarterOne],
          allSubmissions
        })
          .registeredOnly?.reportingPeriods.filter(({ period }) => period === 1)
          .map(({ submissionNumber, periodStatus }) => ({
            submissionNumber,
            periodStatus
          }))

      it('shows only the current submission', () => {
        expect(quarterOneSubmissions()).toEqual([
          { submissionNumber: 2, periodStatus: PERIOD_STATUS.SUBMITTED }
        ])
      })

      it('shows every submission, oldest first, when all are asked for', () => {
        expect(quarterOneSubmissions(true)).toEqual([
          { submissionNumber: 1, periodStatus: PERIOD_STATUS.SUBMITTED },
          { submissionNumber: 2, periodStatus: PERIOD_STATUS.SUBMITTED }
        ])
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

describe('yearCalendar with mid-year status transition off', () => {
  withMidYearStatusTransition(false)

  it('lists whole accredited months over every registered day for an accredited registration', () => {
    const result = calendar({
      registration: registeredSinceLastYear([approvedOn('2026-02-15')])
    })

    expect(result).not.toHaveProperty('registeredOnly')
    expect(spans(result.accredited?.reportingPeriods.slice(0, 2))).toEqual([
      { period: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
      { period: 2, startDate: '2026-02-01', endDate: '2026-02-28' }
    ])
    expect(result.accredited?.reportingPeriods).toHaveLength(12)
  })

  it('lists whole registered-only quarters once the accreditation is cancelled', () => {
    const result = calendar({
      registration: registeredSinceLastYear([
        approvedOn('2026-01-01'),
        cancelledOn('2026-07-10')
      ])
    })

    expect(result).not.toHaveProperty('accredited')
    expect(spans(result.registeredOnly?.reportingPeriods)).toEqual([
      { period: 1, startDate: '2026-01-01', endDate: '2026-03-31' },
      { period: 2, startDate: '2026-04-01', endDate: '2026-06-30' },
      { period: 3, startDate: '2026-07-01', endDate: '2026-09-30' },
      { period: 4, startDate: '2026-10-01', endDate: '2026-12-31' }
    ])
  })

  it('lists whole quarters from the one a registration was approved in', () => {
    const registration = /** @type {Registration} */ (
      /** @type {unknown} */ ({
        status: { timeline: [approvedOn('2026-05-15')] },
        accreditations: {}
      })
    )

    expect(
      spans(calendar({ registration }).registeredOnly?.reportingPeriods)
    ).toEqual([
      { period: 2, startDate: '2026-04-01', endDate: '2026-06-30' },
      { period: 3, startDate: '2026-07-01', endDate: '2026-09-30' },
      { period: 4, startDate: '2026-10-01', endDate: '2026-12-31' }
    ])
  })
})
