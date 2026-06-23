import { describe, expect, it } from 'vitest'
import {
  isAccreditationForRegistration,
  getRegAccKey
} from './submission-keys.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

describe('keyForRegAcc', () => {
  describe('exporter', () => {
    it('generates key with type and material', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.PLASTIC
        })
      ).toBe('exporter::plastic')
    })

    it('includes reprocessingType when present', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.GLASS,
          reprocessingType: REPROCESSING_TYPE.INPUT
        })
      ).toBe('exporter::glass::input')
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.GLASS,
          reprocessingType: REPROCESSING_TYPE.OUTPUT
        })
      ).toBe('exporter::glass::output')
    })
  })

  describe('reprocessor', () => {
    it('generates key with type, material and site postcode', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          site: { address: { postcode: 'W1B 1NT' } }
        })
      ).toBe('reprocessor::plastic::W1B1NT')
    })

    it('includes reprocessingType when present', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.GLASS,
          site: { address: { postcode: 'W1C 2AA' } },
          reprocessingType: REPROCESSING_TYPE.INPUT
        })
      ).toBe('reprocessor::glass::W1C2AA::input')
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.GLASS,
          site: { address: { postcode: 'W1C 2AA' } },
          reprocessingType: REPROCESSING_TYPE.OUTPUT
        })
      ).toBe('reprocessor::glass::W1C2AA::output')
    })
  })

  describe('glass recycling process', () => {
    it('includes glassRecyclingProcess in the key for glass material', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
        })
      ).toBe('exporter::glass::glass_re_melt')
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
        })
      ).toBe('exporter::glass::glass_other')
    })

    it('does not include glassRecyclingProcess in the key for non-glass material', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.PLASTIC,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
        })
      ).toBe('exporter::plastic')
    })

    it('omits glassRecyclingProcess from the key when not provided', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.GLASS
        })
      ).toBe('exporter::glass')
    })

    it('omits glassRecyclingProcess from the key when array has more than one entry', () => {
      expect(
        getRegAccKey({
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [
            GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
            GLASS_RECYCLING_PROCESS.GLASS_OTHER
          ]
        })
      ).toBe('exporter::glass')
    })
  })
})

describe('isAccreditationForRegistration', () => {
  describe('exporter', () => {
    it('matches when type and material are the same', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        true
      )
    })

    it('matches when type,material and reprocessingType are the same', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC,
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC,
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        true
      )
    })

    it('does not match when material differs', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })

    it('does not match when reprocessingType differs', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC,
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.PLASTIC,
        reprocessingType: REPROCESSING_TYPE.OUTPUT
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })
  })

  describe('reprocessor', () => {
    it('matches when type, material and site postcode are the same', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM,
        site: { address: { postcode: 'W1B 1NT' } }
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM,
        site: { address: { postcode: 'W1B 1NT' } }
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        true
      )
    })

    it('matches when type, material, site postcode and reprocessingType are the same', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM,
        site: { address: { postcode: 'W1B 1NT' } },
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM,
        site: { address: { postcode: 'W1B 1NT' } },
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        true
      )
    })

    it('does not match when material differs', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.STEEL,
        site: { address: { postcode: 'W1B 1NT' } }
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM,
        site: { address: { postcode: 'W1B 1NT' } }
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })

    it('does not match when site postcode differs', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.PLASTIC,
        site: { address: { postcode: 'W1B 1NT' } }
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.PLASTIC,
        site: { address: { postcode: 'W1C 2AA' } }
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })

    it('does not match when reprocessingType differs', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.PLASTIC,
        site: { address: { postcode: 'W1B 1NT' } },
        reprocessingType: REPROCESSING_TYPE.INPUT
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.PLASTIC,
        site: { address: { postcode: 'W1B 1NT' } },
        reprocessingType: REPROCESSING_TYPE.OUTPUT
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })

    describe('edge cases', () => {
      it('does not match when postcode is null on both sides', () => {
        const accreditation = {
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          site: { address: { postcode: null } }
        }
        const registration = {
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          site: { address: { postcode: null } }
        }
        expect(
          isAccreditationForRegistration(accreditation, registration)
        ).toBe(false)
      })

      it('does not match different waste processing types', () => {
        const accreditation = {
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.PLASTIC,
          site: { address: { postcode: null } }
        }
        const registration = {
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          site: { address: { postcode: 'W1B 1NT' } }
        }
        expect(
          isAccreditationForRegistration(accreditation, registration)
        ).toBe(false)
      })
    })
  })

  describe('glass recycling process', () => {
    it('matches when glassRecyclingProcess is the same', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        true
      )
    })

    it('does not match when glassRecyclingProcess differs', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })

    it('does not match when only one side has a glassRecyclingProcess', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })

    it('does not match when either side has more than one glassRecyclingProcess', () => {
      const accreditation = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [
          GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
          GLASS_RECYCLING_PROCESS.GLASS_OTHER
        ]
      }
      const registration = {
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
      }
      expect(isAccreditationForRegistration(accreditation, registration)).toBe(
        false
      )
    })
  })
})
