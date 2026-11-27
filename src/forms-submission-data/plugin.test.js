import Hapi from '@hapi/hapi'
import { describe, expect, it } from 'vitest'

import { formsSubmissionDataRoutesPlugin } from './plugin.js'

const routesPlugin =
  /** @type {import('@hapi/hapi').Plugin<{ devEndpoints: boolean }>} */ (
    /** @type {unknown} */ (formsSubmissionDataRoutesPlugin)
  )

const serverWithDefaultAuth = () => {
  const server = Hapi.server()
  server.auth.scheme('anyone', () => ({
    authenticate: (_request, h) => h.authenticated({ credentials: {} })
  }))
  server.auth.strategy('anyone', 'anyone')
  server.auth.default('anyone')
  return server
}

/**
 * @param {string[]} providers
 * @param {boolean} devEndpoints
 */
const initialiseWith = async (providers, devEndpoints) => {
  const server = serverWithDefaultAuth()
  for (const name of providers) {
    await server.register({ name, register: () => {} })
  }
  await server.register({
    plugin: routesPlugin,
    options: { devEndpoints }
  })
  return server.initialize()
}

const PROVIDERS = ['formSubmissionsRepository']

const DEV_PROVIDERS = [
  ...PROVIDERS,
  'formsFileUploadsRepository',
  'organisationsRepository',
  'systemLogsRepository'
]

describe('the forms submission data routes plugin', () => {
  it('starts with only the form submissions repository when dev endpoints are off', async () => {
    await expect(initialiseWith(PROVIDERS, false)).resolves.toBeUndefined()
  })

  it('refuses to start without formSubmissionsRepository', async () => {
    await expect(initialiseWith([], false)).rejects.toThrow(
      'formSubmissionsRepository'
    )
  })

  it.for(DEV_PROVIDERS)(
    'refuses to start with dev endpoints on and without %s',
    async (missing) => {
      const others = DEV_PROVIDERS.filter((provider) => provider !== missing)

      await expect(initialiseWith(others, true)).rejects.toThrow(missing)
    }
  )
})
