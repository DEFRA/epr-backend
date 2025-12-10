import { afterAll, describe, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createAuditEventsRepository } from './mongodb-and-cdp-auditing.js'
import { testAuditEventsRepositoryContract } from './port.contract.js'
import { MongoClient, ObjectId } from 'mongodb'

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
    const repository = auditEventsRepository()

    const organisationId = new ObjectId()

    const payload = { event: {}, context: { organisationId: organisationId } }

    await repository.insert(payload)

    expect(mockCdpAuditing).toHaveBeenCalledWith(payload)
  })
})
