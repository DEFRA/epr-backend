import { toYear } from '#common/helpers/dates/year.js'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { reportableRegistrations } from '#reports/application/reportable-registrations.js'
import { partialMock } from '#test/type-helpers.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transform } from './public-register-transformer.js'

/** @import { AccreditationCommon, ExporterRegistration, Organisation, Registration, ReprocessorRegistration, StatusTimeline } from '#organisation-read-model/domain/model.js' */

const REGISTRATION_NUMBER = 'R26ER5000010001PL'

const registeredAddress = {
  line1: '1 Waste Road',
  town: 'London',
  postcode: 'N1 1AA',
  country: 'UK'
}

const siteAddress = {
  line1: '2 Waste Site',
  town: 'London',
  postcode: 'EC1 1AA',
  country: 'UK',
  region: 'Greater London'
}

/**
 * @param {string} status
 * @param {string} at
 * @param {string} [updatedAt]
 * @returns {StatusTimeline[number]}
 */
const change = (status, at, updatedAt = at) => ({ status, at, updatedAt })

/** @type {StatusTimeline} */
const approvedTimeline = [
  change('created', '2025-11-03T09:00:00.000Z'),
  change('approved', '2026-01-01T00:00:00.000Z', '2026-01-05T09:12:00.000Z')
]

/**
 * @param {Partial<AccreditationCommon>} [overrides]
 * @returns {AccreditationCommon}
 */
const accreditation = (overrides = {}) => ({
  accreditationNumber: /** @type {any} */ ('A26ER5000010001PL'),
  prnIssuance: { tonnageBand: 'up_to_10000' },
  status: { current: 'approved', timeline: approvedTimeline },
  ...overrides
})

/**
 * @param {Partial<ReprocessorRegistration>} [overrides]
 * @returns {Registration}
 */
const reprocessor = (overrides = {}) =>
  partialMock({
    material: 'plastic',
    status: { current: 'approved', timeline: approvedTimeline },
    submittedToRegulator: { code: 'ea' },
    wasteProcessingType: 'reprocessor',
    site: { address: siteAddress },
    accreditations: {},
    ...overrides
  })

/**
 * @param {Partial<ExporterRegistration>} [overrides]
 * @returns {Registration}
 */
const exporter = (overrides = {}) =>
  partialMock({
    material: 'aluminium',
    status: { current: 'approved', timeline: approvedTimeline },
    submittedToRegulator: { code: 'nrw' },
    wasteProcessingType: 'exporter',
    overseasSites: {},
    accreditations: {},
    ...overrides
  })

/**
 * @param {Partial<Organisation>} [overrides]
 * @returns {Organisation}
 */
const organisation = (overrides = {}) =>
  partialMock({
    organisationNumber: toOrganisationNumber('500001'),
    name: 'Waste Ltd',
    tradingName: 'Waste Recovery',
    companiesHouseNumber: '12345678',
    registeredAddress,
    registrations: { [REGISTRATION_NUMBER]: reprocessor() },
    ...overrides
  })

/**
 * Compliance data for no periods, as generateReportCompliance builds it.
 *
 * @param {Organisation[]} organisations
 */
const noPeriods = (organisations) => ({
  periods: [],
  entries: new Map(
    reportableRegistrations(organisations).map(({ key }) => [
      key,
      { submittedDates: new Map() }
    ])
  )
})

/** @param {Organisation[]} organisations */
const rowsFor = (organisations) =>
  transform(organisations, noPeriods(organisations))

/** @param {Registration} registration */
const rowFor = async (registration) => {
  const [row] = await rowsFor([
    organisation({ registrations: { [REGISTRATION_NUMBER]: registration } })
  ])
  return row
}

