import { describe, it, expect } from 'vitest'
import {
  transformGlassRegistration,
  transformGlassAccreditation,
  migrateOrganisation,
  shouldMigrateOrganisation
} from './glass-migration.js'

describe('Glass Migration', () => {
  describe('transformGlassRegistration', () => {
    it('should rename GL suffix to GR for glass_re_melt only', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GL',
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-2025-GR')
      expect(result[0].glassRecyclingProcess).toEqual(['glass_re_melt'])
    })

    it('should rename GL suffix to GO for glass_other only', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GL',
        material: 'glass',
        glassRecyclingProcess: ['glass_other']
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-2025-GO')
      expect(result[0].glassRecyclingProcess).toEqual(['glass_other'])
    })

    it('should split registration into two when both glass processes present', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GL',
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
        accreditationId: 'acc-1'
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(2)

      const remeltReg = result.find((r) =>
        r.glassRecyclingProcess.includes('glass_re_melt')
      )
      const otherReg = result.find((r) =>
        r.glassRecyclingProcess.includes('glass_other')
      )

      expect(remeltReg.registrationNumber).toBe('REG-2025-GR')
      expect(remeltReg.glassRecyclingProcess).toEqual(['glass_re_melt'])
      expect(remeltReg.id).toBe('reg-1') // Original keeps its ID

      expect(otherReg.registrationNumber).toBe('REG-2025-GO')
      expect(otherReg.glassRecyclingProcess).toEqual(['glass_other'])
      expect(otherReg.id).not.toBe('reg-1') // New record gets new ID
    })

    it('should return unchanged if not a GL suffix', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GR',
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(registration)
    })

    it('should return unchanged if no registrationNumber', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: null,
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(registration)
    })

    it('should return unchanged if not glass material', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-PA',
        material: 'paper',
        glassRecyclingProcess: null
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(registration)
    })

    it('should handle null glassRecyclingProcess', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GL',
        material: 'glass',
        glassRecyclingProcess: null
      }

      const result = transformGlassRegistration(registration)

      // Should still return unchanged as we can't determine the suffix without process info
      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-2025-GL')
    })

    it('should handle undefined glassRecyclingProcess', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GL',
        material: 'glass'
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-2025-GL')
    })

    it('should handle empty array glassRecyclingProcess', () => {
      const registration = {
        id: 'reg-1',
        registrationNumber: 'REG-2025-GL',
        material: 'glass',
        glassRecyclingProcess: []
      }

      const result = transformGlassRegistration(registration)

      expect(result).toHaveLength(1)
      expect(result[0].registrationNumber).toBe('REG-2025-GL')
    })
  })

  describe('transformGlassAccreditation', () => {
    it('should rename GL suffix to GR for glass_re_melt only', () => {
      const accreditation = {
        id: 'acc-1',
        accreditationNumber: 'ACC-2025-GL',
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      }

      const result = transformGlassAccreditation(accreditation)

      expect(result).toHaveLength(1)
      expect(result[0].accreditationNumber).toBe('ACC-2025-GR')
    })

    it('should rename GL suffix to GO for glass_other only', () => {
      const accreditation = {
        id: 'acc-1',
        accreditationNumber: 'ACC-2025-GL',
        material: 'glass',
        glassRecyclingProcess: ['glass_other']
      }

      const result = transformGlassAccreditation(accreditation)

      expect(result).toHaveLength(1)
      expect(result[0].accreditationNumber).toBe('ACC-2025-GO')
    })

    it('should split accreditation into two when both glass processes present', () => {
      const accreditation = {
        id: 'acc-1',
        accreditationNumber: 'ACC-2025-GL',
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt', 'glass_other']
      }

      const result = transformGlassAccreditation(accreditation)

      expect(result).toHaveLength(2)

      const remeltAcc = result.find((a) =>
        a.glassRecyclingProcess.includes('glass_re_melt')
      )
      const otherAcc = result.find((a) =>
        a.glassRecyclingProcess.includes('glass_other')
      )

      expect(remeltAcc.accreditationNumber).toBe('ACC-2025-GR')
      expect(otherAcc.accreditationNumber).toBe('ACC-2025-GO')
    })

    it('should return unchanged if not glass material', () => {
      const accreditation = {
        id: 'acc-1',
        accreditationNumber: 'ACC-2025-PA',
        material: 'paper'
      }

      const result = transformGlassAccreditation(accreditation)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(accreditation)
    })

    it('should return unchanged if already migrated (GR suffix)', () => {
      const accreditation = {
        id: 'acc-1',
        accreditationNumber: 'ACC-2025-GR',
        material: 'glass',
        glassRecyclingProcess: ['glass_re_melt']
      }

      const result = transformGlassAccreditation(accreditation)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(accreditation)
    })
  })

  describe('shouldMigrateOrganisation', () => {
    it('should return true if organisation has glass registration with GL suffix', () => {
      const org = {
        registrations: [
          {
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      }

      expect(shouldMigrateOrganisation(org)).toBe(true)
    })

    it('should return true if organisation has glass accreditation with GL suffix', () => {
      const org = {
        registrations: [],
        accreditations: [
          {
            accreditationNumber: 'ACC-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_other']
          }
        ]
      }

      expect(shouldMigrateOrganisation(org)).toBe(true)
    })

    it('should return false if no glass registrations or accreditations with GL suffix', () => {
      const org = {
        registrations: [
          {
            registrationNumber: 'REG-2025-PA',
            material: 'paper'
          }
        ],
        accreditations: []
      }

      expect(shouldMigrateOrganisation(org)).toBe(false)
    })

    it('should return false if glass registrations already migrated (GR/GO suffix)', () => {
      const org = {
        registrations: [
          {
            registrationNumber: 'REG-2025-GR',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      }

      expect(shouldMigrateOrganisation(org)).toBe(false)
    })
  })

  describe('migrateOrganisation', () => {
    it('should migrate registrations and accreditations', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt'],
            accreditationId: 'acc-1'
          }
        ],
        accreditations: [
          {
            id: 'acc-1',
            accreditationNumber: 'ACC-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ]
      }

      const result = migrateOrganisation(org)

      expect(result.registrations[0].registrationNumber).toBe('REG-2025-GR')
      expect(result.accreditations[0].accreditationNumber).toBe('ACC-2025-GR')
    })

    it('should split both registration and accreditation when both have dual process', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
            accreditationId: 'acc-1'
          }
        ],
        accreditations: [
          {
            id: 'acc-1',
            accreditationNumber: 'ACC-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other']
          }
        ]
      }

      const result = migrateOrganisation(org)

      expect(result.registrations).toHaveLength(2)
      expect(result.accreditations).toHaveLength(2)

      // Check registrations are linked to correct accreditations
      const remeltReg = result.registrations.find(
        (r) => r.registrationNumber === 'REG-2025-GR'
      )
      const otherReg = result.registrations.find(
        (r) => r.registrationNumber === 'REG-2025-GO'
      )
      const remeltAcc = result.accreditations.find(
        (a) => a.accreditationNumber === 'ACC-2025-GR'
      )
      const otherAcc = result.accreditations.find(
        (a) => a.accreditationNumber === 'ACC-2025-GO'
      )

      expect(remeltReg.accreditationId).toBe(remeltAcc.id)
      expect(otherReg.accreditationId).toBe(otherAcc.id)
    })

    it('should preserve non-glass registrations unchanged', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-PA',
            material: 'paper'
          },
          {
            id: 'reg-2',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      }

      const result = migrateOrganisation(org)

      expect(result.registrations).toHaveLength(2)
      expect(result.registrations[0].registrationNumber).toBe('REG-2025-PA')
      expect(result.registrations[1].registrationNumber).toBe('REG-2025-GR')
    })

    it('should preserve accreditationId when accreditation is not split', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt'],
            accreditationId: 'acc-1'
          }
        ],
        accreditations: [
          {
            id: 'acc-1',
            accreditationNumber: 'ACC-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ]
      }

      const result = migrateOrganisation(org)

      // Accreditation not split, so registration should keep original accreditationId
      expect(result.registrations[0].accreditationId).toBe('acc-1')
    })

    it('should handle registration with accreditationId linking to non-existent accreditation', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt'],
            accreditationId: 'non-existent'
          }
        ],
        accreditations: []
      }

      const result = migrateOrganisation(org)

      // Should keep original accreditationId (no mapping found)
      expect(result.registrations[0].accreditationId).toBe('non-existent')
    })

    it('should handle registration without accreditationId', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ],
        accreditations: []
      }

      const result = migrateOrganisation(org)

      expect(result.registrations[0].accreditationId).toBeUndefined()
    })

    it('should handle organisation with no registrations or accreditations', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [],
        accreditations: []
      }

      const result = migrateOrganisation(org)

      expect(result.registrations).toHaveLength(0)
      expect(result.accreditations).toHaveLength(0)
    })

    it('should handle organisation with undefined registrations and accreditations', () => {
      const org = {
        id: 'org-1',
        version: 1
      }

      const result = migrateOrganisation(org)

      expect(result.registrations).toHaveLength(0)
      expect(result.accreditations).toHaveLength(0)
    })

    it('should skip single-process accreditations when building ID mapping', () => {
      // This tests that single-process accreditations (not split) are skipped in mapping
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-001-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
            accreditationId: 'acc-both'
          },
          {
            id: 'reg-2',
            registrationNumber: 'REG-2025-002-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt'],
            accreditationId: 'acc-single'
          }
        ],
        accreditations: [
          {
            id: 'acc-both',
            accreditationNumber: 'ACC-2025-001-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other']
          },
          {
            id: 'acc-single',
            accreditationNumber: 'ACC-2025-002-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt']
          }
        ]
      }

      const result = migrateOrganisation(org)

      // Single-process accreditation should keep its ID unchanged
      const singleProcessReg = result.registrations.find(
        (r) => r.registrationNumber === 'REG-2025-002-GR'
      )
      expect(singleProcessReg.accreditationId).toBe('acc-single')
    })

    it('should skip non-glass accreditations when building ID mapping', () => {
      // This tests that non-glass accreditations are skipped in the mapping loop
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
            accreditationId: 'acc-glass'
          }
        ],
        accreditations: [
          {
            id: 'acc-paper',
            accreditationNumber: 'ACC-2025-PA',
            material: 'paper'
          },
          {
            id: 'acc-glass',
            accreditationNumber: 'ACC-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other']
          }
        ]
      }

      const result = migrateOrganisation(org)

      // Paper accreditation should be unchanged
      const paperAcc = result.accreditations.find(
        (a) => a.accreditationNumber === 'ACC-2025-PA'
      )
      expect(paperAcc.material).toBe('paper')
      expect(result.accreditations).toHaveLength(3) // 1 paper + 2 split glass
    })

    it('should keep original accreditationId when registration has null glassRecyclingProcess but links to split accreditation', () => {
      const org = {
        id: 'org-1',
        version: 1,
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: 'REG-2025-GL',
            material: 'glass',
            glassRecyclingProcess: null,
            accreditationId: 'acc-1'
          }
        ],
        accreditations: [
          {
            id: 'acc-1',
            accreditationNumber: 'ACC-2025-GL',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt', 'glass_other']
          }
        ]
      }

      const result = migrateOrganisation(org)

      // Registration has null glassRecyclingProcess so can't determine which split accreditation to link to
      // Should keep original accreditationId
      const reg = result.registrations[0]
      expect(reg.accreditationId).toBe('acc-1')
    })
  })
})
