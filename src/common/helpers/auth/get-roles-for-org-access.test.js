import { describe, test, expect } from 'vitest'

import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'
import { ROLES } from '#common/helpers/auth/constants.js'

describe('#getRolesForOrganisationAccess', () => {
  describe('when organisationId is present in params', () => {
    test('returns standardUser role', () => {
      const request = {
        params: {
          organisationId: 'some-org-id'
        }
      }

      const result = getRolesForOrganisationAccess(request)

      expect(result).toEqual([ROLES.standardUser])
    })

    test('returns array with single role', () => {
      const request = {
        params: {
          organisationId: 'any-id'
        }
      }

      const result = getRolesForOrganisationAccess(request)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe('standard_user')
    })
  })

  describe('when organisationId is not present in params', () => {
    test.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', '']
    ])('returns empty array when organisationId is %s', (_, orgIdValue) => {
      const request = {
        params: {
          organisationId: orgIdValue
        }
      }

      const result = getRolesForOrganisationAccess(request)

      expect(result).toEqual([])
    })

    test('returns empty array when params has no organisationId key', () => {
      const request = {
        params: {}
      }

      const result = getRolesForOrganisationAccess(request)

      expect(result).toEqual([])
    })
  })

  describe('return value type', () => {
    test('always returns an array', () => {
      // With organisationId
      let result = getRolesForOrganisationAccess({
        params: { organisationId: 'test' }
      })
      expect(Array.isArray(result)).toBe(true)

      // Without organisationId
      result = getRolesForOrganisationAccess({
        params: { organisationId: undefined }
      })
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
