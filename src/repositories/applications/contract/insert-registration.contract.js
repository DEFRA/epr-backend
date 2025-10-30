import { ObjectId } from 'mongodb'
import { SCHEMA_VERSION, ORG_ID_START_NUMBER } from '#common/enums/index.js'

export const testInsertRegistrationBehaviour = (repositoryFactory) => {
  describe('insertRegistration', () => {
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
      it('inserts registration without error', async () => {
        const registration = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
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

        await repository.insertRegistration(registration)
      })

      it('accepts valid registration data', async () => {
        const registration = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
          answers: [],
          rawSubmissionData: {}
        }

        await repository.insertRegistration(registration)
      })
    })

    describe('validation', () => {
      it('rejects registration with missing orgId', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          referenceNumber: new ObjectId().toHexString(),
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertRegistration(invalid)).rejects.toThrow(
          /Invalid registration data.*orgId/
        )
      })

      it('rejects registration with missing referenceNumber', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertRegistration(invalid)).rejects.toThrow(
          /Invalid registration data.*referenceNumber/
        )
      })

      it('rejects registration with unknown fields', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
          answers: [],
          rawSubmissionData: {},
          hackerField: 'DROP TABLE'
        }

        await expect(repository.insertRegistration(invalid)).rejects.toThrow(
          /Invalid registration data/
        )
      })

      it('rejects registration with missing answers', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
          rawSubmissionData: {}
        }

        await expect(repository.insertRegistration(invalid)).rejects.toThrow(
          /Invalid registration data.*answers/
        )
      })

      it('rejects registration with missing rawSubmissionData', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
          answers: []
        }

        await expect(repository.insertRegistration(invalid)).rejects.toThrow(
          /Invalid registration data.*rawSubmissionData/
        )
      })
    })
  })
}
