import { randomUUID } from 'node:crypto'
import { SCHEMA_VERSION, ORG_ID_START_NUMBER } from '#common/enums/index.js'

export const testInsertOrganisationBehaviour = (repositoryFactory) => {
  describe('insertOrganisation', () => {
    let repository
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }

    beforeEach(async () => {
      repository = await repositoryFactory(logger)
    })

    describe('basic behaviour', () => {
      it('inserts organisation and returns orgId and referenceNumber', async () => {
        const organisation = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 1,
          orgName: `Test Org ${randomUUID()}`,
          email: `test-${randomUUID()}@example.com`,
          nations: null,
          answers: [
            {
              shortDescription: 'Question 1',
              title: 'What is your answer?',
              type: 'TextField',
              value: 'answer1'
            }
          ],
          rawSubmissionData: { raw: 'data' }
        }

        const result = await repository.insertOrganisation(organisation)

        expect(result).toHaveProperty('orgId')
        expect(result).toHaveProperty('referenceNumber')
        expect(typeof result.orgId).toBe('number')
        expect(typeof result.referenceNumber).toBe('string')
      })

      it('accepts valid organisation data with null nations', async () => {
        const organisation = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 2,
          orgName: `Another Org ${randomUUID()}`,
          email: `another-${randomUUID()}@example.com`,
          nations: null,
          answers: [],
          rawSubmissionData: {}
        }

        const result = await repository.insertOrganisation(organisation)

        expect(result.orgId).toBeGreaterThanOrEqual(ORG_ID_START_NUMBER)
        expect(result.referenceNumber).toBeTruthy()
      })

      it('accepts organisation with nations array', async () => {
        const organisation = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 3,
          orgName: `Multi-Nation Org ${randomUUID()}`,
          email: `multi-${randomUUID()}@example.com`,
          nations: ['England', 'Wales'],
          answers: [],
          rawSubmissionData: {}
        }

        const result = await repository.insertOrganisation(organisation)

        expect(result.orgId).toBeGreaterThanOrEqual(ORG_ID_START_NUMBER)
        expect(result.referenceNumber).toBeTruthy()
      })

      it('generates incrementing orgIds for multiple organisations', async () => {
        const org1 = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: 0,
          orgName: `First Org ${randomUUID()}`,
          email: `first-${randomUUID()}@example.com`,
          nations: null,
          answers: [],
          rawSubmissionData: {}
        }

        const org2 = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: 0,
          orgName: `Second Org ${randomUUID()}`,
          email: `second-${randomUUID()}@example.com`,
          nations: null,
          answers: [],
          rawSubmissionData: {}
        }

        const result1 = await repository.insertOrganisation(org1)
        const result2 = await repository.insertOrganisation(org2)

        expect(result1.orgId).toBeGreaterThanOrEqual(ORG_ID_START_NUMBER)
        expect(result2.orgId).toBeGreaterThanOrEqual(ORG_ID_START_NUMBER)
        expect(result2.orgId).toBeGreaterThan(result1.orgId)
        expect(result1.referenceNumber).not.toBe(result2.referenceNumber)
      })
    })

    describe('validation', () => {
      it('rejects organisation with missing orgName', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 99,
          email: `test-${randomUUID()}@example.com`,
          nations: null,
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertOrganisation(invalid)).rejects.toThrow(
          /Invalid organisation data.*orgName/
        )
      })

      it('rejects organisation with missing email', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 99,
          orgName: `Test Org ${randomUUID()}`,
          nations: null,
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertOrganisation(invalid)).rejects.toThrow(
          /Invalid organisation data.*email/
        )
      })

      it('rejects organisation with invalid email format', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 99,
          orgName: `Test Org ${randomUUID()}`,
          email: 'not-an-email',
          nations: null,
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertOrganisation(invalid)).rejects.toThrow(
          /Invalid organisation data.*email/
        )
      })

      it('rejects organisation with unknown fields', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 111,
          orgName: `Test Org ${randomUUID()}`,
          email: `test-${randomUUID()}@example.com`,
          nations: null,
          answers: [],
          rawSubmissionData: {},
          hackerField: 'DROP TABLE'
        }

        await expect(repository.insertOrganisation(invalid)).rejects.toThrow(
          /Invalid organisation data/
        )
      })

      it('rejects organisation with missing answers', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 222,
          orgName: `Test Org ${randomUUID()}`,
          email: `test-${randomUUID()}@example.com`,
          nations: null,
          rawSubmissionData: {}
        }

        await expect(repository.insertOrganisation(invalid)).rejects.toThrow(
          /Invalid organisation data.*answers/
        )
      })

      it('rejects organisation with missing rawSubmissionData', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 333,
          orgName: `Test Org ${randomUUID()}`,
          email: `test-${randomUUID()}@example.com`,
          nations: null,
          answers: []
        }

        await expect(repository.insertOrganisation(invalid)).rejects.toThrow(
          /Invalid organisation data.*rawSubmissionData/
        )
      })
    })
  })
}
