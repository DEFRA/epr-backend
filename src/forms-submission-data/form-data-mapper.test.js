import {
  mapWasteProcessingType,
  mapNation,
  mapBusinessType,
  mapRegulator,
  mapPartnerType,
  mapPartnershipType
} from './form-data-mapper.js'
import {
  WASTE_PROCESSING_TYPE,
  NATION,
  BUSINESS_TYPE,
  REGULATOR,
  PARTNER_TYPE,
  PARTNERSHIP_TYPE
} from '#domain/organisations.js'

describe('mapWasteProcessingType', () => {
  it('should return both types for "Reprocessor and exporter"', () => {
    const result = mapWasteProcessingType('Reprocessor and exporter')

    expect(result).toEqual([
      WASTE_PROCESSING_TYPE.REPROCESSOR,
      WASTE_PROCESSING_TYPE.EXPORTER
    ])
  })

  it('should return reprocessor for "Reprocessor"', () => {
    const result = mapWasteProcessingType('Reprocessor')

    expect(result).toEqual([WASTE_PROCESSING_TYPE.REPROCESSOR])
  })

  it('should return exporter for "Exporter"', () => {
    const result = mapWasteProcessingType('Exporter')

    expect(result).toEqual([WASTE_PROCESSING_TYPE.EXPORTER])
  })

  it('should throw error for invalid value', () => {
    expect(() => mapWasteProcessingType('Invalid Value')).toThrow(
      'Invalid waste processing type: "Invalid Value". Expected "Reprocessor", "Exporter", or "Reprocessor and exporter"'
    )
  })

  it('should throw error for empty string', () => {
    expect(() => mapWasteProcessingType('')).toThrow(
      'Invalid waste processing type: "". Expected "Reprocessor", "Exporter", or "Reprocessor and exporter"'
    )
  })

  it('should throw error for null', () => {
    expect(() => mapWasteProcessingType(null)).toThrow(
      'Invalid waste processing type: "null". Expected "Reprocessor", "Exporter", or "Reprocessor and exporter"'
    )
  })

  it('should throw error for undefined', () => {
    expect(() => mapWasteProcessingType(undefined)).toThrow(
      'Invalid waste processing type: "undefined". Expected "Reprocessor", "Exporter", or "Reprocessor and exporter"'
    )
  })
})

describe('mapNation', () => {
  it('should return england for "England"', () => {
    const result = mapNation('England')

    expect(result).toEqual(NATION.ENGLAND)
  })

  it('should return scotland for "Scotland"', () => {
    const result = mapNation('Scotland')

    expect(result).toEqual(NATION.SCOTLAND)
  })

  it('should return wales for "Wales"', () => {
    const result = mapNation('Wales')

    expect(result).toEqual(NATION.WALES)
  })

  it('should return northern_ireland for "Northern Ireland"', () => {
    const result = mapNation('Northern Ireland')

    expect(result).toEqual(NATION.NORTHERN_IRELAND)
  })

  it('should throw error for invalid value', () => {
    expect(() => mapNation('Invalid Nation')).toThrow(
      'Invalid nation: "Invalid Nation". Expected "England", "Scotland", "Wales", or "Northern Ireland"'
    )
  })

  it('should throw error for empty string', () => {
    expect(() => mapNation('')).toThrow(
      'Invalid nation: "". Expected "England", "Scotland", "Wales", or "Northern Ireland"'
    )
  })

  it('should throw error for null', () => {
    expect(() => mapNation(null)).toThrow(
      'Invalid nation: "null". Expected "England", "Scotland", "Wales", or "Northern Ireland"'
    )
  })

  it('should throw error for undefined', () => {
    expect(() => mapNation(undefined)).toThrow(
      'Invalid nation: "undefined". Expected "England", "Scotland", "Wales", or "Northern Ireland"'
    )
  })
})

