import { describe, expect, it } from 'vitest'
import {
  capitalize,
  formatAddress,
  formatMaterial,
  formatTonnageBand,
  getAnnexIIProcess
} from './formatters.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REG_ACC_STATUS,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

describe('formatters', () => {
  describe('formatAddress', () => {
    it('should format address with all fields', () => {
      const address = {
        line1: '1 Waste Road',
        line2: 'Industrial Estate',
        town: 'London',
        postcode: 'N1 1AA'
      }
      expect(formatAddress(address)).toBe(
        '1 Waste Road, Industrial Estate, London, N1 1AA'
      )
    })

    it('should handle missing optional fields', () => {
      const address = {
        line1: '1 Waste Road',
        town: 'London',
        postcode: 'N1 1AA'
      }
      expect(formatAddress(address)).toBe('1 Waste Road, London, N1 1AA')
    })

    it('should handle address with all possible fields', () => {
      const address = {
        line1: '1 Waste Road',
        line2: 'Floor 2',
        town: 'London',
        county: 'Greater London',
        postcode: 'N1 1AA',
        region: 'South East',
        country: 'England'
      }
      expect(formatAddress(address)).toBe(
        '1 Waste Road, Floor 2, London, Greater London, N1 1AA, South East, England'
      )
    })

    it('should handle null address', () => {
      expect(formatAddress(null)).toBe('')
    })
  })

  describe('capitalize', () => {
    it('should capitalize first letter and lowercase the rest', () => {
      expect(capitalize(REG_ACC_STATUS.APPROVED)).toBe('Approved')
      expect(capitalize(REG_ACC_STATUS.SUSPENDED)).toBe('Suspended')
      expect(capitalize(REGULATOR.EA)).toBe('Ea')
      expect(capitalize(REGULATOR.SEPA)).toBe('Sepa')
      expect(capitalize(WASTE_PROCESSING_TYPE.REPROCESSOR)).toBe('Reprocessor')
      expect(capitalize(WASTE_PROCESSING_TYPE.EXPORTER)).toBe('Exporter')
    })

    it('should return empty string for null or undefined', () => {
      expect(capitalize(null)).toBe('')
    })
  })

  describe('formatMaterial', () => {
    it('should format non-glass materials', () => {
      expect(formatMaterial(MATERIAL.ALUMINIUM)).toBe('Aluminium')
      expect(formatMaterial(MATERIAL.FIBRE)).toBe('Fibre based composite')
      expect(formatMaterial(MATERIAL.PAPER)).toBe('Paper and board')
      expect(formatMaterial(MATERIAL.PLASTIC)).toBe('Plastic')
      expect(formatMaterial(MATERIAL.STEEL)).toBe('Steel')
      expect(formatMaterial(MATERIAL.WOOD)).toBe('Wood')
    })

    it('should format glass with remelt process only', () => {
      expect(
        formatMaterial(MATERIAL.GLASS, [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT])
      ).toBe('Glass-remelt')
    })

    it('should format glass with other process only', () => {
      expect(
        formatMaterial(MATERIAL.GLASS, [GLASS_RECYCLING_PROCESS.GLASS_OTHER])
      ).toBe('Glass-other')
    })

    it('should format glass with both processes', () => {
      expect(
        formatMaterial(MATERIAL.GLASS, [
          GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
          GLASS_RECYCLING_PROCESS.GLASS_OTHER
        ])
      ).toBe('Glass-remelt-other')
    })
  })

  describe('getAnnexIIProcess', () => {
    it('should return correct Annex II process for each material', () => {
      expect(getAnnexIIProcess(MATERIAL.GLASS)).toBe('R5')
      expect(getAnnexIIProcess(MATERIAL.PAPER)).toBe('R3')
      expect(getAnnexIIProcess(MATERIAL.PLASTIC)).toBe('R3')
      expect(getAnnexIIProcess(MATERIAL.STEEL)).toBe('R4')
      expect(getAnnexIIProcess(MATERIAL.WOOD)).toBe('R3')
      expect(getAnnexIIProcess(MATERIAL.FIBRE)).toBe('R3')
      expect(getAnnexIIProcess(MATERIAL.ALUMINIUM)).toBe('R4')
    })

    it('should return empty string for unknown material', () => {
      expect(getAnnexIIProcess('unknown')).toBe('')
    })
  })

  describe('formatTonnageBand', () => {
    it('should format tonnage bands correctly', () => {
      expect(formatTonnageBand('up_to_500')).toBe('Up to 500 tonnes')
      expect(formatTonnageBand('up_to_5000')).toBe('Up to 5,000 tonnes')
      expect(formatTonnageBand('up_to_10000')).toBe('Up to 10,000 tonnes')
      expect(formatTonnageBand('over_10000')).toBe('Over 10,000 tonnes')
    })

    it('should return empty string for unknown tonnage band', () => {
      expect(formatTonnageBand('unknown')).toBe('')
    })
  })
})
