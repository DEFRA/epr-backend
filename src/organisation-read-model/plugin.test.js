import Hapi from '@hapi/hapi'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it } from '#vite/fixtures/organisation-read-mongo.js'
import { setupMsw } from '#vite/setup-msw.js'
import { organisationReadRepositoryPlugin } from './plugin.js'
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
 * @param {MongoClient} mongoClient
 * @param {boolean} regAccredExternalAccreditations
 * @returns {Promise<OrganisationReadRepository>}
 */
const registeredRepository = async (
  mongoClient,
  regAccredExternalAccreditations
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
  const server = Object.assign(Hapi.server(), { db: database })
  server.decorate('server', 'logger', logger)
  const app = /** @type {ServerApp} */ (server.app)
  app.overseasSitesRepository = (
    await createOverseasSitesRepository(database)
  )()
  organisationReadRepositoryPlugin.register(server, {
    config: { get: (key) => settings[key] }
  })
  return app.organisationReadRepository
}

describe('organisationReadRepositoryPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-10') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.for(
    /** @type {[string, boolean, string, number][]} */ ([
      ['off', false, 'A27ER5000560000AL', 0],
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
            registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER)
          })
        ]
      })

      const organisation = await findOrganisation(
        await registeredRepository(mongoClient, flag),
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
})
