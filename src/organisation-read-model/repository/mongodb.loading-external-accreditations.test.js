import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { config } from '#root/config.js'
import { createOverseasSitesRepository } from '#overseas-sites/repository/mongodb.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { it } from '#vite/fixtures/organisation-read-mongo.js'
import { setupMsw } from '#vite/setup-msw.js'
import { buildExternalAccreditationFor } from './contract/test-data.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  exporter,
  findOrganisation,
  overseasSites,
  reprocessor
} from './contract/organisation-read-test-helpers.js'
import { createOrganisationReadRepository } from './mongodb.js'

/** @import { MongoClient } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationReadRepositoryOptions } from './mongodb.js' */

const { buildOrganisation } = createOrganisationBuilders()

const regAccredApi = {
  baseUrl: 'https://reg-accred.test',
  clientId: 'epr-ReEx-Client',
  sharedSecret: 'secret'
}

const STORED_ACCREDITATION_NUMBER = 'A27ER5000560000AL'
const REG_ACCRED_ACCREDITATION_NUMBER = 'A27ER5000560001AL'

/** The query of the first page of a search for 2027 accreditations. */
const firstPage = { year: '2027', pageNumber: '1', limit: '100' }

const mswServer = setupMsw()

/**
 * Serves `GET /v1/accreditations` with one approved 2027 accreditation for
 * the reprocessor registration, or the given registration, of whichever
 * organisation is asked for, or of `organisationNumber` when none is.
 *
 * A search of every organisation's accreditations names no organisation, so
 * a test that makes one gives `organisationNumber`.
 *
 * @param {{
 *   registrationNumber?: string
 *   wasteProcessingType?: 'reprocessor' | 'exporter'
 *   organisationNumber?: string
 * }} [registration]
 * @returns {URL[]} the URLs requested
 */
const serveRegAccred = ({
  registrationNumber = REPROCESSOR_NUMBER,
  wasteProcessingType = 'reprocessor',
  organisationNumber
} = {}) => {
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
              url.searchParams.get('organisationNumber') ?? organisationNumber
            ),
            registrationNumber,
            accreditationNumber: REG_ACCRED_ACCREDITATION_NUMBER,
            accreditationYear: 2027,
            material: 'Paper',
            wasteProcessingType,
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
 * @param {OrganisationReadRepositoryOptions} [options]
 * @param {Pick<TypedLogger, 'warn'>} [logger]
 */
const repositoryWith = async (
  mongoClient,
  options,
  logger = { warn: () => {} }
) => {
  const database = mongoClient.db('epr-backend')
  return createOrganisationReadRepository(
    database,
    options
  )({
    overseasSitesRepository: (await createOverseasSitesRepository(database))(),
    logger
  })
}

/**
 * Stores a reprocessor and a 2027 external accreditation for its
 * registration in the database.
 *
 * @param {import('#vite/fixtures/organisation-read-mongo.js').OrganisationReadRepositoryWith} organisationReadRepositoryWith
 */
const storeReprocessorWithExternalAccreditation = async (
  organisationReadRepositoryWith
) => {
  const stored = buildOrganisation({ registrations: [reprocessor()] })
  await organisationReadRepositoryWith({
    organisations: [stored],
    externalAccreditations: [
      buildExternalAccreditationFor(stored, {
        registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER)
      })
    ]
  })
  return stored
}

/**
 * @param {import('#organisation-read-model/domain/model.js').Organisation} organisation
 */
const accreditationNumber2027 = (organisation) =>
  organisation.registrations[REPROCESSOR_NUMBER].accreditations['2027']
    ?.accreditationNumber

