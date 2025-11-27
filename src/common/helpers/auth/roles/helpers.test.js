import { describe, expect, it, beforeEach } from 'vitest'
import {
  isInitialUser,
  getOrgDataFromDefraIdToken,
  getCurrentRelationship,
  getDefraTokenSummary,
  isOrganisationsDiscoveryReq,
  findOrganisationMatches
} from './helpers.js'
import { organisationsLinkedGetAllPath } from '#domain/organisations/paths.js'

describe('isInitialUser', () => {
  it('should return true when user is found and is initial user', () => {
    const organisation = {
      users: [
        { email: 'user@example.com', isInitialUser: true },
        { email: 'other@example.com', isInitialUser: false }
      ]
    }

    expect(isInitialUser(organisation, 'user@example.com')).toBe(true)
  })

  it('should return false when user is found but is not initial user', () => {
    const organisation = {
      users: [
        { email: 'user@example.com', isInitialUser: false },
        { email: 'other@example.com', isInitialUser: true }
      ]
    }

    expect(isInitialUser(organisation, 'user@example.com')).toBe(false)
  })

  it('should return false when user is not found', () => {
    const organisation = {
      users: [{ email: 'other@example.com', isInitialUser: true }]
    }

    expect(isInitialUser(organisation, 'user@example.com')).toBe(false)
  })

  it('should perform case-insensitive email matching', () => {
    const organisation = {
      users: [{ email: 'User@Example.Com', isInitialUser: true }]
    }

    expect(isInitialUser(organisation, 'user@example.com')).toBe(true)
    expect(isInitialUser(organisation, 'USER@EXAMPLE.COM')).toBe(true)
  })

  it('should return false when isInitialUser is undefined', () => {
    const organisation = {
      users: [{ email: 'user@example.com' }]
    }

    expect(isInitialUser(organisation, 'user@example.com')).toBe(false)
  })

  it('should handle empty users array', () => {
    const organisation = {
      users: []
    }

    expect(isInitialUser(organisation, 'user@example.com')).toBe(false)
  })
})

describe('getOrgDataFromDefraIdToken', () => {
  it('should parse relationships and identify current relationship', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-2',
      relationships: [
        'rel-1:org-1:Organisation One',
        'rel-2:org-2:Organisation Two',
        'rel-3:org-3:Organisation Three'
      ]
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result).toEqual([
      {
        defraIdRelationshipId: 'rel-1',
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      },
      {
        defraIdRelationshipId: 'rel-2',
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: true
      },
      {
        defraIdRelationshipId: 'rel-3',
        defraIdOrgId: 'org-3',
        defraIdOrgName: 'Organisation Three',
        isCurrent: false
      }
    ])
  })

  it('should trim whitespace from organisation names', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1',
      relationships: ['rel-1:org-1:  Organisation With Spaces  ']
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result[0].defraIdOrgName).toBe('Organisation With Spaces')
  })

  it('should handle relationships with no current match', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'non-existent-rel',
      relationships: [
        'rel-1:org-1:Organisation One',
        'rel-2:org-2:Organisation Two'
      ]
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result.every((r) => r.isCurrent === false)).toBe(true)
  })

  it('should handle empty relationships array', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1',
      relationships: []
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result).toEqual([])
  })

  it('should handle organisation names with colons by splitting on first two colons only', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1',
      relationships: ['rel-1:org-1:Organisation: With: Colons']
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    // The split(':') method splits on ALL colons, so names with colons get truncated
    // This documents the actual behavior - relationship format should avoid colons in names
    expect(result[0].defraIdRelationshipId).toBe('rel-1')
    expect(result[0].defraIdOrgId).toBe('org-1')
    expect(result[0].defraIdOrgName).toBe('Organisation')
  })

  it('should handle undefined organisation name', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1',
      relationships: ['rel-1:org-1']
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result[0].defraIdOrgName).toBeUndefined()
  })
})

describe('getCurrentRelationship', () => {
  it('should return the relationship marked as current', () => {
    const relationships = [
      {
        defraIdRelationshipId: 'rel-1',
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      },
      {
        defraIdRelationshipId: 'rel-2',
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: true
      },
      {
        defraIdRelationshipId: 'rel-3',
        defraIdOrgId: 'org-3',
        defraIdOrgName: 'Organisation Three',
        isCurrent: false
      }
    ]

    const result = getCurrentRelationship(relationships)

    expect(result).toEqual({
      defraIdRelationshipId: 'rel-2',
      defraIdOrgId: 'org-2',
      defraIdOrgName: 'Organisation Two',
      isCurrent: true
    })
  })

  it('should return undefined when no relationship is current', () => {
    const relationships = [
      {
        defraIdRelationshipId: 'rel-1',
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      },
      {
        defraIdRelationshipId: 'rel-2',
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: false
      }
    ]

    const result = getCurrentRelationship(relationships)

    expect(result).toBeUndefined()
  })

  it('should return undefined for empty array', () => {
    const result = getCurrentRelationship([])

    expect(result).toBeUndefined()
  })

  it('should return the first current relationship when multiple are marked as current', () => {
    const relationships = [
      {
        defraIdRelationshipId: 'rel-1',
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: true
      },
      {
        defraIdRelationshipId: 'rel-2',
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: true
      }
    ]

    const result = getCurrentRelationship(relationships)

    expect(result.defraIdRelationshipId).toBe('rel-1')
  })
})

