import { SCHEMA_VERSION, ORG_ID_START_NUMBER } from '#common/enums/index.js'

export const testInsertAccreditationBehaviour = (repositoryFactory) => {
  describe('insertAccreditation', () => {
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
      it('inserts accreditation without error', async () => {
        const accreditation = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 123,
          referenceNumber: '507f1f77bcf86cd799439011',
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

        await repository.insertAccreditation(accreditation)
      })

      it('accepts valid accreditation data', async () => {
        const accreditation = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 456,
          referenceNumber: '507f191e810c19729de860ea',
          answers: [],
          rawSubmissionData: {}
        }

        await repository.insertAccreditation(accreditation)
      })
    })

    describe('validation', () => {
      it('rejects accreditation with missing orgId', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          referenceNumber: '507f191e810c19729de860eb',
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertAccreditation(invalid)).rejects.toThrow(
          /Invalid accreditation data.*orgId/
        )
      })

      it('rejects accreditation with missing referenceNumber', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 999,
          answers: [],
          rawSubmissionData: {}
        }

        await expect(repository.insertAccreditation(invalid)).rejects.toThrow(
          /Invalid accreditation data.*referenceNumber/
        )
      })

      it('rejects accreditation with unknown fields', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 111,
          referenceNumber: '507f191e810c19729de860ec',
          answers: [],
          rawSubmissionData: {},
          hackerField: 'DROP TABLE'
        }

        await expect(repository.insertAccreditation(invalid)).rejects.toThrow(
          /Invalid accreditation data/
        )
      })

      it('rejects accreditation with missing answers', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 222,
          referenceNumber: '507f191e810c19729de860ed',
          rawSubmissionData: {}
        }

        await expect(repository.insertAccreditation(invalid)).rejects.toThrow(
          /Invalid accreditation data.*answers/
        )
      })

      it('rejects accreditation with missing rawSubmissionData', async () => {
        const invalid = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 333,
          referenceNumber: '507f191e810c19729de860ee',
          answers: []
        }

        await expect(repository.insertAccreditation(invalid)).rejects.toThrow(
          /Invalid accreditation data.*rawSubmissionData/
        )
      })
    })
  })
}
