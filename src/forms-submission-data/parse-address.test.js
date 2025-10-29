import { parseUkAddress } from './parse-address.js'
import nonRegisteredUkSoleTrader from '#data/fixtures/ea/organisation/non-registered-uk-sole-trader.json' with { type: 'json' }
import registeredNoPartnership from '#data/fixtures/ea/organisation/registered-no-partnership.json' with { type: 'json' }
import registeredLtdPartnership from '#data/fixtures/ea/organisation/registered-ltd-partnership.json' with { type: 'json' }
import reprocessorAllMaterials from '#data/fixtures/ea/registration/reprocessor-all-materials.json' with { type: 'json' }
import exporterRegistration from '#data/fixtures/ea/registration/exporter.json' with { type: 'json' }

describe('parseUkAddress', () => {
  describe('successful parsing', () => {
    it('should parse address with line1, town, postcode from fixture', () => {
      const result = parseUkAddress(
        nonRegisteredUkSoleTrader.rawSubmissionData.data.main.VATjEi
      )

      expect(result).toEqual({
        line1: '45 High Street',
        town: 'Birmingham',
        postcode: 'B2 4AA',
        country: 'UK'
      })
    })

    it('should parse address with line1, line2, town, county, postcode', () => {
      const result = parseUkAddress(
        '45,High Street,Birmingham,West Midlands,B2 4AA'
      )

      expect(result).toEqual({
        line1: '45',
        line2: 'High Street',
        town: 'Birmingham',
        county: 'West Midlands',
        postcode: 'B2 4AA',
        country: 'UK'
      })
    })

    it('should handle postcode without space', () => {
      const result = parseUkAddress('123 Main St,London,SE1 9SG')

      expect(result).toEqual({
        line1: '123 Main St',
        town: 'London',
        postcode: 'SE1 9SG',
        country: 'UK'
      })
    })
  })

  describe('fallback to fullAddress with known fields', () => {
    it('should return line1, postcode, and fullAddress when comma in line1 field', () => {
      const result = parseUkAddress('123, Main St,London,SE1 9SG')

      expect(result).toEqual({
        line1: '123',
        postcode: 'SE1 9SG',
        fullAddress: '123, Main St,London,SE1 9SG',
        country: 'UK'
      })
    })

    it('should return line1, postcode, and fullAddress when 2 middle parts (ambiguous) from fixture', () => {
      const result = parseUkAddress(
        exporterRegistration.rawSubmissionData.data.main.pGYoub
      )

      expect(result).toEqual({
        line1: '45',
        postcode: 'B2 4AA',
        fullAddress: '45,High Street,Birmingham,B2 4AA',
        country: 'UK'
      })
    })

    it('should return line1, postcode, and fullAddress with duplicate town/county from fixture', () => {
      const result = parseUkAddress(
        reprocessorAllMaterials.rawSubmissionData.data.main.Laiblc
      )

      expect(result).toEqual({
        line1: '78 Portland Place',
        postcode: 'W1B 1NT',
        fullAddress: '78 Portland Place,London,London,W1B 1NT',
        country: 'UK'
      })
    })

    it('should return line1, postcode, and fullAddress when ambiguous address from fixture', () => {
      const result = parseUkAddress(
        reprocessorAllMaterials.rawSubmissionData.data.main.VHfukU
      )

      expect(result).toEqual({
        line1: '90',
        postcode: 'W1B 1NT',
        fullAddress: '90,Portland Place,London,W1B 1NT',
        country: 'UK'
      })
    })

    it('should return line1, postcode, and fullAddress when 2 middle parts from fixture', () => {
      const result = parseUkAddress(
        registeredLtdPartnership.rawSubmissionData.data.main.GNVlAd
      )

      expect(result).toEqual({
        line1: 'Unit 15',
        postcode: 'M1 5JG',
        fullAddress: 'Unit 15, Innovation Park,Manchester,M1 5JG',
        country: 'UK'
      })
    })

    it('should return line1, postcode, and fullAddress when 4+ middle parts from fixture', () => {
      const result = parseUkAddress(
        registeredNoPartnership.rawSubmissionData.data.main.GNVlAd
      )

      expect(result).toEqual({
        line1: 'Unit 15',
        postcode: 'M1 5JG',
        fullAddress:
          'Unit 15, Innovation Park,Technology Way,Manchester,Greater Manchester,M1 5JG',
        country: 'UK'
      })
    })

    it('should return fullAddress when not enough parts', () => {
      const result = parseUkAddress('Only two parts,B2 4AA')

      expect(result).toEqual({
        fullAddress: 'Only two parts,B2 4AA',
        country: 'UK'
      })
    })

    it('should return fullAddress when no commas', () => {
      const result = parseUkAddress('45 High Street Birmingham B2 4AA')

      expect(result).toEqual({
        fullAddress: '45 High Street Birmingham B2 4AA',
        country: 'UK'
      })
    })
  })

  describe('edge cases', () => {
    it('should return line1, postcode, and fullAddress when ambiguous despite whitespace', () => {
      const result = parseUkAddress(
        '  45  ,  High Street  ,  Birmingham  ,  B2 4AA  '
      )

      expect(result).toEqual({
        line1: '45',
        postcode: 'B2 4AA',
        fullAddress: '  45  ,  High Street  ,  Birmingham  ,  B2 4AA  ',
        country: 'UK'
      })
    })

    it('should filter empty parts from consecutive commas', () => {
      const result = parseUkAddress('45 High Street,,,Birmingham,B2 4AA')

      expect(result).toEqual({
        line1: '45 High Street',
        town: 'Birmingham',
        postcode: 'B2 4AA',
        country: 'UK'
      })
    })

    it('should return undefined when input is empty', () => {
      expect(parseUkAddress('')).toBeUndefined()
    })

    it('should return undefined when input is null', () => {
      expect(parseUkAddress(null)).toBeUndefined()
    })
  })
})
