import { describe, expect, it } from 'vitest'
import { createPathRegex, PATH_PATTERNS } from './path-pattern.js'

describe('createPathRegex', () => {
  it('should create a regex that matches a path with MongoDB ObjectId', () => {
    const regex = createPathRegex('/v1/organisations/{organisationId}/link', {
      organisationId: PATH_PATTERNS.MONGO_OBJECT_ID
    })

    expect(regex.test('/v1/organisations/6507f1f77bcf86cd79943901/link')).toBe(
      true
    )
    expect(regex.test('/v1/organisations/507f1f77bcf86cd799439011/link')).toBe(
      true
    )
  })

  it('should not match paths with invalid MongoDB ObjectId format', () => {
    const regex = createPathRegex('/v1/organisations/{organisationId}/link', {
      organisationId: PATH_PATTERNS.MONGO_OBJECT_ID
    })

    // Too short
    expect(regex.test('/v1/organisations/6507f1f77bcf86cd7994390/link')).toBe(
      false
    )
    // Too long
    expect(
      regex.test('/v1/organisations/6507f1f77bcf86cd799439011a/link')
    ).toBe(false)
    // Invalid characters
    expect(regex.test('/v1/organisations/6507f1f77bcf86cd7994390g/link')).toBe(
      false
    )
  })

  it('should create a regex that matches a path with UUID v4', () => {
    const regex = createPathRegex('/v1/users/{userId}/profile', {
      userId: PATH_PATTERNS.UUID_V4
    })

    expect(
      regex.test('/v1/users/550e8400-e29b-41d4-a716-446655440000/profile')
    ).toBe(true)
  })

  it('should not match paths with different endpoints', () => {
    const regex = createPathRegex('/v1/organisations/{organisationId}/link', {
      organisationId: PATH_PATTERNS.MONGO_OBJECT_ID
    })

    expect(
      regex.test('/v1/organisations/6507f1f77bcf86cd79943901/unlink')
    ).toBe(false)
    expect(regex.test('/v1/organisations/6507f1f77bcf86cd79943901')).toBe(false)
  })

  it('should handle multiple placeholders', () => {
    const regex = createPathRegex(
      '/v1/organisations/{organisationId}/users/{userId}',
      {
        organisationId: PATH_PATTERNS.MONGO_OBJECT_ID,
        userId: PATH_PATTERNS.UUID_V4
      }
    )

    expect(
      regex.test(
        '/v1/organisations/6507f1f77bcf86cd79943901/users/550e8400-e29b-41d4-a716-446655440000'
      )
    ).toBe(true)
  })

  it('should be case insensitive', () => {
    const regex = createPathRegex('/v1/organisations/{organisationId}/link', {
      organisationId: PATH_PATTERNS.MONGO_OBJECT_ID
    })

    expect(regex.test('/v1/organisations/6507F1F77BCF86CD79943901/link')).toBe(
      true
    )
  })

  it('should handle paths with no replacements', () => {
    const regex = createPathRegex('/v1/health')

    expect(regex.test('/v1/health')).toBe(true)
    expect(regex.test('/v1/health/extra')).toBe(false)
  })
})

describe('PATH_PATTERNS', () => {
  it('should export MONGO_OBJECT_ID pattern', () => {
    expect(PATH_PATTERNS.MONGO_OBJECT_ID).toBe('[0-9a-f]{24}')
  })

  it('should export UUID_V4 pattern', () => {
    expect(PATH_PATTERNS.UUID_V4).toBe(
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    )
  })
})
