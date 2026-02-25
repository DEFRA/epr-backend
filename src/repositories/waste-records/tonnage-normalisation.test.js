import { describe, expect, it } from 'vitest'
import { Decimal128 } from 'mongodb'
import {
  mapMongoDocumentToDomain,
  mapVersionDataForMongoPersistence
} from './tonnage-normalisation.js'

describe('tonnage-normalisation', () => {
  describe('mapVersionDataForMongoPersistence', () => {
    it('returns input when versionData is undefined', () => {
      expect(mapVersionDataForMongoPersistence(undefined)).toBeUndefined()
    })

    it('converts all finite numeric fields to Decimal128 and preserves other values', () => {
      const versionData = {
        data: {
          GROSS_WEIGHT: 123.456789,
          PRODUCT_TONNAGE: 10.005,
          COUNT: 3,
          TEXT: 'unchanged',
          nested: {
            NET_WEIGHT: 4.444,
            label: 'nested'
          },
          mixedArray: [
            { TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 7.777 },
            'string-item',
            42,
            null
          ],
          infiniteWeight: Number.POSITIVE_INFINITY
        },
        version: {
          summaryLog: { id: 's1' },
          data: {
            PALLET_WEIGHT: 0.125,
            OTHER_VALUE: 2
          }
        }
      }

      const result = mapVersionDataForMongoPersistence(versionData)

      expect(result.data.GROSS_WEIGHT).toBeInstanceOf(Decimal128)
      expect(result.data.PRODUCT_TONNAGE).toBeInstanceOf(Decimal128)
      expect(result.data.COUNT).toBeInstanceOf(Decimal128)
      expect(result.data.TEXT).toBe('unchanged')
      expect(result.data.nested.NET_WEIGHT).toBeInstanceOf(Decimal128)
      expect(result.data.nested.label).toBe('nested')
      expect(
        result.data.mixedArray[0].TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
      ).toBeInstanceOf(Decimal128)
      expect(result.data.mixedArray[1]).toBe('string-item')
      expect(result.data.mixedArray[2]).toBeInstanceOf(Decimal128)
      expect(result.data.mixedArray[3]).toBeNull()
      expect(result.data.infiniteWeight).toBe(Number.POSITIVE_INFINITY)

      expect(result.version.data.PALLET_WEIGHT).toBeInstanceOf(Decimal128)
      expect(result.version.data.OTHER_VALUE).toBeInstanceOf(Decimal128)
    })

    it('handles null/undefined nested data objects', () => {
      const result = mapVersionDataForMongoPersistence({
        data: null,
        version: { data: undefined }
      })

      expect(result.data).toBeNull()
      expect(result.version.data).toBeUndefined()
    })
  })

  describe('mapMongoDocumentToDomain', () => {
    it('returns input unchanged for non-objects', () => {
      expect(mapMongoDocumentToDomain(null)).toBeNull()
      expect(mapMongoDocumentToDomain(123)).toBe(123)
      expect(mapMongoDocumentToDomain('value')).toBe('value')
    })

    it('converts Decimal128 values back to numbers recursively', () => {
      const doc = {
        GROSS_WEIGHT: Decimal128.fromString('123.456789'),
        nested: {
          PRODUCT_TONNAGE: Decimal128.fromString('10.005')
        },
        arr: [
          Decimal128.fromString('1.25'),
          { NET_WEIGHT: Decimal128.fromString('2.5') },
          'keep'
        ],
        count: 3
      }

      const result = mapMongoDocumentToDomain(doc)

      expect(result.GROSS_WEIGHT).toBe(123.456789)
      expect(result.nested.PRODUCT_TONNAGE).toBe(10.005)
      expect(result.arr[0]).toBe(1.25)
      expect(result.arr[1].NET_WEIGHT).toBe(2.5)
      expect(result.arr[2]).toBe('keep')
      expect(result.count).toBe(3)
    })
  })
})
