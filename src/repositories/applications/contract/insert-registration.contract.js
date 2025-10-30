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
          orgId: ORG_ID_START_NUMBER + 123,
          referenceNumber: '607f1f77bcf86cd799439012',
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
          orgId: ORG_ID_START_NUMBER + 456,
          referenceNumber: '607f191e810c19729de860ef',
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
          referenceNumber: '607f191e810c19729de860f0',
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
          orgId: ORG_ID_START_NUMBER + 999,
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
          orgId: ORG_ID_START_NUMBER + 111,
          referenceNumber: '607f191e810c19729de860f1',
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
          orgId: ORG_ID_START_NUMBER + 222,
          referenceNumber: '607f191e810c19729de860f2',
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
          orgId: ORG_ID_START_NUMBER + 333,
          referenceNumber: '607f191e810c19729de860f3',
          answers: []
        }

        await expect(repository.insertRegistration(invalid)).rejects.toThrow(
          /Invalid registration data.*rawSubmissionData/
        )
      })
    })
  })
}
