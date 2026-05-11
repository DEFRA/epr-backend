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

  it('builds a context map keyed by 3-digit OSR key with validFrom values', () => {
    const registration = {
      overseasSites: {
        '001': { overseasSiteId: 'site-a' },
        '042': { overseasSiteId: 'site-b' }
      }
    }
    const sitesById = new Map([
      ['site-a', { id: 'site-a', validFrom: new Date('2026-01-01') }],
      ['site-b', { id: 'site-b', validFrom: null }]
    ])
    expect(buildOverseasSitesContext(registration, sitesById)).toEqual({
      '001': { validFrom: new Date('2026-01-01') },
      '042': { validFrom: null }
    })
  })

  it('emits validFrom: null when the referenced site is missing from the map', () => {
    const registration = {
      overseasSites: {
        '001': { overseasSiteId: 'site-missing' }
      }
    }
    const sitesById = new Map()
    expect(buildOverseasSitesContext(registration, sitesById)).toEqual({
      '001': { validFrom: null }
    })
  })
})
