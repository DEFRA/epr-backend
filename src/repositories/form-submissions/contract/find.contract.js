export const testFindBehaviour = (repositoryFactory) => {
  describe('findAll', () => {
    let repository

    beforeEach(async () => {
      repository = await repositoryFactory()
    })

    it('should return empty array when no documents exist', async () => {
      const result = await repository.findAll()
      expect(result).toEqual([])
    })

    it('should return only id, orgId and rawSubmissionData fields', async () => {
      await repository._insertTestData([
        {
          _id: 'test-id-1',
          schemaVersion: 1,
          createdAt: new Date(),
          orgId: 500001,
          orgName: 'Test Org 1',
          email: 'test1@example.com',
          answers: [
            {
              shortDescription: 'Test field',
              title: 'Test title',
              type: 'TextField',
              value: 'Test value'
            }
          ],
          rawSubmissionData: {
            meta: { timestamp: '2025-10-08T16:14:15.390Z' },
            data: { main: { field1: 'value1' } }
          }
        },
        {
          _id: 'test-id-2',
          schemaVersion: 1,
          createdAt: new Date(),
          orgId: 500002,
          orgName: 'Test Org 2',
          email: 'test2@example.com',
          answers: [
            {
              shortDescription: 'Test field 2',
              title: 'Test title 2',
              type: 'TextField',
              value: 'Test value 2'
            }
          ],
          rawSubmissionData: {
            meta: { timestamp: '2025-10-09T10:20:30.123Z' },
            data: { main: { field2: 'value2' } }
          }
        }
      ])

      const result = await repository.findAll()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'test-id-1',
        orgId: 500001,
        rawSubmissionData: {
          meta: { timestamp: '2025-10-08T16:14:15.390Z' },
          data: { main: { field1: 'value1' } }
        }
      })
      expect(result[1]).toEqual({
        id: 'test-id-2',
        orgId: 500002,
        rawSubmissionData: {
          meta: { timestamp: '2025-10-09T10:20:30.123Z' },
          data: { main: { field2: 'value2' } }
        }
      })
    })

    it('should return all documents when multiple exist', async () => {
      const testData = Array.from({ length: 5 }, (_, i) => ({
        _id: `test-id-${i}`,
        schemaVersion: 1,
        createdAt: new Date(),
        orgId: 500000 + i,
        orgName: `Test Org ${i}`,
        email: `test${i}@example.com`,
        answers: [
          {
            shortDescription: `Field ${i}`,
            title: `Title ${i}`,
            type: 'TextField',
            value: `Value ${i}`
          }
        ],
        rawSubmissionData: {
          meta: { submissionId: `sub-${i}` },
          data: { main: {} }
        }
      }))

      await repository._insertTestData(testData)

      const result = await repository.findAll()

      expect(result).toHaveLength(5)
      expect(result.map((r) => r.id)).toEqual([
        'test-id-0',
        'test-id-1',
        'test-id-2',
        'test-id-3',
        'test-id-4'
      ])
    })
  })
}