describe('transform', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('produces a row with every field for an accredited reprocessor', async () => {
    const served = organisation({
      registrations: {
        [REGISTRATION_NUMBER]: reprocessor({
          accreditations: { 2026: accreditation() }
        })
      }
    })

    expect(await rowsFor([served])).toStrictEqual([
      {
        type: 'Reprocessor',
        businessName: 'Waste Ltd',
        companiesHouseNumber: '12345678',
        organisationNumber: served.organisationNumber,
        registeredOffice: '1 Waste Road, London, N1 1AA, UK',
        appropriateAgency: 'EA',
        registrationNumber: REGISTRATION_NUMBER,
        tradingName: 'Waste Recovery',
        reprocessingSite: '2 Waste Site, London, EC1 1AA, Greater London, UK',
        packagingWasteCategory: 'Plastic',
        annexIIProcess: 'R3',
        accreditationStatus: 'Approved',
        accreditationNo: 'A26ER5000010001PL',
        tonnageBand: 'Up to 10,000 tonnes',
        activeDate: '01/01/2026',
        dateLastChanged: '05/01/2026'
      }
    ])
  })

  it('leaves the accreditation columns blank for a registration with no accreditation', async () => {
    expect(await rowFor(reprocessor())).toMatchObject({
      accreditationStatus: '',
      accreditationNo: '',
      tonnageBand: '',
      activeDate: '',
      dateLastChanged: ''
    })
  })

  it("gives the agency the registration was submitted to, not the organisation's", async () => {
    const row = await rowFor(
      reprocessor({ submittedToRegulator: { code: 'sepa' } })
    )

    expect(row.appropriateAgency).toBe('SEPA')
  })

  it.each([
    {
      current: 'suspended',
      tonnageBand: 'up_to_5000',
      expected: ['Suspended', 'Up to 5,000 tonnes']
    },
    {
      current: 'cancelled',
      tonnageBand: 'up_to_500',
      expected: ['Cancelled', 'Up to 500 tonnes']
    }
  ])(
    'gives a $current accreditation its status and tonnage band',
    async ({ current, tonnageBand, expected }) => {
      const row = await rowFor(
        reprocessor({
          accreditations: {
            2026: accreditation({
              prnIssuance: { tonnageBand },
              status: {
                current: /** @type {any} */ (current),
                timeline: approvedTimeline
              }
            })
          }
        })
      )

      expect([row.accreditationStatus, row.tonnageBand]).toEqual(expected)
    }
  )

  it("shows the current year's accreditation, not next year's", async () => {
    const row = await rowFor(
      reprocessor({
        accreditations: {
          2025: accreditation({
            accreditationNumber: /** @type {any} */ ('A25')
          }),
          2026: accreditation({
            accreditationNumber: /** @type {any} */ ('A26')
          }),
          2027: accreditation({
            accreditationNumber: /** @type {any} */ ('A27')
          })
        }
      })
    )

    expect(row.accreditationNo).toBe('A26')
  })

  it('dates the accreditation active from its first approval', async () => {
    const row = await rowFor(
      reprocessor({
        accreditations: {
          2026: accreditation({
            status: {
              current: 'approved',
              timeline: [
                change('approved', '2026-02-01T00:00:00.000Z'),
                change('cancelled', '2026-03-10T09:00:00.000Z'),
                change('approved', '2026-03-30T09:00:00.000Z')
              ]
            }
          })
        }
      })
    )

    expect(row.activeDate).toBe('01/02/2026')
  })

  it('leaves the active date blank for an accreditation never approved', async () => {
    const row = await rowFor(
      reprocessor({
        accreditations: {
          2026: accreditation({
            status: {
              current: 'suspended',
              timeline: [change('suspended', '2026-02-01T00:00:00.000Z')]
            }
          })
        }
      })
    )

    expect(row.activeDate).toBe('')
  })

  it('dates the last change when it was recorded, not when it takes effect', async () => {
    const row = await rowFor(
      reprocessor({
        accreditations: {
          2026: accreditation({
            status: {
              current: 'suspended',
              timeline: [
                change(
                  'approved',
                  '2026-01-01T00:00:00.000Z',
                  '2026-03-20T09:00:00.000Z'
                ),
                change('suspended', '2026-03-01T09:00:00.000Z')
              ]
            }
          })
        }
      })
    )

    expect(row.dateLastChanged).toBe('20/03/2026')
  })

  it('falls back to the organisation address when there is no registered office', async () => {
    const [row] = await rowsFor([
      organisation({
        registeredAddress: undefined,
        address: {
          line1: '2 Depot Lane',
          town: 'Leeds',
          postcode: 'LS1 1AA',
          region: 'Yorkshire',
          country: 'UK'
        }
      })
    ])

    expect(row.registeredOffice).toBe(
      '2 Depot Lane, Leeds, LS1 1AA, Yorkshire, UK'
    )
  })

  it('leaves the registered office blank when the organisation has no address', async () => {
    const [row] = await rowsFor([
      organisation({ registeredAddress: undefined })
    ])

    expect(row.registeredOffice).toBe('')
  })

  it('leaves out an address held only as submitted, keeping its country', async () => {
    const [row] = await rowsFor([
      organisation({
        registeredAddress: { fullAddress: '1 Waste Road N1 1AA', country: 'UK' }
      })
    ])

    expect(row.registeredOffice).toBe('UK')
  })

  it('gives an exporter no reprocessing site', async () => {
    const row = await rowFor(exporter())

    expect(row).toMatchObject({
      type: 'Exporter',
      appropriateAgency: 'NRW',
      reprocessingSite: '',
      packagingWasteCategory: 'Aluminium',
      annexIIProcess: 'R4'
    })
  })

  it.each([
    { material: 'glass_re_melt', category: 'Glass-remelt' },
    { material: 'glass_other', category: 'Glass-other' }
  ])(
    'gives $material glass its recycling process and the glass Annex II process',
    async ({ material, category }) => {
      const row = await rowFor(
        reprocessor({ material: /** @type {any} */ (material) })
      )

      expect([row.packagingWasteCategory, row.annexIIProcess]).toEqual([
        category,
        'R5'
      ])
    }
  )

  it('leaves the trading name and Companies House number blank when the organisation has none', async () => {
    const [row] = await rowsFor([
      organisation({ tradingName: undefined, companiesHouseNumber: undefined })
    ])

    expect([row.tradingName, row.companiesHouseNumber]).toEqual(['', ''])
  })

  it('gives a row for each registration of each organisation', async () => {
    const rows = await rowsFor([
      organisation({
        registrations: { R1: reprocessor(), R2: exporter() }
      }),
      organisation({
        organisationNumber: toOrganisationNumber('500002'),
        registrations: { R3: reprocessor() }
      }),
      organisation({
        organisationNumber: toOrganisationNumber('500003'),
        registrations: {}
      })
    ])

    expect(rows.map((row) => row.registrationNumber)).toEqual([
      'R1',
      'R2',
      'R3'
    ])
  })

  it('leaves out test organisations', async () => {
    const rows = await rowsFor([
      organisation({ organisationNumber: toOrganisationNumber('999999') }),
      organisation()
    ])

    expect(rows.map((row) => row.organisationNumber)).toEqual(['500001'])
  })

  describe('compliance fields', () => {
    const period = {
      key: '2026:monthly:1',
      cadence: 'monthly',
      year: toYear(2026),
      period: 1,
      label: 'Jan Report',
      startDate: calendarDate('2026-01-01'),
      endDate: calendarDate('2026-01-31'),
      dueDate: calendarDate('2026-02-28')
    }

    /** @param {Map<string, string | null>} submittedDates */
    const janReport = async (submittedDates) => {
      const served = [organisation()]
      const [{ key }] = reportableRegistrations(served)
      const [row] = await transform(served, {
        periods: /** @type {any} */ ([period]),
        entries: new Map([[key, { submittedDates }]])
      })
      return row['Jan Report']
    }

    it("returns 'N/A' when the period key is absent from submittedDates", async () => {
      expect(await janReport(new Map())).toBe('N/A')
    })

    it("returns '' when the period key is present but not yet submitted", async () => {
      expect(await janReport(new Map([['2026:monthly:1', null]]))).toBe('')
    })

    it('returns formatted date when the period has been submitted', async () => {
      expect(await janReport(new Map([['2026:monthly:1', '2026-01-15']]))).toBe(
        '15/01/2026'
      )
    })
  })
})
