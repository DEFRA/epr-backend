import Hapi from '@hapi/hapi'
import { afterEach, describe, expect, it } from 'vitest'

import { reconcileStalePrnProjectionsPlugin } from './reconcile-stale-prn-projections.plugin.js'

/** @param {string} name */
const providing = (name) => ({ name, register: () => {} })

const ALL_PROVIDERS = [
  'mongodb',
  'packagingRecyclingNotesRepository',
  'wasteBalanceService'
]

describe('reconcileStalePrnProjectionsPlugin', () => {
  /** @type {*} */
  let server

  afterEach(async () => {
    await server?.stop()
  })

  /** @param {string[]} providers */
  const serverWith = async (providers) => {
    server = Hapi.server()
    await server.register(providers.map(providing))
    await server.register(reconcileStalePrnProjectionsPlugin)
    return server
  }

  it.each(ALL_PROVIDERS)(
    'refuses to start a server without %s',
    async (missing) => {
      const incomplete = await serverWith(
        ALL_PROVIDERS.filter((name) => name !== missing)
      )

      await expect(incomplete.initialize()).rejects.toThrow(missing)
    }
  )
})
