import { ObjectId } from 'mongodb'
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

        await repository.insertAccreditation(accreditation)
      })

      it('accepts valid accreditation data', async () => {
        const accreditation = {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
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
          referenceNumber: new ObjectId().toHexString(),
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
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
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
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
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
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
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
          orgId: ORG_ID_START_NUMBER + Math.floor(Math.random() * 100000),
          referenceNumber: new ObjectId().toHexString(),
          answers: []
        }

        await expect(repository.insertAccreditation(invalid)).rejects.toThrow(
          /Invalid accreditation data.*rawSubmissionData/
        )
      })
    })
  })
}
