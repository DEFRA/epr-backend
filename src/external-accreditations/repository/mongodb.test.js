import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
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
  })

  describe('remove', () => {
    it('returns the removed accreditation', async ({
      externalAccreditationsRepository
    }) => {
      const accreditation = buildExternalAccreditation()
      await externalAccreditationsRepository.upsert(accreditation)

      const removed = await externalAccreditationsRepository.remove(
        registrationNumber,
        year
      )

      expect(removed).toStrictEqual(accreditation)
    })

    it('leaves the accreditations held for other years', async ({
      externalAccreditationsRepository,
      held
    }) => {
      const followingYear = buildExternalAccreditation({ year: nextYear })
      await externalAccreditationsRepository.upsert(
        buildExternalAccreditation()
      )
      await externalAccreditationsRepository.upsert(followingYear)

      await externalAccreditationsRepository.remove(registrationNumber, year)

      expect(await held()).toStrictEqual([followingYear])
    })

    it('returns null when no accreditation is held for the year', async ({
      externalAccreditationsRepository
    }) => {
      expect(
        await externalAccreditationsRepository.remove(registrationNumber, year)
      ).toBeNull()
    })
  })

  describe('validation', () => {
    it.for([
      {
        description: 'a year the service holds no data for',
        accreditation: buildExternalAccreditation({ year: toYear(2023) })
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
            timeline: [{ status: 'banana', at: '2027-01-01T00:00:00.000Z' }]
          }
        })
      },
      {
        description: 'a status in its timeline the read model does not show',
        accreditation: buildExternalAccreditation({
          status: {
            current: 'approved',
            timeline: [{ status: 'created', at: '2027-01-01T00:00:00.000Z' }]
          }
        })
      },
      {
        description: 'an unknown status',
        accreditation: buildExternalAccreditation({
          status: {
            current: /** @type {any} */ ('pending'),
            timeline: []
          }
        })
      },
      {
        description: 'an unknown tonnage band',
        accreditation: buildExternalAccreditation({
          prnIssuance: { tonnageBand: 'lots' }
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

  it('holds one accreditation per registration and year', async ({
    database
  }) => {
    await createMongoExternalAccreditationsRepository(database)

    const indexes = await database
      .collection(EXTERNAL_ACCREDITATIONS_COLLECTION_NAME)
      .indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { registrationNumber: 1, year: 1 },
        unique: true
      })
    )
  })
})
