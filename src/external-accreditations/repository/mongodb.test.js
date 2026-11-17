import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#organisations/index.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { EXTERNAL_ACCREDITATIONS_COLLECTION_NAME } from '#organisation-read-model/repository/mongodb.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createMongoExternalAccreditationsRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { TestAPI } from 'vitest' */
/** @import { ExternalAccreditationsRepository } from './port.js' */

/**
 * @typedef {{
 *   database: Db
 *   externalAccreditationsRepository: ExternalAccreditationsRepository
 *   held: () => Promise<object[]>
 *   mongoClient: MongoClient
 * }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

const { registrationNumber, year, accreditationNumber } =
  buildExternalAccreditation()
const nextYear = toYear(year + 1)

const it = /** @type {TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    database: async (
      /** @type {{ mongoClient: MongoClient }} */ { mongoClient },
      use
    ) => {
      const database = mongoClient.db(DATABASE_NAME)
      await database
        .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})
      await use(database)
    },

    externalAccreditationsRepository: async (
      /** @type {{ database: Db }} */ { database },
      use
    ) => {
      const factory =
        await createMongoExternalAccreditationsRepository(database)
      await use(factory())
    },

    held: async (/** @type {{ database: Db }} */ { database }, use) => {
      await use(() =>
        database
          .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
          .find({}, { projection: { _id: 0 } })
          .sort({ registrationNumber: 1, year: 1 })
          .toArray()
      )
    }
  })
)