describe('mapBusinessType', () => {
  it('should return individual for "An individual"', () => {
    const result = mapBusinessType('An individual')

    expect(result).toEqual(BUSINESS_TYPE.INDIVIDUAL)
  })

  it('should return unincorporated for "Unincorporated association"', () => {
    const result = mapBusinessType('Unincorporated association')

    expect(result).toEqual(BUSINESS_TYPE.UNINCORPORATED)
  })

  it('should return partnership for "A partnership under the Partnership Act 1890"', () => {
    const result = mapBusinessType(
      'A partnership under the Partnership Act 1890'
    )

    expect(result).toEqual(BUSINESS_TYPE.PARTNERSHIP)
  })

  it('should handle values with extra whitespace', () => {
    const result = mapBusinessType('  An individual  ')

    expect(result).toEqual(BUSINESS_TYPE.INDIVIDUAL)
  })

  it('should throw error for invalid value', () => {
    expect(() => mapBusinessType('Invalid Business Type')).toThrow(
      'Invalid business type: "Invalid Business Type". Expected "An individual", "Unincorporated association", or "A partnership under the Partnership Act 1890"'
    )
  })

  it('should return null for empty string', () => {
    expect(mapBusinessType('')).toBeUndefined()
  })

  it('should return to undefined for null', () => {
    expect(mapBusinessType(null)).toBeUndefined()
  })
})

describe('mapRegulator', () => {
  it('should map EA to regulator enum', () => {
    expect(mapRegulator('EA')).toBe(REGULATOR.EA)
  })

  it('should map NRW to regulator enum', () => {
    expect(mapRegulator('NRW')).toBe(REGULATOR.NRW)
  })

  it('should map SEPA to regulator enum', () => {
    expect(mapRegulator('SEPA')).toBe(REGULATOR.SEPA)
  })

  it('should map NIEA to regulator enum', () => {
    expect(mapRegulator('NIEA')).toBe(REGULATOR.NIEA)
  })

  it('should handle whitespace', () => {
    expect(mapRegulator('  EA  ')).toBe(REGULATOR.EA)
  })

  it('should throw error for invalid regulator', () => {
    expect(() => mapRegulator('INVALID')).toThrow(
      'Invalid regulator: "INVALID". Expected "EA", "NRW", "SEPA", or "NIEA"'
    )
  })

  it('should return undefined for null or undefined', () => {
    expect(mapRegulator(null)).toBeUndefined()
    expect(mapRegulator(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(mapRegulator('')).toBeUndefined()
  })
})

describe('mapPartnerType', () => {
  it('should map Corporate partner to partner type enum', () => {
    expect(mapPartnerType('Corporate partner')).toBe(PARTNER_TYPE.CORPORATE)
  })

  it('should map Company partner to partner type enum', () => {
    expect(mapPartnerType('Company partner')).toBe(PARTNER_TYPE.COMPANY)
  })

  it('should map Individual partner to partner type enum', () => {
    expect(mapPartnerType('Individual partner')).toBe(PARTNER_TYPE.INDIVIDUAL)
  })

  it('should handle whitespace', () => {
    expect(mapPartnerType('  Corporate partner  ')).toBe(PARTNER_TYPE.CORPORATE)
  })

  it('should throw error for invalid partner type', () => {
    expect(() => mapPartnerType('INVALID')).toThrow(
      'Invalid partner type: "INVALID". Expected "Corporate partner", "Company partner", or "Individual partner"'
    )
  })

  it('should return undefined for null', () => {
    expect(mapPartnerType(null)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(mapPartnerType('')).toBeUndefined()
  })
})

describe('mapPartnershipType', () => {
  it('should map A limited partnership to partnership type enum', () => {
    expect(mapPartnershipType('A limited partnership')).toBe(
      PARTNERSHIP_TYPE.LTD
    )
  })

  it('should map A limited liability partnership to partnership type enum', () => {
    expect(mapPartnershipType('A limited liability partnership')).toBe(
      PARTNERSHIP_TYPE.LTD_LIABILITY
    )
  })

  it('should handle whitespace', () => {
    expect(mapPartnershipType('  A limited partnership  ')).toBe(
      PARTNERSHIP_TYPE.LTD
    )
  })

  it('should throw error for invalid partnership type', () => {
    expect(() => mapPartnershipType('INVALID')).toThrow(
      'Invalid partnership type: "INVALID". Expected "A limited partnership", "A limited liability partnership"'
    )
  })

  it('should return undefined for null', () => {
    expect(mapPartnershipType(null)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(mapPartnershipType('')).toBeUndefined()
  })

  it('should return undefined for No string', () => {
    expect(mapPartnershipType('No')).toBeUndefined()
  })
})
