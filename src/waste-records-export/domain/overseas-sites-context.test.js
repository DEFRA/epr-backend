import { buildOverseasSitesContext } from './overseas-sites-context.js'

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
        {
          id: 'site-a',
          validFrom: new Date('2026-01-01'),
          name: 'Acme Recycling',
          country: 'Germany'
        }
      ],
      [
        'site-b',
        {
          id: 'site-b',
          validFrom: null,
          name: 'Beta Sorting',
          country: 'India'
        }
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
