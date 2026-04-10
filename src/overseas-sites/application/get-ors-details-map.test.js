import { describe, it, expect, vi } from 'vitest'
import { getOrsDetailsMap } from './get-ors-details-map.js'

describe('getOrsDetailsMap', () => {
  it('returns a map keyed by ORS key with siteName and country', async () => {
    const overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([
        {
          id: 'site-aaa',
          name: 'EuroPlast GmbH',
          country: 'Germany',
          validFrom: '2025-01-15'
        },
        {
          id: 'site-bbb',
          name: 'RecyclePlast SA',
          country: 'France',
          validFrom: '2024-06-01'
        }
      ])
    }
    const overseasSites = {
      ORS_1: { overseasSiteId: 'site-aaa' },
      ORS_2: { overseasSiteId: 'site-bbb' }
    }

    const result = await getOrsDetailsMap(
      overseasSitesRepository,
      overseasSites
    )

    expect(result).toBeInstanceOf(Map)
    expect(result.get('ORS_1')).toStrictEqual({
      siteName: 'EuroPlast GmbH',
      country: 'Germany',
      validFrom: '2025-01-15'
    })
    expect(result.get('ORS_2')).toStrictEqual({
      siteName: 'RecyclePlast SA',
      country: 'France',
      validFrom: '2024-06-01'
    })
    expect(overseasSitesRepository.findByIds).toHaveBeenCalledWith([
      'site-aaa',
      'site-bbb'
    ])
  })

  it('returns an empty Map when overseasSitesRepository is undefined (feature flag off)', async () => {
    const result = await getOrsDetailsMap(undefined, {
      124: { overseasSiteId: 'site-aaa' }
    })

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('returns an empty Map when overseasSites is undefined', async () => {
    const overseasSitesRepository = { findByIds: vi.fn() }

    const result = await getOrsDetailsMap(overseasSitesRepository, undefined)

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('returns an empty Map when overseasSites is null', async () => {
    const overseasSitesRepository = { findByIds: vi.fn() }

    const result = await getOrsDetailsMap(overseasSitesRepository, null)

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('returns an empty Map when overseasSites is empty', async () => {
    const overseasSitesRepository = { findByIds: vi.fn() }

    const result = await getOrsDetailsMap(overseasSitesRepository, {})

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('sets siteName and country to null when site is not found', async () => {
    const overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([])
    }
    const overseasSites = {
      ORS_1: { overseasSiteId: 'missing-site' }
    }

    const result = await getOrsDetailsMap(
      overseasSitesRepository,
      overseasSites
    )

    expect(result.get('ORS_1')).toStrictEqual({
      siteName: null,
      country: null,
      validFrom: null
    })
  })

  it('sets siteName and country to null when site fields are absent', async () => {
    const overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([{ id: 'site-aaa' }])
    }
    const overseasSites = {
      ORS_1: { overseasSiteId: 'site-aaa' }
    }

    const result = await getOrsDetailsMap(
      overseasSitesRepository,
      overseasSites
    )

    expect(result.get('ORS_1')).toStrictEqual({
      siteName: null,
      country: null,
      validFrom: null
    })
  })
})
