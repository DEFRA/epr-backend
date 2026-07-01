import { buildOverseasSitesContext } from './overseas-sites-context.js'

/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */

/**
 * @param {Partial<OverseasSite> & { id: string }} overrides
 * @returns {OverseasSite}
 */
const buildSite = (overrides) => ({
  name: 'Default Site',
  address: { line1: '1 Test Street', townOrCity: 'Testville' },
  country: 'Testland',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides
})

describe('buildOverseasSitesContext', () => {
  it('returns an empty object when registration has no overseasSites', () => {
    const registration = { overseasSites: null }
    const sitesById = new Map()
    expect(buildOverseasSitesContext(registration, sitesById)).toEqual({})
  })

  it('returns an empty object when overseasSites is undefined', () => {
    const registration = {}
    const sitesById = new Map()
    expect(buildOverseasSitesContext(registration, sitesById)).toEqual({})
  })

  it('builds a context map keyed by 3-digit OSR key with validFrom, site name and country', () => {
    const registration = {
      overseasSites: {
        '001': { overseasSiteId: 'site-a' },
        '042': { overseasSiteId: 'site-b' }
      }
    }
    const sitesById = new Map([
      [
        'site-a',
        buildSite({
          id: 'site-a',
          validFrom: new Date('2026-01-01'),
          name: 'Acme Recycling',
          country: 'Germany'
        })
      ],
      // site-b has no validFrom, so the context should surface validFrom: null
      [
        'site-b',
        buildSite({ id: 'site-b', name: 'Beta Sorting', country: 'India' })
      ]
    ])
    expect(buildOverseasSitesContext(registration, sitesById)).toEqual({
      '001': {
        validFrom: new Date('2026-01-01'),
        siteName: 'Acme Recycling',
        country: 'Germany'
      },
      '042': { validFrom: null, siteName: 'Beta Sorting', country: 'India' }
    })
  })

  it('emits null validFrom, siteName and country when the referenced site is missing from the map', () => {
    const registration = {
      overseasSites: {
        '001': { overseasSiteId: 'site-missing' }
      }
    }
    const sitesById = new Map()
    expect(buildOverseasSitesContext(registration, sitesById)).toEqual({
      '001': { validFrom: null, siteName: null, country: null }
    })
  })
})
