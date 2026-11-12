import { describe, expect, it } from 'vitest'

import { convictValidateHex256BitKey } from './validate-hex-256-bit-key.js'

describe('#convictValidateHex256BitKey', () => {
  it('should accept 64 lowercase hex characters', () => {
    expect(() =>
      convictValidateHex256BitKey.validate(
        '3f7a9c1e5b2d8f4a6c0e9b7d1f3a5c8e2b4d6f8a0c2e4b6d8f1a3c5e7b9d0f2a'
      )
    ).not.toThrow()
  })

  it.for([
    { description: 'missing', value: null },
    { description: 'empty', value: '' },
    { description: 'too short', value: 'ab'.repeat(31) },
    { description: 'too long', value: 'ab'.repeat(33) },
    { description: 'uppercase', value: 'AB'.repeat(32) },
    { description: 'not hex', value: 'zz'.repeat(32) },
    { description: 'a passphrase', value: 'correct horse battery staple' }
  ])('should reject a key that is $description', ({ value }) => {
    expect(() => convictValidateHex256BitKey.validate(value)).toThrow(
      'must be 64 lowercase hex characters (openssl rand -hex 32)'
    )
  })
})
