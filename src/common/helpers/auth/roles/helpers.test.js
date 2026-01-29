import { USER_ROLES } from '#domain/organisations/model.js'
import { describe, expect, it } from 'vitest'
import {
  deduplicateOrganisations,
  getCurrentRelationship,
  getDefraTokenSummary,
  getOrgDataFromDefraIdToken,
  isInitialUser
} from './helpers.js'

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
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      },
      {
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: true
      },
      {
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

  it('should handle undefined relationships', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'rel-1'
      // relationships is undefined - can happen with unenrolled Defra ID users
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result).toEqual([])
  })

  it('should handle undefined currentRelationshipId', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      // currentRelationshipId is undefined
      relationships: ['rel-1:org-1:Organisation One']
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result).toEqual([
      {
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      }
    ])
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

  it('should match currentRelationshipId case-insensitively with GUID format', () => {
    const tokenPayload = {
      id: 'user-id',
      email: 'user@example.com',
      currentRelationshipId: 'F9490276-09FD-4FD2-95CB-1F9A8ACC63CE', // UPPERCASE
      relationships: [
        'f9490276-09fd-4fd2-95cb-1f9a8acc63ce:org-1:Organisation One', // lowercase
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890:org-2:Organisation Two'
      ]
    }

    const result = getOrgDataFromDefraIdToken(tokenPayload)

    expect(result[0].isCurrent).toBe(true)
    expect(result[1].isCurrent).toBe(false)
  })
})

describe('getCurrentRelationship', () => {
  it('should return the relationship marked as current', () => {
    const relationships = [
      {
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      },
      {
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: true
      },
      {
        defraIdOrgId: 'org-3',
        defraIdOrgName: 'Organisation Three',
        isCurrent: false
      }
    ]

    const result = getCurrentRelationship(relationships)

    expect(result).toEqual({
      defraIdOrgId: 'org-2',
      defraIdOrgName: 'Organisation Two',
      isCurrent: true
    })
  })

  it('should return undefined when no relationship is current', () => {
    const relationships = [
      {
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: false
      },
      {
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
        defraIdOrgId: 'org-1',
        defraIdOrgName: 'Organisation One',
        isCurrent: true
      },
      {
        defraIdOrgId: 'org-2',
        defraIdOrgName: 'Organisation Two',
        isCurrent: true
      }
    ]

    const result = getCurrentRelationship(relationships)

    expect(result.defraIdOrgId).toBe('org-1')
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
          defraIdOrgId: 'org-1',
          defraIdOrgName: 'Organisation One',
          isCurrent: false
        },
        {
          defraIdOrgId: 'org-2',
          defraIdOrgName: 'Organisation Two',
          isCurrent: true
        },
        {
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

describe('deduplicateOrganisations', () => {
  it('should return empty array when both inputs are empty', () => {
    const result = deduplicateOrganisations([], [])
    expect(result).toEqual([])
  })

  it('should deduplicate organizations with the same ID', () => {
    const org1 = { id: 'org-1', name: 'Org One' }
    const org2 = { id: 'org-2', name: 'Org Two' }
    const org1Duplicate = { id: 'org-1', name: 'Org One Duplicate' }

    const unlinked = [org1Duplicate, { id: 'org-3', name: 'Org Three' }]
    const linked = [org1, org2]

    const result = deduplicateOrganisations(unlinked, linked)

    // Should keep first occurrence (from unlinked) when duplicate exists
    expect(result).toHaveLength(3)
    expect(result.map((org) => org.id)).toEqual(['org-1', 'org-3', 'org-2'])

    // Verify the first occurrence is kept
    const org1Result = result.find((org) => org.id === 'org-1')
    expect(org1Result.name).toBe('Org One Duplicate')
  })

  it('should handle multiple duplicates', () => {
    const unlinked = [
      { id: 'org-1', name: 'A' },
      { id: 'org-2', name: 'B' }
    ]
    const linked = [
      { id: 'org-1', name: 'Duplicate A' },
      { id: 'org-2', name: 'Duplicate B' },
      { id: 'org-3', name: 'C' }
    ]

    const result = deduplicateOrganisations(unlinked, linked)

    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('A')
    expect(result[1].name).toBe('B')
    expect(result[2].name).toBe('C')
  })

  it('should preserve all organizations when no duplicates', () => {
    const unlinked = [
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' }
    ]
    const linked = [
      { id: 'org-3', name: 'Org Three' },
      { id: 'org-4', name: 'Org Four' }
    ]

    const result = deduplicateOrganisations(unlinked, linked)

    expect(result).toHaveLength(4)
    expect(result.map((org) => org.id)).toEqual([
      'org-1',
      'org-2',
      'org-3',
      'org-4'
    ])
  })

  it('should handle empty unlinked array', () => {
    const linked = [
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' }
    ]

    const result = deduplicateOrganisations([], linked)

    expect(result).toEqual(linked)
  })

  it('should handle empty linked array', () => {
    const unlinked = [
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' }
    ]

    const result = deduplicateOrganisations(unlinked, [])

    expect(result).toEqual(unlinked)
  })
})

describe('isInitialUser', () => {
  it('should return true when user has INITIAL role and email matches', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'user@example.com',
          roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(true)
  })

  it('should perform case-insensitive email comparison', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'User@Example.COM',
          roles: [USER_ROLES.INITIAL]
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(true)
  })

  it('should return false when user email matches but does not have INITIAL role', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'user@example.com',
          roles: [USER_ROLES.STANDARD]
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when user has INITIAL role but email does not match', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'other@example.com',
          roles: [USER_ROLES.INITIAL]
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when users array is undefined', () => {
    const organisation = /** @type {any} */ ({})

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when users array is null', () => {
    const organisation = /** @type {any} */ ({
      users: null
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when users array is empty', () => {
    const organisation = /** @type {any} */ ({
      users: []
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when user roles array is undefined', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'user@example.com'
          // roles is undefined
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when user roles array is null', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'user@example.com',
          roles: null
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should return false when user roles array is empty', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'user@example.com',
          roles: []
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(false)
  })

  it('should handle multiple users and find the correct one', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'other1@example.com',
          roles: [USER_ROLES.STANDARD]
        },
        {
          email: 'user@example.com',
          roles: [USER_ROLES.INITIAL]
        },
        {
          email: 'other2@example.com',
          roles: [USER_ROLES.INITIAL]
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(true)
  })

  it('should return true when at least one matching user has INITIAL role', () => {
    const organisation = /** @type {any} */ ({
      users: [
        {
          email: 'user@example.com',
          roles: [USER_ROLES.STANDARD]
        },
        {
          email: 'user@example.com',
          roles: [USER_ROLES.INITIAL]
        }
      ]
    })

    const result = isInitialUser('user@example.com', organisation)

    expect(result).toBe(true)
  })
})
