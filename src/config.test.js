import { describe, test, expect } from 'vitest'

import { config } from './config.js'

describe('#config', () => {
  describe('cdpUploader', () => {
    test('has url property with default value', () => {
      const url = config.get('cdpUploader.url')

      expect(url).toBeDefined()
      expect(typeof url).toBe('string')
      expect(url).toContain('cdp-uploader')
    })
  })
})
