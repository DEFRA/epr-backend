import { describe, expect, it } from 'vitest'

import { signedHeaders } from './reg-accred-api.js'

const config = { clientId: 'epr-ReEx-Client', sharedSecret: 'secret' }

describe('signedHeaders', () => {
  it("matches the worked example in Reg Accred's onboarding guide", () => {
    // From "Worked example (not a real credential)" in
    // DEFRA/epr-register-enrol-backend docs/reex-api-onboarding.md
    const headers = signedHeaders(
      { clientId: 'example-client', sharedSecret: 'example-secret-do-not-use' },
      {
        now: () => new Date('2027-01-15T10:30:00Z'),
        newNonce: () => 'bm9uY2UtZXhhbXBsZS0wMDAx'
      }
    )

    expect(headers).toStrictEqual({
      'x-cdp-client-id': 'example-client',
      'x-cdp-auth-timestamp': '2027-01-15T10:30:00Z',
      'x-cdp-auth-nonce': 'bm9uY2UtZXhhbXBsZS0wMDAx', // gitleaks:allow
      'x-cdp-auth-signature': 'mJPc+QOEbTNBzB60Pj2NjSOy8bOYmvoCjCwPQS2CSTk=' // gitleaks:allow
    })
  })

  it('leaves the milliseconds out of the timestamp', () => {
    const headers = signedHeaders(config, {
      now: () => new Date('2027-01-02T03:04:05.678Z')
    })

    expect(headers['x-cdp-auth-timestamp']).toBe('2027-01-02T03:04:05Z')
  })

  it('signs each request with a new nonce', () => {
    const first = signedHeaders(config)
    const second = signedHeaders(config)

    expect(first['x-cdp-auth-nonce']).not.toBe(second['x-cdp-auth-nonce'])
  })
})
