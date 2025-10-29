import { buildOrganisation } from './test-data.js'

export const testInsertBehaviour = (repositoryFactory) => {
  describe('insert', () => {
    let repository

    beforeEach(async () => {
      repository = await repositoryFactory()
    })

    describe('basic behaviour', () => {
      it('inserts an organisation without error', async () => {
        const orgData = buildOrganisation()

        await repository.insert(orgData)

        const result = await repository.findById(orgData.id)

        const expectedData = {
          ...orgData,
          formSubmissionTime: new Date(orgData.formSubmissionTime),
          registrations: orgData.registrations.map((reg) => {
            const { statusHistory, ...regWithoutStatusHistory } = reg
            return {
              ...regWithoutStatusHistory,
              formSubmissionTime: new Date(reg.formSubmissionTime)
            }
          }),
          accreditations: orgData.accreditations.map((acc) => {
            const { statusHistory, ...accWithoutStatusHistory } = acc
            return {
              ...accWithoutStatusHistory,
              formSubmissionTime: new Date(acc.formSubmissionTime)
            }
          })
        }

        expect(result).toMatchObject(expectedData)

        expect(result.statusHistory).toBeDefined()
        expect(result.statusHistory).toHaveLength(1)
        expect(result.statusHistory[0].status).toBe('created')
        expect(result.statusHistory[0].updatedAt).toBeInstanceOf(Date)

        result.registrations.forEach((reg) => {
          expect(reg.statusHistory).toBeDefined()
          expect(reg.statusHistory).toHaveLength(1)
          expect(reg.statusHistory[0].status).toBe('created')
          expect(reg.statusHistory[0].updatedAt).toBeInstanceOf(Date)
        })

        result.accreditations.forEach((acc) => {
          expect(acc.statusHistory).toBeDefined()
          expect(acc.statusHistory).toHaveLength(1)
          expect(acc.statusHistory[0].status).toBe('created')
          expect(acc.statusHistory[0].updatedAt).toBeInstanceOf(Date)
        })
      })

      it('throws conflict error when inserting duplicate ID', async () => {
        const organisation = buildOrganisation()

        await repository.insert(organisation)

        await expect(repository.insert(organisation)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })
      })
    })

    describe('validation', () => {
      describe('required fields', () => {
        it('rejects insert with missing id', async () => {
          const orgWithoutId = buildOrganisation({ id: undefined })
          await expect(repository.insert(orgWithoutId)).rejects.toThrow(
            /Invalid organisation data.*id/
          )
        })

        it('rejects insert with missing orgId', async () => {
          const orgWithoutOrgId = buildOrganisation({ orgId: undefined })
          await expect(repository.insert(orgWithoutOrgId)).rejects.toThrow(
            /Invalid organisation data.*orgId/
          )
        })

        it('rejects insert with missing wasteProcessingTypes', async () => {
          const orgWithoutWaste = buildOrganisation({
            wasteProcessingTypes: undefined
          })
          await expect(repository.insert(orgWithoutWaste)).rejects.toThrow(
            /Invalid organisation data.*wasteProcessingTypes/
          )
        })

        it('rejects insert with missing submitterContactDetails', async () => {
          const orgWithoutContact = buildOrganisation({
            submitterContactDetails: undefined
          })
          await expect(repository.insert(orgWithoutContact)).rejects.toThrow(
            /Invalid organisation data.*submitterContactDetails/
          )
        })

        it('rejects insert with missing formSubmissionTime', async () => {
          const orgWithoutTime = buildOrganisation({
            formSubmissionTime: undefined
          })
          await expect(repository.insert(orgWithoutTime)).rejects.toThrow(
            /Invalid organisation data.*formSubmissionTime/
          )
        })

        it('rejects insert with missing submittedToRegulator', async () => {
          const orgWithoutRegulator = buildOrganisation({
            submittedToRegulator: undefined
          })
          await expect(repository.insert(orgWithoutRegulator)).rejects.toThrow(
            /Invalid organisation data.*submittedToRegulator/
          )
        })
      })

      describe('field validation', () => {
        it('rejects insert with invalid ObjectId', async () => {
          const orgWithInvalidId = buildOrganisation({ id: 'not-an-objectid' })
          await expect(repository.insert(orgWithInvalidId)).rejects.toThrow(
            /Invalid organisation data.*id/
          )
        })

        it('rejects insert with empty wasteProcessingTypes array', async () => {
          const orgWithEmptyArray = buildOrganisation({
            wasteProcessingTypes: []
          })
          await expect(repository.insert(orgWithEmptyArray)).rejects.toThrow(
            /Invalid organisation data.*At least one waste processing type/
          )
        })
      })

      describe('field handling', () => {
        it('strips unknown fields from insert', async () => {
          const orgWithUnknownFields = buildOrganisation({
            anotherBadField: 'field value1'
          })

          await repository.insert(orgWithUnknownFields)
          const result = await repository.findById(orgWithUnknownFields.id)

          expect(result.hackerField).toBeUndefined()
          expect(result.anotherBadField).toBeUndefined()
        })

        it('allows optional fields to be omitted', async () => {
          const minimalOrg = buildOrganisation({
            businessType: undefined,
            companyDetails: undefined
          })

          await repository.insert(minimalOrg)
          const result = await repository.findById(minimalOrg.id)

          expect(result).toBeTruthy()
          expect(result.orgId).toBe(minimalOrg.orgId)
        })

        it('defaults registrations and accreditations to empty arrays when not provided', async () => {
          const orgData = buildOrganisation({
            registrations: undefined,
            accreditations: undefined
          })

          await repository.insert(orgData)
          const result = await repository.findById(orgData.id)

          expect(result).toBeTruthy()
          expect(result.registrations).toEqual([])
          expect(result.accreditations).toEqual([])
        })
      })
    })
  })
}
