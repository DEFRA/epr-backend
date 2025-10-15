import { mapWasteProcessingType, mapNation } from './form-data-mapper.js'
import { WASTE_PROCESSING_TYPES, NATION } from '#domain/organisation.js'

describe('mapWasteProcessingType', () => {
  it('should return both types for "Reprocessor and exporter"', () => {
    const result = mapWasteProcessingType('Reprocessor and exporter')

    expect(result).toEqual([
      WASTE_PROCESSING_TYPES.REPROCESSOR,
      WASTE_PROCESSING_TYPES.EXPORTER
    ])
  })

  it('should return reprocessor for "Reprocessor"', () => {
    const result = mapWasteProcessingType('Reprocessor')

    expect(result).toEqual([WASTE_PROCESSING_TYPES.REPROCESSOR])
  })

  it('should return exporter for "Exporter"', () => {
    const result = mapWasteProcessingType('Exporter')

    expect(result).toEqual([WASTE_PROCESSING_TYPES.EXPORTER])
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
