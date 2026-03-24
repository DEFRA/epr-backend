import { describe, it, expect, vi } from 'vitest'
import { resolveOverseasSites } from './resolve-overseas-sites.js'

describe('resolveOverseasSites', () => {
  it('returns resolved map keyed by numeric OSR ID', async () => {
    const validFrom = new Date('2024-01-01')
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: {
          100: { overseasSiteId: 'site-aaa' },
          200: { overseasSiteId: 'site-bbb' }
        }
      })
    }
    const overseasSitesRepository = {
      findById: vi.fn().mockImplementation((id) => {
        if (id === 'site-aaa') {
          return Promise.resolve({ id: 'site-aaa', validFrom })
        }
        return Promise.resolve({
          id: 'site-bbb',
          validFrom: new Date('2024-06-01')
        })
      })
    }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toEqual({
      100: { validFrom },
      200: { validFrom: new Date('2024-06-01') }
    })
    expect(organisationsRepository.findRegistrationById).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
  })

  it('returns undefined when registration has no overseasSites', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: undefined
      })
    }
    const overseasSitesRepository = { findById: vi.fn() }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toBeUndefined()
    expect(overseasSitesRepository.findById).not.toHaveBeenCalled()
  })

  it('returns undefined when overseasSites map is empty', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: {}
      })
    }
    const overseasSitesRepository = { findById: vi.fn() }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toBeUndefined()
    expect(overseasSitesRepository.findById).not.toHaveBeenCalled()
  })

  it('returns undefined when registration is null', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }
    const overseasSitesRepository = { findById: vi.fn() }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toBeUndefined()
  })

  it('sets validFrom to null when overseas site is not found', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: {
          100: { overseasSiteId: 'missing-site' }
        }
      })
    }
    const overseasSitesRepository = {
      findById: vi.fn().mockResolvedValue(null)
    }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toEqual({
      100: { validFrom: null }
    })
  })

  it('sets validFrom to null when overseas site has no validFrom', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: {
          100: { overseasSiteId: 'site-no-date' }
        }
      })
    }
    const overseasSitesRepository = {
      findById: vi
        .fn()
        .mockResolvedValue({ id: 'site-no-date', validFrom: undefined })
    }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toEqual({
      100: { validFrom: null }
    })
  })
})
