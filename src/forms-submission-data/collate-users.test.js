import { describe, expect, it } from 'vitest'
import { collateUsers } from './collate-users.js'

describe('collateUsers', () => {
  describe('submitterContactDetails', () => {
    it('should include submitter contact details as a user', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john.smith@example.com'
        }
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        fullName: 'John Smith',
        email: 'john.smith@example.com',
        isInitialUser: true,
        roles: ['standard_user']
      })
    })

    it('should handle missing submitterContactDetails', () => {
      const organisation = {}

      const result = collateUsers(organisation)

      expect(result).toEqual([])
    })

    it('should normalise email to lowercase for deduplication', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'John.Smith@Example.COM'
        }
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('John.Smith@Example.COM')
    })
  })

  describe('deduplication', () => {
    it('should deduplicate submitter who also appears as approved person', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john.smith@example.com'
        },
        registrations: [
          {
            approvedPersons: [
              {
                fullName: 'John Smith',
                email: 'john.smith@example.com'
              }
            ]
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        fullName: 'John Smith',
        email: 'john.smith@example.com',
        isInitialUser: true,
        roles: ['standard_user']
      })
    })

    it('should deduplicate by email case-insensitively', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john.smith@example.com'
        },
        registrations: [
          {
            approvedPersons: [
              {
                fullName: 'John Smith',
                email: 'John.Smith@Example.COM'
              }
            ]
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
    })

    it('should deduplicate submitter who also appears as accreditation signatory', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'Carol White',
          email: 'carol.white@example.com'
        },
        accreditations: [
          {
            prnIssuance: {
              signatories: [
                {
                  fullName: 'Carol White',
                  email: 'carol.white@example.com'
                }
              ]
            }
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        fullName: 'Carol White',
        email: 'carol.white@example.com',
        isInitialUser: true,
        roles: ['standard_user']
      })
    })

    it('should deduplicate across all three sources', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        registrations: [
          {
            approvedPersons: [
              {
                fullName: 'John Smith',
                email: 'john@example.com'
              }
            ]
          }
        ],
        accreditations: [
          {
            prnIssuance: {
              signatories: [
                {
                  fullName: 'John Smith',
                  email: 'JOHN@EXAMPLE.COM'
                }
              ]
            }
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('john@example.com')
    })
  })

  describe('multiple sources', () => {
    it('should collate users from submitter, registrations and accreditations', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        registrations: [
          {
            approvedPersons: [
              {
                fullName: 'Jane Doe',
                email: 'jane@example.com'
              }
            ]
          }
        ],
        accreditations: [
          {
            prnIssuance: {
              signatories: [
                {
                  fullName: 'Bob Wilson',
                  email: 'bob@example.com'
                }
              ]
            }
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(3)
      expect(result.map((u) => u.email)).toEqual(
        expect.arrayContaining([
          'john@example.com',
          'jane@example.com',
          'bob@example.com'
        ])
      )
    })
  })

  describe('handle missing data', () => {
    it('should handle null approvedPersons array', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        registrations: [
          {
            approvedPersons: null
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('john@example.com')
    })

    it('should handle undefined approvedPersons array', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        registrations: [{}]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('john@example.com')
    })

    it('should handle missing prnIssuance', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        accreditations: [{}]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('john@example.com')
    })

    it('should handle null signatories array', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        accreditations: [
          {
            prnIssuance: {
              signatories: null
            }
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('john@example.com')
    })

    it('should handle undefined signatories array', () => {
      const organisation = {
        submitterContactDetails: {
          fullName: 'John Smith',
          email: 'john@example.com'
        },
        accreditations: [
          {
            prnIssuance: {}
          }
        ]
      }

      const result = collateUsers(organisation)

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('john@example.com')
    })
  })
})
