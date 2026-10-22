import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildCreateReportParams } from './test-data.js'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL'
}

export const testAssignNumbersBehaviour = (it) => {
  describe('assignNumbers', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ reportsRepository: import('../port.js').ReportsRepositoryFactory }} */ {
          reportsRepository
        }
      ) => {
        repository = reportsRepository()
      }
    )

    const createReport = async (overrides = {}) =>
      (await repository.createReport(buildCreateReportParams(overrides))).id

    describe('findIdsWithoutNumbers', () => {
      it('lists a report without an organisation number', async () => {
        const id = await createReport({
          registrationNumber: numbers.registrationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toEqual([id])
      })

      it('lists a report without a registration number', async () => {
        const id = await createReport({
          organisationNumber: numbers.organisationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toEqual([id])
      })

      it('does not list a report holding both numbers', async () => {
        await createReport(numbers)

        expect(await repository.findIdsWithoutNumbers()).toEqual([])
      })
    })

    it('sets the numbers and leaves the version and other fields alone', async () => {
      const id = await createReport()
      const before = await repository.findReportById(id)

      await repository.assignNumbers(id, numbers)

      expect(await repository.findReportById(id)).toEqual({
        ...before,
        ...numbers
      })
      expect(await repository.findIdsWithoutNumbers()).toEqual([])
    })

    it('sets one number, leaving the report listed for the other', async () => {
      const id = await createReport()

      await repository.assignNumbers(id, {
        organisationNumber: numbers.organisationNumber
      })

      expect(await repository.findReportById(id)).toMatchObject({
        organisationNumber: numbers.organisationNumber
      })
      expect(await repository.findIdsWithoutNumbers()).toEqual([id])
    })

    it('conflicts rather than overwrite a number already held', async () => {
      const id = await createReport({
        organisationNumber: numbers.organisationNumber
      })
      const before = await repository.findReportById(id)

      await expect(
        repository.assignNumbers(id, {
          organisationNumber: '999999',
          registrationNumber: numbers.registrationNumber
        })
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
      expect(await repository.findReportById(id)).toEqual(before)
    })

    it('throws not found for an unknown id', async () => {
      await expect(
        repository.assignNumbers(randomUUID(), numbers)
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })

    for (const [description, invalid] of [
      ['no numbers', {}],
      ['an unknown field', { year: 2026 }],
      ['a non-string number', { organisationNumber: 500123 }],
      ['an undefined number', { organisationNumber: undefined }],
      [
        'an undefined number beside a real one',
        {
          organisationNumber: undefined,
          registrationNumber: numbers.registrationNumber
        }
      ]
    ]) {
      it(`rejects ${description}`, async () => {
        const id = await createReport()

        await expect(
          repository.assignNumbers(id, invalid)
        ).rejects.toMatchObject({ output: { statusCode: 400 } })
      })
    }
  })
}
