import { describe, expect, it } from 'vitest'
import {
  overrideConfig,
  systemReferencesRequiringOrgIdMatch
} from './data-migration-config.js'

describe('Data Migration Config', () => {
  describe('overrideConfig', () => {
    it('should load override configuration with registrations and accreditations', () => {
      expect(overrideConfig).toEqual({
        registrations: [
          {
            id: '507f1f77bcf86cd799439011',
            overrides: { systemReference: '507f191e810c19729de860ea' }
          },
          {
            id: '507f1f77bcf86cd799439012',
            overrides: { systemReference: '507f191e810c19729de860eb' }
          }
        ],
        accreditations: [
          {
            id: '65a2f4e8b4c5d9f8e7a6b1c2',
            overrides: { systemReference: '65a2f5a1b4c5d9f8e7a6b1c3' }
          },
          {
            id: '65a2f4e8b4c5d9f8e7a6b1c4',
            overrides: { systemReference: '65a2f5a1b4c5d9f8e7a6b1c5' }
          }
        ]
      })
    })
  })

  describe('systemReferencesRequiringOrgIdMatch', () => {
    it('should return set of systemReferences requiring orgId validation', () => {
      const result = systemReferencesRequiringOrgIdMatch()

      expect(result).toEqual(
        new Set([
          '507f191e810c19729de860ea',
          '507f191e810c19729de860eb',
          '65a2f5a1b4c5d9f8e7a6b1c3',
          '65a2f5a1b4c5d9f8e7a6b1c5'
        ])
      )
    })
  })
})
