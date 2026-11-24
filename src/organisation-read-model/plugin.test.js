import Hapi from '@hapi/hapi'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it } from '#vite/fixtures/organisation-read-mongo.js'
import { setupMsw } from '#vite/setup-msw.js'
import { organisationReadModel } from './plugin.js'
import {
  REPROCESSOR_NUMBER,
  findOrganisation,
  reprocessor
} from './repository/contract/organisation-read-test-helpers.js'
import { buildExternalAccreditationFor } from './repository/contract/test-data.js'

/** @import { MongoClient } from 'mongodb' */
/** @import { ServerApp, TypedLogger } from '#common/hapi-types.js' */
/** @import { RegAccredApiConfig } from './repository/reg-accred-accreditations.js' */
/** @import { OrganisationReadRepository } from './index.js' */

const { buildOrganisation } = createOrganisationBuilders()

/** @type {RegAccredApiConfig} */
const regAccredApi = {
  baseUrl: 'https://reg-accred.test',
  clientId: 'epr-ReEx-Client',
  sharedSecret: 'secret'
}
const STORED_ACCREDITATION_NUMBER = 'A27ER5000560000AL'
const REG_ACCRED_ACCREDITATION_NUMBER = 'A27ER5000560001AL'

const mswServer = setupMsw()

/**
 * Serves one approved 2027 accreditation from Reg Accred.
 *
 * @returns {URL[]} the URLs requested
 */
const serveRegAccredAccreditation = () => {
  /** @type {URL[]} */
  const requested = []
  mswServer.use(
    http.get(`${regAccredApi.baseUrl}/v1/accreditations`, ({ request }) => {
      const url = new URL(request.url)
      requested.push(url)
      return HttpResponse.json({
        pageNumber: 1,
        limit: 20,
        totalItems: 1,
        items: [
          {
            organisationNumber: Number(
              url.searchParams.get('organisationNumber')
            ),
            registrationNumber: REPROCESSOR_NUMBER,
            accreditationNumber: REG_ACCRED_ACCREDITATION_NUMBER,
            accreditationYear: 2027,
            material: 'Paper',
            wasteProcessingType: 'reprocessor',
            status: 'approved',
            tonnageBand: 'up_to_500'
          }
        ]
      })
    })
  )
  return requested
}

/**
 * A server with the read model registered over the test's database, as the
 * server setup registers it, and initialised.
 *
 * @param {MongoClient} mongoClient
 * @param {boolean} regAccredExternalAccreditations
 * @param {{ organisationReadRepository?: OrganisationReadRepository }} [adapters]
 */
const registeredServer = async (
  mongoClient,
  regAccredExternalAccreditations,
  adapters = {}
) => {
  /** @type {Record<string, unknown>} */
  const settings = {
    'featureFlags.regAccredExternalAccreditations':
      regAccredExternalAccreditations,
    regAccredApi
  }
  /** @type {Pick<TypedLogger, 'warn'>} */
  const logger = { warn: () => {} }
  const database = mongoClient.db('epr-backend')
  const overseasSitesRepository = (
    await createOverseasSitesRepository(database)
  )()
  const server = Hapi.server()
  server.decorate('server', 'logger', logger)
  await server.register([
    {
      name: 'mongodb',
      register: (registered) => {
        registered.decorate('server', 'db', database)
      }
    },
    {
      name: 'overseasSitesRepository',
      register: (registered) => {
        registerDependency(
          registered,
          'overseasSitesRepository',
          () => overseasSitesRepository
        )
      }
    }
  ])
  await server.register({
    plugin: organisationReadModel,
    options: { config: { get: (key) => settings[key] }, ...adapters }
  })
  await server.initialize()
  return server
}

/**
 * @param {import('@hapi/hapi').Server} server
 * @returns {OrganisationReadRepository}
 */
const readRepositoryOf = (server) =>
  /** @type {ServerApp} */ (server.app).organisationReadRepository

describe('organisationReadModel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-10') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.for(
    /** @type {[string, boolean, string, number][]} */ ([
      ['off', false, STORED_ACCREDITATION_NUMBER, 0],
      ['on', true, REG_ACCRED_ACCREDITATION_NUMBER, 1]
    ])
  )(
    'registers a repository that asks Reg Accred for the 2027 accreditation only with the flag %s',
    async (
      [, flag, expectedNumber, expectedRequests],
      { organisationReadRepositoryWith, mongoClient }
    ) => {
      const requested = serveRegAccredAccreditation()
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [
          buildExternalAccreditationFor(stored, {
            registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
            accreditationNumber: toAccreditationNumber(
              STORED_ACCREDITATION_NUMBER
            )
          })
        ]
      })

      const organisation = await findOrganisation(
        readRepositoryOf(await registeredServer(mongoClient, flag)),
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER]?.accreditations[
          toYear(2027)
        ]?.accreditationNumber
      ).toBe(expectedNumber)
      expect(requested).toHaveLength(expectedRequests)
    }
  )

  it('keeps the repository it provided when the server is initialised again', async ({
    mongoClient
  }) => {
    serveRegAccredAccreditation()
    const server = await registeredServer(mongoClient, false)
    const provided = readRepositoryOf(server)

    await server.stop()
    await server.initialize()

    expect(readRepositoryOf(server)).toBe(provided)
  })

  it('provides the repository it is given', async ({ mongoClient }) => {
    const given = /** @type {OrganisationReadRepository} */ ({})
    const server = await registeredServer(mongoClient, false, {
      organisationReadRepository: given
    })

    expect(readRepositoryOf(server)).toBe(given)
  })
})
