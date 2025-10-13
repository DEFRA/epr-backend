import { parseUkAddress } from './parse-address.js'

describe('parseUkAddress', () => {
  describe('successful parsing', () => {
    it('should parse address with line1, town, postcode', () => {
      const result = parseUkAddress('45 High Street,,Birmingham,B2 4AA')

      expect(result).toEqual({
        line1: '45 High Street',
        line2: '',
        town: 'Birmingham',
        county: '',
        postcode: 'B2 4AA'
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
        postcode: 'B2 4AA'
      })
    })

    it('should handle postcode without space', () => {
      const result = parseUkAddress('123 Main St,London,SE1 9SG')

      expect(result).toEqual({
        line1: '123 Main St',
        line2: '',
        town: 'London',
        county: '',
        postcode: 'SE1 9SG'
      })
    })
  })

  describe('fallback to fullAddress with known fields', () => {
    it('should return line1, postcode, and fullAddress when comma in line1 field', () => {
      const result = parseUkAddress('123, Main St,London,SE1 9SG')

      expect(result).toEqual({
        line1: '123',
        postcode: 'SE1 9SG',
        fullAddress: '123, Main St,London,SE1 9SG'
      })
    })

    it('should return line1, postcode, and fullAddress when 2 middle parts (ambiguous)', () => {
      const result = parseUkAddress('45,High Street,Birmingham,B2 4AA')

      expect(result).toEqual({
        line1: '45',
        postcode: 'B2 4AA',
        fullAddress: '45,High Street,Birmingham,B2 4AA'
      })
    })

    it('should return fullAddress when not enough parts', () => {
      const result = parseUkAddress('Only two parts,B2 4AA')

      expect(result).toEqual({
        fullAddress: 'Only two parts,B2 4AA'
      })
    })

    it('should return fullAddress when no commas', () => {
      const result = parseUkAddress('45 High Street Birmingham B2 4AA')

      expect(result).toEqual({
        fullAddress: '45 High Street Birmingham B2 4AA'
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
        fullAddress: '  45  ,  High Street  ,  Birmingham  ,  B2 4AA  '
      })
    })

    it('should filter empty parts from consecutive commas', () => {
      const result = parseUkAddress('45 High Street,,,Birmingham,B2 4AA')

      expect(result).toEqual({
        line1: '45 High Street',
        line2: '',
        town: 'Birmingham',
        county: '',
        postcode: 'B2 4AA'
      })
    })

    it('should return fullAddress when input is empty', () => {
      const result = parseUkAddress('')

      expect(result).toEqual({
        fullAddress: ''
      })
    })

    it('should return fullAddress when input is null', () => {
      const result = parseUkAddress(null)

      expect(result).toEqual({
        fullAddress: ''
      })
    })

    it('should return fullAddress when input is undefined', () => {
      const result = parseUkAddress(undefined)

      expect(result).toEqual({
        fullAddress: ''
      })
    })
  })
})
