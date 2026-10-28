import { toYear } from '#common/helpers/dates/year.js'
import { registrationStatusWindows } from './registration-status-windows.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { Registration, StatusTimeline } from './model.js' */

/**
 * @param {string} status
 * @returns {(date: string, time?: string) => StatusTimeline[number]}
 */
const changeTo =
  (status) =>
  (date, time = '00:00') => ({ status, at: `${date}T${time}:00.000Z` })

const createdOn = changeTo('created')
const approvedOn = changeTo('approved')
const suspendedOn = changeTo('suspended')
const cancelledOn = changeTo('cancelled')

const REGISTERED_LAST_YEAR = [approvedOn('2025-06-02')]

/**
 * @param {{
 *   year?: Year,
 *   registration?: StatusTimeline,
 *   accreditations?: Record<number, StatusTimeline>
 * }} params
 */
const windows = ({
  year = toYear(2026),
  registration = REGISTERED_LAST_YEAR,
  accreditations = {}
}) =>
  registrationStatusWindows(
    /** @type {Registration} */ (
      /** @type {unknown} */ ({
        status: { timeline: registration },
        accreditations: Object.fromEntries(
          Object.entries(accreditations).map(
            ([accreditationYear, timeline]) => [
              accreditationYear,
              { status: { timeline } }
            ]
          )
        )
      })
    ),
    year
  )

/**
 * @param {string} from
 * @param {string} to
 */
const range = (from, to) => ({ from, to })

const WHOLE_YEAR = range('2026-01-01', '2026-12-31')

