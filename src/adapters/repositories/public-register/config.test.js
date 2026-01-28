import { describe, it, expect } from 'vitest'
import { publicRegisterConfig } from './config.js'

describe('publicRegisterConfig', () => {
  it('has valid configuration with correct types and values', () => {
    expect(typeof publicRegisterConfig).toBe('object')
    expect(publicRegisterConfig.s3Bucket).toBe('re-ex-public-register')
    expect(publicRegisterConfig.preSignedUrlExpiry).toBe(3600)
  })
})
