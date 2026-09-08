import { describe, it, expect, vi } from 'vitest'

import { getOrsDetailsMap } from './get-ors-details-map.js'
import { buildOverseasSite } from '#overseas-sites/repository/contract/test-data.js'
import { createMockOverseasSitesRepository } from '#test/mock-repositories.js'

/** @import { OverseasSite } from '#overseas-sites/repository/port.js' */

/**
 * A stored site, as the repository would return it. The builder supplies every
 * field but the identifier, which the caller names so two sites in one array
 * cannot collide.
 *
 * @param {Partial<OverseasSite> & { id: string }} overrides
 * @returns {OverseasSite}
 */
const storedSite = ({ id, ...overrides }) => ({
  ...buildOverseasSite(overrides),
  id
})

describe('getOrsDetailsMap', () => {
  it('returns a map keyed by ORS key with siteName, country, and validFrom', async () => {
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn().mockResolvedValue([
        storedSite({
          id: 'site-aaa',
          name: 'EuroPlast GmbH',
          country: 'Germany',
          validFrom: new Date('2025-01-15')
        }),
        storedSite({
          id: 'site-bbb',
          name: 'RecyclePlast SA',
          country: 'France',
          validFrom: new Date('2024-06-01')
        })
      ])
    })
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
      validFrom: new Date('2025-01-15')
    })
    expect(result.get('ORS_2')).toStrictEqual({
      siteName: 'RecyclePlast SA',
      country: 'France',
      validFrom: new Date('2024-06-01')
    })
    expect(overseasSitesRepository.findByIds).toHaveBeenCalledWith([
      'site-aaa',
      'site-bbb'
    ])
  })

  it('returns an empty Map when overseasSites is undefined', async () => {
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn()
    })

    const result = await getOrsDetailsMap(overseasSitesRepository, undefined)

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('returns an empty Map when overseasSites is empty', async () => {
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn()
    })

    const result = await getOrsDetailsMap(overseasSitesRepository, {})

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('sets siteName, country, and validFrom to null when site is not found', async () => {
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn().mockResolvedValue([])
    })
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

  it('sets siteName, country, and validFrom to null when site fields are absent', async () => {
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn().mockResolvedValue([{ id: 'site-aaa' }])
    })
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