describe('registrationStatusWindows', () => {
  describe('registered-only', () => {
    it('is registered-only across the full year', () => {
      expect(windows({})).toEqual({
        registeredOnly: [WHOLE_YEAR],
        accredited: []
      })
    })

    it('is registered-only from approval when registered mid-year', () => {
      expect(windows({ year: toYear(2025) })).toEqual({
        registeredOnly: [range('2025-06-02', '2025-12-31')],
        accredited: []
      })
    })

    it('has no reporting obligations in a year before registration', () => {
      expect(windows({ year: toYear(2024) })).toEqual({
        registeredOnly: [],
        accredited: []
      })
    })

    it('stops when the registration is cancelled mid-year', () => {
      expect(
        windows({
          registration: [approvedOn('2025-06-02'), cancelledOn('2026-08-01')]
        })
      ).toEqual({
        registeredOnly: [range('2026-01-01', '2026-07-31')],
        accredited: []
      })
    })

    it('resumes when the registration is approved again', () => {
      expect(
        windows({
          registration: [
            approvedOn('2025-06-02'),
            cancelledOn('2026-08-01'),
            approvedOn('2026-10-01')
          ]
        })
      ).toEqual({
        registeredOnly: [
          range('2026-01-01', '2026-07-31'),
          range('2026-10-01', '2026-12-31')
        ],
        accredited: []
      })
    })

    it('stays registered-only while an accreditation is not yet approved', () => {
      expect(
        windows({ accreditations: { 2026: [createdOn('2026-03-01')] } })
      ).toEqual({
        registeredOnly: [WHOLE_YEAR],
        accredited: []
      })
    })

    it('stays registered-only when accredited only in another year', () => {
      expect(
        windows({ accreditations: { 2025: [approvedOn('2025-07-01')] } })
      ).toEqual({
        registeredOnly: [WHOLE_YEAR],
        accredited: []
      })
    })
  })

  describe('registered and accredited', () => {
    it('is accredited across the full year', () => {
      expect(
        windows({ accreditations: { 2026: [approvedOn('2026-01-01')] } })
      ).toEqual({
        registeredOnly: [],
        accredited: [WHOLE_YEAR]
      })
    })

    describe('accredited from mid-year', () => {
      it('is registered-only until the accreditation starts', () => {
        expect(
          windows({ accreditations: { 2026: [approvedOn('2026-07-01')] } })
        ).toEqual({
          registeredOnly: [range('2026-01-01', '2026-06-30')],
          accredited: [range('2026-07-01', '2026-12-31')]
        })
      })

      it('is registered-only for exactly the first quarter when accredited on 1 April', () => {
        expect(
          windows({ accreditations: { 2026: [approvedOn('2026-04-01')] } })
        ).toEqual({
          registeredOnly: [range('2026-01-01', '2026-03-31')],
          accredited: [range('2026-04-01', '2026-12-31')]
        })
      })

      it('splits a quarter when accredited part way through it', () => {
        expect(
          windows({ accreditations: { 2026: [approvedOn('2026-02-15')] } })
        ).toEqual({
          registeredOnly: [range('2026-01-01', '2026-02-14')],
          accredited: [range('2026-02-15', '2026-12-31')]
        })
      })
    })

    it('is accredited only from registration when accredited before registering', () => {
      expect(
        windows({
          year: toYear(2025),
          accreditations: { 2025: [approvedOn('2025-03-01')] }
        })
      ).toEqual({
        registeredOnly: [],
        accredited: [range('2025-06-02', '2025-12-31')]
      })
    })

    describe('accreditation cancelled mid-year', () => {
      it('is registered-only from the day of cancellation', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-09-01'),
                cancelledOn('2026-09-10')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [range('2026-09-10', '2026-12-31')],
          accredited: [range('2026-01-01', '2026-09-09')]
        })
      })

      it('is registered-only from the next quarter when cancelled on 1 July', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-06-01'),
                cancelledOn('2026-07-01')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [range('2026-07-01', '2026-12-31')],
          accredited: [range('2026-01-01', '2026-06-30')]
        })
      })

      it('is registered-only between cancellation and reinstatement in the same month', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-09-01'),
                cancelledOn('2026-09-10'),
                approvedOn('2026-09-25')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [range('2026-09-10', '2026-09-24')],
          accredited: [
            range('2026-01-01', '2026-09-09'),
            range('2026-09-25', '2026-12-31')
          ]
        })
      })

      it('is registered-only between cancellation and reinstatement two months later', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-06-01'),
                cancelledOn('2026-06-15'),
                approvedOn('2026-08-15')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [range('2026-06-15', '2026-08-14')],
          accredited: [
            range('2026-01-01', '2026-06-14'),
            range('2026-08-15', '2026-12-31')
          ]
        })
      })

      it('is registered-only twice in a quarter when cancelled twice in it', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-06-15'),
                cancelledOn('2026-07-01'),
                approvedOn('2026-08-01'),
                suspendedOn('2026-08-15'),
                cancelledOn('2026-09-01')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [
            range('2026-07-01', '2026-07-31'),
            range('2026-09-01', '2026-12-31')
          ],
          accredited: [
            range('2026-01-01', '2026-06-30'),
            range('2026-08-01', '2026-08-31')
          ]
        })
      })
    })

    describe('accreditation suspended mid-year', () => {
      it('stays accredited through a suspension lifted in the same month', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-05-05'),
                approvedOn('2026-05-20')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [],
          accredited: [WHOLE_YEAR]
        })
      })

      it('stays accredited through a suspension spanning quarters', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-03-15'),
                approvedOn('2026-07-15')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [],
          accredited: [WHOLE_YEAR]
        })
      })

      it('stays accredited to the year end when the suspension is never lifted', () => {
        expect(
          windows({
            accreditations: {
              2026: [approvedOn('2026-01-01'), suspendedOn('2026-10-01')]
            }
          })
        ).toEqual({
          registeredOnly: [],
          accredited: [WHOLE_YEAR]
        })
      })

      it('stays accredited through a suspension lifted on the same day', () => {
        expect(
          windows({
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                suspendedOn('2026-05-05', '09:00'),
                approvedOn('2026-05-05', '15:00')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [],
          accredited: [WHOLE_YEAR]
        })
      })
    })

    describe('registration cancelled mid-year', () => {
      it('has no reporting obligations once the registration and its accreditation are cancelled', () => {
        expect(
          windows({
            registration: [approvedOn('2025-06-02'), cancelledOn('2026-08-01')],
            accreditations: {
              2026: [approvedOn('2026-01-01'), cancelledOn('2026-08-01')]
            }
          })
        ).toEqual({
          registeredOnly: [],
          accredited: [range('2026-01-01', '2026-07-31')]
        })
      })

      it('is registered-only once registered again, until the accreditation is reinstated', () => {
        expect(
          windows({
            registration: [
              approvedOn('2025-06-02'),
              cancelledOn('2026-08-01'),
              approvedOn('2026-10-01')
            ],
            accreditations: {
              2026: [
                approvedOn('2026-01-01'),
                cancelledOn('2026-08-01'),
                approvedOn('2026-11-01')
              ]
            }
          })
        ).toEqual({
          registeredOnly: [range('2026-10-01', '2026-10-31')],
          accredited: [
            range('2026-01-01', '2026-07-31'),
            range('2026-11-01', '2026-12-31')
          ]
        })
      })
    })
  })
})
