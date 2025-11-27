import { describe, test, expect } from 'vitest'

import { config } from './config.js'

describe('#config', () => {
  describe('cdpUploader', () => {
    test('has url property with default value', () => {
      const url = config.get('cdpUploader.url')

      expect(url).toBeDefined()
      expect(typeof url).toBe('string')
      expect(url).toBe('http://localhost:7337')
    })

    test('has s3Bucket property with default value', () => {
      const bucket = config.get('cdpUploader.s3Bucket')

      expect(bucket).toBe('re-ex-summary-logs')
    })

    test('has maxFileSize property with default value', () => {
      const maxFileSize = config.get('cdpUploader.maxFileSize')

      expect(maxFileSize).toBe(10485760)
    })
  })

  describe('appBaseUrl', () => {
    test('has default value', () => {
      const url = config.get('appBaseUrl')

      expect(url).toBe('http://localhost:3000')
    })
  })

  describe('eprBackendUrl', () => {
    test('has default value', () => {
      const url = config.get('eprBackendUrl')

      expect(url).toBe('http://localhost:3001')
    })
  })
})
