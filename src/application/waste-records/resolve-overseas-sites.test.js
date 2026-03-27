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
      findByIds: vi.fn().mockResolvedValue([
        { id: 'site-aaa', validFrom },
        { id: 'site-bbb', validFrom: new Date('2024-06-01') }
      ])
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
    expect(overseasSitesRepository.findByIds).toHaveBeenCalledWith([
      'site-aaa',
      'site-bbb'
    ])
  })

  it('returns empty map when registration has no overseasSites', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: undefined
      })
    }
    const overseasSitesRepository = { findByIds: vi.fn() }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toEqual({})
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('returns empty map when overseasSites map is empty', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        overseasSites: {}
      })
    }
    const overseasSitesRepository = { findByIds: vi.fn() }

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      'org-1',
      'reg-1'
    )

    expect(result).toEqual({})
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('throws when registration is not found', async () => {
    const organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }
    const overseasSitesRepository = { findByIds: vi.fn() }

    await expect(
      resolveOverseasSites(
        organisationsRepository,
        overseasSitesRepository,
        'org-1',
        'reg-1'
      )
    ).rejects.toThrow('Registration not found: reg-1 for organisation org-1')
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
      findByIds: vi.fn().mockResolvedValue([])
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
      findByIds: vi
        .fn()
        .mockResolvedValue([{ id: 'site-no-date', validFrom: undefined }])
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
