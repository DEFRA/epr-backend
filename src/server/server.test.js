import { describe, expect, it } from 'vitest'

import { regAccredApiOf } from './server.js'

const regAccredApi = {
  baseUrl: 'https://reg-accred.test',
  clientId: 'epr-ReEx-Client',
  sharedSecret: 'secret'
}

/** @param {boolean} flag */
const configWith = (flag) => {
  /** @type {Record<string, unknown>} */
  const settings = {
    'featureFlags.regAccredExternalAccreditations': flag,
    regAccredApi
  }
  return { get: (/** @type {string} */ key) => settings[key] }
}

describe('regAccredApiOf', () => {
  it('gives the Reg Accred settings with the flag on', () => {
    expect(regAccredApiOf(configWith(true))).toBe(regAccredApi)
  })

  it('gives nothing with the flag off', () => {
    expect(regAccredApiOf(configWith(false))).toBeUndefined()
  })
})