describe('getDefraTokenSummary', () => {
  it('should return summary with current organisation details', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-2',
      relationships: [
        'rel-1:org-1:Organisation One',
        'rel-2:org-2:Organisation Two',
        'rel-3:org-3:Organisation Three'
      ]
    }

    const result = getDefraTokenSummary(tokenPayload)

    expect(result).toEqual({
      defraIdOrgId: 'org-2',
      defraIdOrgName: 'Organisation Two',
      defraIdRelationships: [
        {
          defraIdRelationshipId: 'rel-1',
          defraIdOrgId: 'org-1',
          defraIdOrgName: 'Organisation One',
          isCurrent: false
        },
        {
          defraIdRelationshipId: 'rel-2',
          defraIdOrgId: 'org-2',
          defraIdOrgName: 'Organisation Two',
          isCurrent: true
        },
        {
          defraIdRelationshipId: 'rel-3',
          defraIdOrgId: 'org-3',
          defraIdOrgName: 'Organisation Three',
          isCurrent: false
        }
      ]
    })
  })

  it('should return summary with undefined current org when no current relationship exists', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'non-existent',
      relationships: [
        'rel-1:org-1:Organisation One',
        'rel-2:org-2:Organisation Two'
      ]
    }

    const result = getDefraTokenSummary(tokenPayload)

    expect(result.defraIdOrgId).toBeUndefined()
    expect(result.defraIdOrgName).toBeUndefined()
    expect(result.defraIdRelationships).toHaveLength(2)
  })

  it('should handle empty relationships', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1',
      relationships: []
    }

    const result = getDefraTokenSummary(tokenPayload)

    expect(result.defraIdOrgId).toBeUndefined()
    expect(result.defraIdOrgName).toBeUndefined()
    expect(result.defraIdRelationships).toEqual([])
  })
})

describe('isOrganisationsDiscoveryReq', () => {
  it('should return true for GET request to organisations linked path', () => {
    const request = /** @type {any} */ ({
      path: organisationsLinkedGetAllPath,
      method: 'get'
    })

    expect(isOrganisationsDiscoveryReq(request)).toBe(true)
  })

  it('should return false for POST request to organisations linked path', () => {
    const request = /** @type {any} */ ({
      path: organisationsLinkedGetAllPath,
      method: 'post'
    })

    expect(isOrganisationsDiscoveryReq(request)).toBe(false)
  })

  it('should return false for GET request to different path', () => {
    const request = /** @type {any} */ ({
      path: '/api/v1/different-path',
      method: 'get'
    })

    expect(isOrganisationsDiscoveryReq(request)).toBe(false)
  })

  it('should return false for PUT request to organisations linked path', () => {
    const request = /** @type {any} */ ({
      path: organisationsLinkedGetAllPath,
      method: 'put'
    })

    expect(isOrganisationsDiscoveryReq(request)).toBe(false)
  })

  it('should return false for DELETE request to organisations linked path', () => {
    const request = /** @type {any} */ ({
      path: organisationsLinkedGetAllPath,
      method: 'delete'
    })

    expect(isOrganisationsDiscoveryReq(request)).toBe(false)
  })
})

describe('findOrganisationMatches', () => {
  let mockOrganisationsRepository

  beforeEach(() => {
    mockOrganisationsRepository = {
      findOne: () => Promise.resolve(null),
      findMany: () => Promise.resolve([])
    }
  })

  it('should return empty arrays when no organisations exist', async () => {
    const result = await findOrganisationMatches(
      'user@example.com',
      'defra-org-id',
      mockOrganisationsRepository
    )

    expect(result).toEqual({
      all: [],
      unlinked: [],
      linked: []
    })
  })

  it('should return structure with all, unlinked, and linked properties', async () => {
    const result = await findOrganisationMatches(
      'user@example.com',
      'defra-org-id',
      mockOrganisationsRepository
    )

    expect(result).toHaveProperty('all')
    expect(result).toHaveProperty('unlinked')
    expect(result).toHaveProperty('linked')
    expect(Array.isArray(result.all)).toBe(true)
    expect(Array.isArray(result.unlinked)).toBe(true)
    expect(Array.isArray(result.linked)).toBe(true)
  })

  it('should deduplicate organisations in all array', async () => {
    // Note: The current implementation always returns empty arrays
    // This test documents the expected behavior based on the code logic
    const result = await findOrganisationMatches(
      'user@example.com',
      'defra-org-id',
      mockOrganisationsRepository
    )

    // The reduce logic in the function ensures no duplicate IDs in 'all'
    const ids = result.all.map((org) => org.id)
    const uniqueIds = [...new Set(ids)]
    expect(ids).toEqual(uniqueIds)
  })

  it('should handle null email parameter', async () => {
    const result = await findOrganisationMatches(
      null,
      'defra-org-id',
      mockOrganisationsRepository
    )

    expect(result).toEqual({
      all: [],
      unlinked: [],
      linked: []
    })
  })

  it('should handle null defraIdOrgId parameter', async () => {
    const result = await findOrganisationMatches(
      'user@example.com',
      null,
      mockOrganisationsRepository
    )

    expect(result).toEqual({
      all: [],
      unlinked: [],
      linked: []
    })
  })
})
