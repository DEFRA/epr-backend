import { afterAll, describe, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createAuditEventsRepository } from './mongodb-and-cdp-auditing.js'
import { testAuditEventsRepositoryContract } from './port.contract.js'
import { MongoClient, ObjectId } from 'mongodb'

/**
 * @import {AuditEventsRepository} from '#repositories/audit-events/port.js'
 */

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  auditEventsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db('epr-backend')
    const factory = createAuditEventsRepository(database)
    await use(factory)
  }
})

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

describe('Mongo DB and CDP auditing audit events repository', () => {
  afterAll(async () => {
    vi.resetAllMocks()
  })

  describe('audit events repository contract', () => {
    testAuditEventsRepositoryContract(it)
  })

  it('captures a CDP audit on insert', async ({ auditEventsRepository }) => {
    /** @type {AuditEventsRepository} */
    const repository = auditEventsRepository()

    const payload = {
      event: { category: 'c', action: 'a' },
      context: { organisationId: new ObjectId() }
    }

    await repository.insert(payload)

    expect(mockCdpAuditing).toHaveBeenCalledWith(payload)
  })

  it('captures a CDP audit on insert even if DB write fails', async () => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn()
    }

    const mockDb = {
      collection: () => {
        throw new Error('error accessing db')
      }
    }
    const collectionSpy = vi.spyOn(mockDb, 'collection')

    const repository = createAuditEventsRepository(mockDb)(mockLogger)

    const payload = {
      event: { category: 'c', action: 'a' },
      context: { organisationId: new ObjectId() }
    }

    await repository.insert(payload)

    expect(collectionSpy).toHaveBeenCalled()
    expect(mockCdpAuditing).toHaveBeenCalledWith(payload)
  })
})
