import { MongoClient } from 'mongodb'
import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import {
  FUTURE_ACCREDITATIONS_COLLECTION_NAME,
  createMongoFutureAccreditationsRepository
} from './mongodb.js'
import {
  REGISTRATION_NUMBER,
  buildFutureAccreditation
} from './contract/test-data.js'

/** @import { Db } from 'mongodb' */
/** @import { TestAPI } from 'vitest' */
/** @import { FutureAccreditationsRepository } from './port.js' */

/**
 * @typedef {{
 *   database: Db
 *   futureAccreditationsRepository: FutureAccreditationsRepository
 *   held: () => Promise<object[]>
 *   mongoClient: MongoClient
 * }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

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
        .collection(FUTURE_ACCREDITATIONS_COLLECTION_NAME)
        .deleteMany({})
      await use(database)
    },

    futureAccreditationsRepository: async (
      /** @type {{ database: Db }} */ { database },
      use
    ) => {
      const factory = await createMongoFutureAccreditationsRepository(database)
      await use(factory())
    },

    held: async (/** @type {{ database: Db }} */ { database }, use) => {
      await use(() =>
        database
          .collection(FUTURE_ACCREDITATIONS_COLLECTION_NAME)
          .find({}, { projection: { _id: 0 } })
          .sort({ registrationNumber: 1, year: 1 })
          .toArray()
      )
    }
  })
)

describe('mongodb future accreditations repository', () => {
  describe('upsert', () => {
    it('should return the stored accreditation', async ({
      futureAccreditationsRepository
    }) => {
      const accreditation = buildFutureAccreditation()

      const stored = await futureAccreditationsRepository.upsert(accreditation)

      expect(stored).toStrictEqual(accreditation)
    })

    it('should replace the accreditation held for the same registration and year', async ({
      futureAccreditationsRepository,
      held
    }) => {
      await futureAccreditationsRepository.upsert(buildFutureAccreditation())
      const replacement = buildFutureAccreditation({
        accreditationNumber: toAccreditationNumber('A27ER5000560000XX')
      })

      await futureAccreditationsRepository.upsert(replacement)

      expect(await held()).toStrictEqual([replacement])
    })

    it('should keep the accreditations held for other years', async ({
      futureAccreditationsRepository,
      held
    }) => {
      const in2027 = buildFutureAccreditation()
      const in2028 = buildFutureAccreditation({ year: toYear(2028) })

      await futureAccreditationsRepository.upsert(in2027)
      await futureAccreditationsRepository.upsert(in2028)

      expect(await held()).toStrictEqual([in2027, in2028])
    })

    it('should hold the registration number trimmed and upper-cased, as organisations hold it', async ({
      futureAccreditationsRepository,
      held
    }) => {
      await futureAccreditationsRepository.upsert(
        buildFutureAccreditation({
          registrationNumber: toRegistrationNumber(
            ` ${REGISTRATION_NUMBER.toLowerCase()} `
          )
        })
      )

      expect(await held()).toStrictEqual([buildFutureAccreditation()])
    })
  })

  describe('remove', () => {
    it('should return the removed accreditation', async ({
      futureAccreditationsRepository
    }) => {
      const accreditation = buildFutureAccreditation()
      await futureAccreditationsRepository.upsert(accreditation)

      const removed = await futureAccreditationsRepository.remove(
        REGISTRATION_NUMBER,
        toYear(2027)
      )

      expect(removed).toStrictEqual(accreditation)
    })

    it('should leave the accreditations held for other years', async ({
      futureAccreditationsRepository,
      held
    }) => {
      const in2028 = buildFutureAccreditation({ year: toYear(2028) })
      await futureAccreditationsRepository.upsert(buildFutureAccreditation())
      await futureAccreditationsRepository.upsert(in2028)

      await futureAccreditationsRepository.remove(
        REGISTRATION_NUMBER,
        toYear(2027)
      )

      expect(await held()).toStrictEqual([in2028])
    })

    it('should return null when no accreditation is held for the year', async ({
      futureAccreditationsRepository
    }) => {
      expect(
        await futureAccreditationsRepository.remove(
          REGISTRATION_NUMBER,
          toYear(2027)
        )
      ).toBeNull()
    })
  })

  describe('validation', () => {
    it.for([
      {
        description: 'a year the REEX database holds accreditations for',
        accreditation: buildFutureAccreditation({ year: toYear(2026) })
      },
      {
        description: 'no accreditation number',
        accreditation: buildFutureAccreditation({
          accreditationNumber: toAccreditationNumber('')
        })
      },
      {
        description: 'an unknown status',
        accreditation: buildFutureAccreditation({
          status: {
            current: /** @type {any} */ ('pending'),
            timeline: []
          }
        })
      },
      {
        description: 'an unknown tonnage band',
        accreditation: buildFutureAccreditation({
          prnIssuance: { tonnageBand: 'lots' }
        })
      }
    ])(
      'should refuse to store an accreditation with $description',
      async ({ accreditation }, { futureAccreditationsRepository, held }) => {
        await expect(
          futureAccreditationsRepository.upsert(accreditation)
        ).rejects.toHaveProperty('output.statusCode', 422)

        expect(await held()).toStrictEqual([])
      }
    )
  })

  it('should hold one accreditation per registration and year', async ({
    database
  }) => {
    await createMongoFutureAccreditationsRepository(database)

    const indexes = await database
      .collection(FUTURE_ACCREDITATIONS_COLLECTION_NAME)
      .indexes()

    expect(indexes).toContainEqual(
      expect.objectContaining({
        key: { registrationNumber: 1, year: 1 },
        unique: true
      })
    )
  })
})
