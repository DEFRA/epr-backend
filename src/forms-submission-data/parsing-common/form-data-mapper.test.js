import {
  convertToNumber,
  mapBusinessType,
  mapGlassRecyclingProcess,
  mapMaterial,
  mapNation,
  mapPartnershipType,
  mapPartnerType,
  mapRegulator,
  mapTimeScale,
  mapTonnageBand,
  mapValueType,
  mapWastePermitType,
  mapWasteProcessingType,
  normalizeObjectId
} from './form-data-mapper.js'
import {
  BUSINESS_TYPE,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  NATION,
  PARTNER_TYPE,
  PARTNERSHIP_TYPE,
  REGULATOR,
  TIME_SCALE,
  VALUE_TYPE,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

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

describe('mapMaterial', () => {
  it.each([
    ['Glass (R5)', MATERIAL.GLASS],
    ['Paper or board (R3)', MATERIAL.PAPER],
    ['Plastic (R3)', MATERIAL.PLASTIC],
    ['Steel (R4)', MATERIAL.STEEL],
    ['Wood (R3)', MATERIAL.WOOD],
    ['Fibre-based composite material (R3)', MATERIAL.FIBRE],
    ['Aluminium (R4)', MATERIAL.ALUMINIUM]
  ])('should map %s to %s', (input, expected) => {
    expect(mapMaterial(input)).toBe(expected)
  })

  it('should handle whitespace', () => {
    expect(mapMaterial('  Glass (R5)  ')).toBe(MATERIAL.GLASS)
  })

  it('should throw error for invalid material', () => {
    expect(() => mapMaterial('INVALID')).toThrow('Invalid material: "INVALID"')
  })

  it.each([null, undefined, ''])('should return undefined for %s', (input) => {
    expect(mapMaterial(input)).toBeUndefined()
  })
})

describe('mapGlassRecyclingProcess', () => {
  it.each([
    ['Glass re-melt', [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]],
    ['Glass other', [GLASS_RECYCLING_PROCESS.GLASS_OTHER]]
  ])('should map %s to %s', (input, expected) => {
    expect(mapGlassRecyclingProcess(input)).toEqual(expected)
  })

  it('should throw error for Both', () => {
    expect(() => mapGlassRecyclingProcess('Both')).toThrow(
      'Invalid recycling process: "Both"'
    )
  })

  it('should handle whitespace', () => {
    expect(mapGlassRecyclingProcess('  Glass re-melt  ')).toEqual([
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    ])
  })

  it('should throw error for invalid recycling process', () => {
    expect(() => mapGlassRecyclingProcess('INVALID')).toThrow(
      'Invalid recycling process: "INVALID"'
    )
  })

  it.each([null, undefined, ''])('should return undefined for %s', (input) => {
    expect(mapGlassRecyclingProcess(input)).toBeUndefined()
  })
})

describe('mapTimeScale', () => {
  it.each([
    ['Yearly', TIME_SCALE.YEARLY],
    ['Monthly', TIME_SCALE.MONTHLY],
    ['Weekly', TIME_SCALE.WEEKLY]
  ])('should map %s to %s', (input, expected) => {
    expect(mapTimeScale(input)).toBe(expected)
  })

  it('should handle whitespace', () => {
    expect(mapTimeScale('  Yearly  ')).toBe(TIME_SCALE.YEARLY)
  })

  it('should throw error for invalid time scale', () => {
    expect(() => mapTimeScale('INVALID')).toThrow(
      'Invalid time scale: "INVALID". Expected "Yearly", "Monthly", or "Weekly"'
    )
  })

  it.each([null, undefined, ''])('should return undefined for %s', (input) => {
    expect(mapTimeScale(input)).toBeUndefined()
  })
})

describe('mapValueType', () => {
  it.each([
    ['Actual figures', VALUE_TYPE.ACTUAL],
    ['Estimated figures', VALUE_TYPE.ESTIMATED]
  ])('should map %s to %s', (input, expected) => {
    expect(mapValueType(input)).toBe(expected)
  })

  it('should handle whitespace', () => {
    expect(mapValueType('  Actual figures  ')).toBe(VALUE_TYPE.ACTUAL)
  })

  it('should throw error for invalid value type', () => {
    expect(() => mapValueType('INVALID')).toThrow(
      'Invalid value type: "INVALID". Expected "Actual figures" or "Estimated figures"'
    )
  })

  it.each([null, undefined, ''])('should return undefined for %s', (input) => {
    expect(mapValueType(input)).toBeUndefined()
  })
})

describe('mapWastePermitType', () => {
  it.each([
    [
      'Waste management licence or environmental permit',
      WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT
    ],
    [
      'Installation permit or Pollution Prevention and Control (PPC) permit',
      WASTE_PERMIT_TYPE.INSTALLATION_PERMIT
    ],
    ['Waste exemption', WASTE_PERMIT_TYPE.WASTE_EXEMPTION]
  ])('should map "%s" to %s', (input, expected) => {
    expect(mapWastePermitType(input)).toBe(expected)
  })

  it('should handle whitespace', () => {
    expect(
      mapWastePermitType('  Waste management licence or environmental permit  ')
    ).toBe(WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT)
  })

  it('should throw error for invalid waste permit type', () => {
    expect(() => mapWastePermitType('INVALID')).toThrow(
      'Invalid waste permit type: "INVALID". Expected "Waste management licence or environmental permit", "Installation permit or Pollution Prevention and Control (PPC) permit", or "Waste exemption"'
    )
  })

  it.each([null, undefined, ''])('should return undefined for %s', (input) => {
    expect(mapWastePermitType(input)).toBeUndefined()
  })
})

describe('convertToNumber', () => {
  it.each([
    ['10', 10],
    ['0', 0],
    ['123.45', 123.45],
    ['-5', -5],
    ['  42  ', 42],
    [100, 100],
    [0, 0]
  ])('should convert %s to %s', (input, expected) => {
    expect(convertToNumber(input)).toBe(expected)
  })

  it('should throw error for invalid number', () => {
    expect(() => convertToNumber('abc')).toThrow(
      'Invalid value: "abc". Expected a valid number'
    )
  })

  it('should throw error with custom field name', () => {
    expect(() => convertToNumber('invalid', 'authorisedWeight')).toThrow(
      'Invalid authorisedWeight: "invalid". Expected a valid number'
    )
  })

  it.each([null, undefined])('should return undefined for %s', (input) => {
    expect(convertToNumber(input)).toBeUndefined()
  })
})

describe('mapTonnageBand', () => {
  it.each([
    ['Up to 500 tonnes', 'up_to_500'],
    ['Up to 5,000 tonnes', 'up_to_5000'],
    ['Up to 5000 tonnes', 'up_to_5000'],
    ['Up to 10,000 tonnes', 'up_to_10000'],
    ['Up to 10000 tonnes', 'up_to_10000'],
    ['Over 10,000 tonnes', 'over_10000']
  ])('should map "%s" to "%s"', (input, expected) => {
    expect(mapTonnageBand(input)).toBe(expected)
  })

  it('should handle whitespace', () => {
    expect(mapTonnageBand('  Up to 500 tonnes  ')).toBe('up_to_500')
  })

  it('should throw error for invalid tonnage band', () => {
    expect(() => mapTonnageBand('INVALID')).toThrow(
      'Invalid tonnage band: "INVALID". Expected one of: Up to 500 tonnes, Up to 5,000 tonnes, Up to 5000 tonnes, Up to 10,000 tonnes, Up to 10000 tonnes, Over 10,000 tonnes'
    )
  })

  it('should throw error for empty string', () => {
    expect(() => mapTonnageBand('')).toThrow('Tonnage band value is required')
  })

  it('should throw error for null', () => {
    expect(() => mapTonnageBand(null)).toThrow('Tonnage band value is required')
  })

  it('should throw error for undefined', () => {
    expect(() => mapTonnageBand(undefined)).toThrow(
      'Tonnage band value is required'
    )
  })
})

describe('normalizeObjectId', () => {
  it('should convert valid 24-character hex string to ObjectId string', () => {
    const result = normalizeObjectId('507f1f77bcf86cd799439011')
    expect(result).toBe('507f1f77bcf86cd799439011')
    expect(typeof result).toBe('string')
  })

  it('should normalize mixed-case ObjectId to lowercase', () => {
    const result = normalizeObjectId('68dBDA7ac9947d5a6fd51ddF')
    expect(result).toBe('68dbda7ac9947d5a6fd51ddf')
  })

  it('should throw error for invalid ObjectId format', () => {
    expect(() => normalizeObjectId('invalid-id')).toThrow()
  })

  it('should return null when passed null', () => {
    expect(normalizeObjectId(null)).toBeNull()
  })
})
