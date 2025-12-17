import { extractResponseMetaFields } from './extract-response-meta-fields.js'
import { PROCESSING_TYPES } from './meta-fields.js'

describe('extractResponseMetaFields', () => {
  describe('when meta is null or undefined', () => {
    it('returns null for null meta', () => {
      const result = extractResponseMetaFields(null)
      expect(result).toBeNull()
    })

    it('returns null for undefined meta', () => {
      const result = extractResponseMetaFields(undefined)
      expect(result).toBeNull()
    })
  })

  describe('when meta has valid fields', () => {
    it('extracts all fields when all are valid', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: 'Aluminium',
        ACCREDITATION_NUMBER: 'ACC12345'
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER',
        material: 'Aluminium',
        accreditationNumber: 'ACC12345'
      })
    })

    it('extracts processingType and material without accreditationNumber', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_INPUT,
        MATERIAL: 'Paper_and_board'
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'REPROCESSOR_INPUT',
        material: 'Paper_and_board'
      })
    })

    it('extracts only processingType when only that is valid', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_OUTPUT
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'REPROCESSOR_OUTPUT'
      })
    })
  })

  describe('when meta has null or invalid values', () => {
    it('omits null values', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: null,
        ACCREDITATION_NUMBER: null
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER'
      })
    })

    it('omits undefined values', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: undefined,
        ACCREDITATION_NUMBER: undefined
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER'
      })
    })

    it('omits empty string values', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: '',
        ACCREDITATION_NUMBER: ''
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER'
      })
    })

    it('omits invalid processingType values', () => {
      const meta = {
        PROCESSING_TYPE: 'INVALID_TYPE',
        MATERIAL: 'Aluminium'
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        material: 'Aluminium'
      })
    })

    it('omits non-string material values', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: 12345
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER'
      })
    })

    it('omits non-string accreditationNumber values', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: 'Aluminium',
        ACCREDITATION_NUMBER: 12345678
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER',
        material: 'Aluminium'
      })
    })
  })

  describe('when meta has no valid fields', () => {
    it('returns null when all fields are invalid', () => {
      const meta = {
        PROCESSING_TYPE: 'INVALID',
        MATERIAL: null,
        ACCREDITATION_NUMBER: 12345
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toBeNull()
    })

    it('returns null for empty object', () => {
      const result = extractResponseMetaFields({})

      expect(result).toBeNull()
    })
  })

  describe('when meta has extra fields', () => {
    it('ignores fields not in the response schema', () => {
      const meta = {
        PROCESSING_TYPE: PROCESSING_TYPES.EXPORTER,
        MATERIAL: 'Aluminium',
        TEMPLATE_VERSION: 1,
        REGISTRATION_NUMBER: 'REG12345',
        SOME_FUTURE_FIELD: 'whatever'
      }

      const result = extractResponseMetaFields(meta)

      expect(result).toEqual({
        processingType: 'EXPORTER',
        material: 'Aluminium'
      })
      expect(result).not.toHaveProperty('templateVersion')
      expect(result).not.toHaveProperty('registrationNumber')
      expect(result).not.toHaveProperty('someFutureField')
    })
  })
})
