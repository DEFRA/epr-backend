import { describe, it, expect } from 'vitest'
import { extractUser } from './sqs-command-executor.js'

describe('extractUser', () => {
  it('projects a human submitter, carrying their name when present', () => {
    /** @type {import('#common/hapi-types.js').AuthenticatedRequest} */
    const request = {
      auth: {
        credentials: {
          id: 'user-123',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          scope: ['admin'],
          issuer: 'defra-id'
        }
      }
    }

    expect(extractUser(request)).toEqual({
      id: 'user-123',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      scope: ['admin']
    })
  })

  it('omits the name when the submitter has none', () => {
    /** @type {import('#common/hapi-types.js').AuthenticatedRequest} */
    const request = {
      auth: {
        credentials: {
          id: 'user-456',
          email: 'noname@example.com',
          scope: ['admin'],
          issuer: 'defra-id'
        }
      }
    }

    const user = extractUser(request)

    expect(user).toEqual({
      id: 'user-456',
      email: 'noname@example.com',
      scope: ['admin']
    })
    expect('name' in user).toBe(false)
  })

  it('rejects machine credentials at the boundary', () => {
    /** @type {import('#common/hapi-types.js').AuthenticatedRequest} */
    const request = {
      auth: {
        credentials: {
          id: 'machine-1',
          isMachine: true,
          name: 'RPD'
        }
      }
    }

    expect(() => extractUser(request)).toThrow(
      /Machine credentials cannot drive a summary-log submit/
    )
  })
})
