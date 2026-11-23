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
/** @import { ServerApp } from '#common/hapi-types.js' */
/** @import { OrganisationReadRepository } from './index.js' */

const { buildOrganisation } = createOrganisationBuilders()

const REG_ACCRED_BASE_URL = 'https://reg-accred.test'
const REG_ACCRED_ACCREDITATION_NUMBER = 'A27ER5000560001AL'

const mswServer = setupMsw()

const serveRegAccredAccreditation = () =>
  mswServer.use(
    http.get(`${REG_ACCRED_BASE_URL}/v1/accreditations`, ({ request }) =>
      HttpResponse.json({
        pageNumber: 1,
        limit: 20,
        totalItems: 1,
        items: [
          {
            organisationNumber: Number(
              new URL(request.url).searchParams.get('organisationNumber')
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
    )
  )

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
    regAccredApi: {
      baseUrl: REG_ACCRED_BASE_URL,
      clientId: 'epr-ReEx-Client',
      sharedSecret: 'secret'
    }
  }
  const database = mongoClient.db('epr-backend')
  const server = Object.assign(Hapi.server(), { db: database })
  server.decorate('server', 'logger', { warn: () => {} })
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
    /** @type {[string, boolean, string][]} */ ([
      ['off', false, 'A27ER5000560000AL'],
      ['on', true, REG_ACCRED_ACCREDITATION_NUMBER]
    ])
  )(
    'registers a repository that serves the 2027 accreditation by the Reg Accred flag, with it %s',
    async (
      [, flag, expectedNumber],
      { organisationReadRepositoryWith, mongoClient }
    ) => {
      serveRegAccredAccreditation()
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
    }
  )
})
