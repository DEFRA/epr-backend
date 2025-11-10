import {
  EPR_PREFIX,
  META_PREFIX,
  DATA_PREFIX,
  SKIP_COLUMN,
  isEprMarker
} from './markers.js'

describe('Summary Log Markers', () => {
  describe('constants', () => {
    it('should have correct EPR_PREFIX', () => {
      expect(EPR_PREFIX).toBe('__EPR')
    })

    it('should have correct META_PREFIX', () => {
      expect(META_PREFIX).toBe('__EPR_META_')
    })

    it('should have correct DATA_PREFIX', () => {
      expect(DATA_PREFIX).toBe('__EPR_DATA_')
    })

    it('should have correct SKIP_COLUMN', () => {
      expect(SKIP_COLUMN).toBe('__EPR_SKIP_COLUMN')
    })

    it('should ensure all prefixes start with EPR_PREFIX', () => {
      expect(META_PREFIX.startsWith(EPR_PREFIX)).toBe(true)
      expect(DATA_PREFIX.startsWith(EPR_PREFIX)).toBe(true)
      expect(SKIP_COLUMN.startsWith(EPR_PREFIX)).toBe(true)
    })
  })

  describe('isEprMarker', () => {
    it('should return true for META_PREFIX markers', () => {
      expect(isEprMarker('__EPR_META_REGISTRATION')).toBe(true)
      expect(isEprMarker('__EPR_META_TEMPLATE_VERSION')).toBe(true)
    })

    it('should return true for DATA_PREFIX markers', () => {
      expect(isEprMarker('__EPR_DATA_UPDATE_WASTE_BALANCE')).toBe(true)
      expect(isEprMarker('__EPR_DATA_MONTHLY_REPORTS')).toBe(true)
    })

    it('should return true for SKIP_COLUMN marker', () => {
      expect(isEprMarker('__EPR_SKIP_COLUMN')).toBe(true)
    })

    it('should return true for any string starting with __EPR', () => {
      expect(isEprMarker('__EPR_ANYTHING')).toBe(true)
      expect(isEprMarker('__EPR')).toBe(true)
    })

    it('should return false for regular headers', () => {
      expect(isEprMarker('OUR_REFERENCE')).toBe(false)
      expect(isEprMarker('DATE_RECEIVED')).toBe(false)
      expect(isEprMarker('EWC_CODE')).toBe(false)
    })

    it('should return false for headers with EPR but not at start', () => {
      expect(isEprMarker('MY__EPR_FIELD')).toBe(false)
      expect(isEprMarker('FIELD__EPR')).toBe(false)
    })

    it('should return false for null and undefined', () => {
      expect(isEprMarker(null)).toBe(false)
      expect(isEprMarker(undefined)).toBe(false)
    })

    it('should handle numbers by converting to string', () => {
      expect(isEprMarker(123)).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isEprMarker('')).toBe(false)
    })
  })
})