describe('mongodb external accreditations repository', () => {
  describe('upsert', () => {
    it('returns the stored accreditation', async ({
      externalAccreditationsRepository
    }) => {
      const accreditation = buildExternalAccreditation()

      const stored =
        await externalAccreditationsRepository.upsert(accreditation)

      expect(stored).toStrictEqual(accreditation)
    })

    it('replaces the accreditation held for the same registration and year', async ({
      externalAccreditationsRepository,
      held
    }) => {
      await externalAccreditationsRepository.upsert(
        buildExternalAccreditation()
      )
      const replacement = buildExternalAccreditation({
        accreditationNumber: toAccreditationNumber('A27ER5000560000XX')
      })

      await externalAccreditationsRepository.upsert(replacement)

      expect(await held()).toStrictEqual([replacement])
    })

    it('keeps the accreditations held for other years', async ({
      externalAccreditationsRepository,
      held
    }) => {
      const thisYear = buildExternalAccreditation()
      const followingYear = buildExternalAccreditation({ year: nextYear })

      await externalAccreditationsRepository.upsert(thisYear)
      await externalAccreditationsRepository.upsert(followingYear)

      expect(await held()).toStrictEqual([thisYear, followingYear])
    })

    it('holds the registration number trimmed and upper-cased, as organisations hold it', async ({
      externalAccreditationsRepository,
      held
    }) => {
      await externalAccreditationsRepository.upsert(
        buildExternalAccreditation({
          registrationNumber: toRegistrationNumber(
            ` ${registrationNumber.toLowerCase()} `
          )
        })
      )

      expect(await held()).toStrictEqual([buildExternalAccreditation()])
    })

    it('holds the accreditation number trimmed and upper-cased, as organisations hold it', async ({
      externalAccreditationsRepository,
      held
    }) => {
      await externalAccreditationsRepository.upsert(
        buildExternalAccreditation({
          accreditationNumber: toAccreditationNumber(
            ` ${accreditationNumber.toLowerCase()} `
          )
        })
      )

      expect(await held()).toStrictEqual([buildExternalAccreditation()])
    })

    it("holds an exporter accreditation's overseas sites", async ({
      externalAccreditationsRepository,
      held
    }) => {
      const exporterAccreditation = buildExternalAccreditation({
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2027-01-01' },
          '002': { status: 'pending' }
        }
      })

      await externalAccreditationsRepository.upsert(exporterAccreditation)

      expect(await held()).toStrictEqual([exporterAccreditation])
    })
  })

  describe('validation', () => {
    it.for([
      {
        description: 'a year the service holds no data for',
        accreditation: buildExternalAccreditation({ year: toYear(2023) })
      },
      {
        description: 'no organisation number',
        accreditation: buildExternalAccreditation({
          organisationNumber: /** @type {any} */ (undefined)
        })
      },
      {
        description: 'no accreditation number',
        accreditation: buildExternalAccreditation({
          accreditationNumber: toAccreditationNumber('')
        })
      },
      {
        description: 'an unknown status in its timeline',
        accreditation: buildExternalAccreditation({
          status: {
            current: 'approved',
            lastUpdatedAt: '2026-12-14T10:31:00.000Z',
            timeline: [
              {
                status: /** @type {any} */ ('banana'),
                at: '2027-01-01T00:00:00.000Z'
              }
            ]
          }
        })
      },
      {
        description: 'a status in its timeline the read model does not show',
        accreditation: buildExternalAccreditation({
          status: {
            current: 'approved',
            lastUpdatedAt: '2026-12-14T10:31:00.000Z',
            timeline: [
              {
                status: /** @type {any} */ ('created'),
                at: '2027-01-01T00:00:00.000Z'
              }
            ]
          }
        })
      },
      {
        description: 'no date its last change was recorded',
        accreditation: buildExternalAccreditation({
          status: /** @type {any} */ ({
            current: 'approved',
            timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
          })
        })
      },
      {
        description:
          'a change in its timeline that carries when it was recorded',
        accreditation: buildExternalAccreditation({
          status: {
            current: 'approved',
            lastUpdatedAt: '2026-12-14T10:31:00.000Z',
            timeline: [
              /** @type {any} */ ({
                status: 'approved',
                at: '2027-01-01T00:00:00.000Z',
                updatedAt: '2026-12-14T10:31:00.000Z'
              })
            ]
          }
        })
      },
      {
        description: 'an unknown status',
        accreditation: buildExternalAccreditation({
          status: {
            current: /** @type {any} */ ('pending'),
            lastUpdatedAt: '2026-12-14T10:31:00.000Z',
            timeline: []
          }
        })
      },
      {
        description: 'an unknown tonnage band',
        accreditation: buildExternalAccreditation({
          prnIssuance: { tonnageBand: /** @type {any} */ ('lots') }
        })
      },
      {
        description: 'an approved overseas site without its approval date',
        accreditation: buildExternalAccreditation({
          overseasSites: {
            '001': /** @type {any} */ ({ status: 'approved' })
          }
        })
      },
      {
        description: 'an overseas site keyed by something other than an ORS id',
        accreditation: buildExternalAccreditation({
          overseasSites: { abc: { status: 'pending' } }
        })
      }
    ])(
      'refuses to store an accreditation with $description',
      async ({ accreditation }, { externalAccreditationsRepository, held }) => {
        await expect(
          externalAccreditationsRepository.upsert(accreditation)
        ).rejects.toHaveProperty('output.statusCode', 422)

        expect(await held()).toStrictEqual([])
      }
    )
  })

  it('holds one accreditation per organisation, registration and year', async ({
    database
  }) => {
    await createMongoExternalAccreditationsRepository(database)

    const indexes = await database
      .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
      .indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { organisationNumber: 1, registrationNumber: 1, year: 1 },
        unique: true
      })
    )
  })

  it('drops the registration and year index it replaces', async ({
    database
  }) => {
    const collection = database.collection(
      EXTERNAL_ACCREDITATIONS_COLLECTION_NAME
    )
    await collection.createIndex(
      { registrationNumber: 1, year: 1 },
      { name: 'registration_year', unique: true }
    )

    await createMongoExternalAccreditationsRepository(database)

    const names = (await collection.indexes()).map(({ name }) => name)
    expect(names).not.toContain('registration_year')
  })
})