describe('loading external accreditations', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-10') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('without the Reg Accred API config', () => {
    it.for(
      /** @type {[string, OrganisationReadRepositoryOptions | undefined][]} */ ([
        ['no options', undefined],
        ['no regAccredApi', {}]
      ])
    )(
      'serves the external accreditation held in the database with %s',
      async ([, options], { organisationReadRepositoryWith, mongoClient }) => {
        const stored = await storeReprocessorWithExternalAccreditation(
          organisationReadRepositoryWith
        )
        const repository = await repositoryWith(mongoClient, options)

        const organisation = await findOrganisation(
          repository,
          stored.organisationNumber
        )

        expect(accreditationNumber2027(organisation)).toBe(
          STORED_ACCREDITATION_NUMBER
        )
      }
    )
  })

  describe('with the Reg Accred API config', () => {
    const options = { regAccredApi }

    it.for(
      /** @type {[string, Year | undefined][]} */ ([
        ['no year', undefined],
        ['2027', /** @type {Year} */ (2027)]
      ])
    )(
      "serves the organisation's 2027 accreditation from Reg Accred, not the database, with %s",
      async ([, year], { organisationReadRepositoryWith, mongoClient }) => {
        const requested = serveRegAccred()
        const stored = await storeReprocessorWithExternalAccreditation(
          organisationReadRepositoryWith
        )
        const repository = await repositoryWith(mongoClient, options)

        const organisation = await findOrganisation(
          repository,
          stored.organisationNumber,
          { year }
        )

        expect(accreditationNumber2027(organisation)).toBe(
          REG_ACCRED_ACCREDITATION_NUMBER
        )
        expect(
          requested.map(({ searchParams }) => Object.fromEntries(searchParams))
        ).toStrictEqual([
          { ...firstPage, organisationNumber: stored.organisationNumber }
        ])
      }
    )

    it("lists no overseas sites on an exporter's accreditation from Reg Accred, rather than the registration's", async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      serveRegAccred({
        registrationNumber: EXPORTER_NUMBER,
        wasteProcessingType: 'exporter'
      })
      const stored = buildOrganisation({ registrations: [exporter()] })
      await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites
      })
      const repository = await repositoryWith(mongoClient, options)

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations['2027']
      ).toHaveProperty('overseasSites', {})
    })

    it('leaves out and logs an accreditation from Reg Accred with a status the read model does not know', async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      mswServer.use(
        http.get(`${regAccredApi.baseUrl}/v1/accreditations`, () =>
          HttpResponse.json({
            pageNumber: 1,
            limit: 100,
            totalItems: 1,
            items: [
              {
                organisationNumber: 500056,
                registrationNumber: REPROCESSOR_NUMBER,
                accreditationNumber: REG_ACCRED_ACCREDITATION_NUMBER,
                accreditationYear: 2027,
                wasteProcessingType: 'reprocessor',
                status: 'withdrawn',
                tonnageBand: 'up_to_500'
              }
            ]
          })
        )
      )
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      await organisationReadRepositoryWith({ organisations: [stored] })
      const warn = vi.fn()
      const repository = await repositoryWith(mongoClient, options, { warn })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations
      ).not.toHaveProperty('2027')
      expect(warn).toHaveBeenCalledWith({
        message: expect.stringContaining(
          `Reg Accred accreditation ${REG_ACCRED_ACCREDITATION_NUMBER} is invalid`
        )
      })
    })

    it('makes no request to Reg Accred for a year other than 2027', async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      const requested = serveRegAccred()
      const stored = await storeReprocessorWithExternalAccreditation(
        organisationReadRepositoryWith
      )
      const repository = await repositoryWith(mongoClient, options)

      await repository.findByOrganisationNumber(stored.organisationNumber, {
        year: /** @type {Year} */ (2026)
      })

      expect(requested).toStrictEqual([])
    })

    it("requests every organisation's accreditations from Reg Accred at once in findAll", async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      const stored = await storeReprocessorWithExternalAccreditation(
        organisationReadRepositoryWith
      )
      const requested = serveRegAccred({
        organisationNumber: stored.organisationNumber
      })
      const repository = await repositoryWith(mongoClient, options)

      const [organisation] = await repository.findAll()

      expect(accreditationNumber2027(organisation)).toBe(
        REG_ACCRED_ACCREDITATION_NUMBER
      )
      expect(
        requested.map(({ searchParams }) => Object.fromEntries(searchParams))
      ).toStrictEqual([firstPage])
    })
  })

  describe('before 2027 is open', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-11-10'))
    })

    afterEach(() => {
      config.reset('openNextYear')
    })

    it('asks Reg Accred nothing for findByOrganisationNumber', async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      const requested = serveRegAccred()
      const stored = await storeReprocessorWithExternalAccreditation(
        organisationReadRepositoryWith
      )
      const repository = await repositoryWith(mongoClient, { regAccredApi })

      await repository.findByOrganisationNumber(stored.organisationNumber)

      expect(requested).toStrictEqual([])
    })

    it('asks Reg Accred nothing for findAll', async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      const stored = await storeReprocessorWithExternalAccreditation(
        organisationReadRepositoryWith
      )
      const requested = serveRegAccred({
        organisationNumber: stored.organisationNumber
      })
      const repository = await repositoryWith(mongoClient, { regAccredApi })

      await repository.findAll()

      expect(requested).toStrictEqual([])
    })

    it('asks Reg Accred where next year is opened early', async ({
      organisationReadRepositoryWith,
      mongoClient
    }) => {
      config.set('openNextYear', true) // opens 2027
      const stored = await storeReprocessorWithExternalAccreditation(
        organisationReadRepositoryWith
      )
      const requested = serveRegAccred({
        organisationNumber: stored.organisationNumber
      })
      const repository = await repositoryWith(mongoClient, { regAccredApi })

      const [organisation] = await repository.findAll()

      expect(requested).toHaveLength(1)
      expect(accreditationNumber2027(organisation)).toBe(
        REG_ACCRED_ACCREDITATION_NUMBER
      )
    })

    it.for(
      /** @type {[string, boolean, string[]][]} */ ([
        ['leaves out', false, []],
        ['serves, where next year is opened early,', true, ['2027']]
      ])
    )(
      '%s an accreditation held in the database',
      async (
        [, openNextYear, years],
        { organisationReadRepositoryWith, mongoClient }
      ) => {
        config.set('openNextYear', openNextYear)
        const stored = buildOrganisation({ registrations: [reprocessor()] })
        await organisationReadRepositoryWith({
          organisations: [stored],
          externalAccreditations: [
            buildExternalAccreditationFor(stored, {
              registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
              year: toYear(2027),
              accreditationNumber: toAccreditationNumber(
                STORED_ACCREDITATION_NUMBER
              )
            })
          ]
        })
        const repository = await repositoryWith(mongoClient)

        const organisation = await findOrganisation(
          repository,
          stored.organisationNumber
        )

        expect(
          Object.keys(
            organisation.registrations[REPROCESSOR_NUMBER].accreditations
          )
        ).toStrictEqual(years)
      }
    )
  })
})
