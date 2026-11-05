import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { QUARTERLY_PERIODS } from '#reports/domain/period-labels.js'
import { buildCreateReportParams } from './test-data.js'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL',
  accreditationNumber: 'A26ER5000000001PA'
}

const registeredOnly = {
  cadence: 'quarterly',
  period: QUARTERLY_PERIODS.Q1,
  accreditationNumber: null
}

export const testAssignNumbersBehaviour = (it) => {
  describe('assignNumbers', () => {
    let repository
    let forgetAccreditationNumber

    beforeEach(
      async (
        /** @type {{ reportsRepository: import('../port.js').ReportsRepositoryFactory, forgetAccreditationNumber: (reportId: string) => Promise<void> }} */ {
          reportsRepository,
          forgetAccreditationNumber: forget
        }
      ) => {
        repository = reportsRepository()
        forgetAccreditationNumber = forget
      }
    )

    const createReport = async (overrides = {}) =>
      (await repository.createReport(buildCreateReportParams(overrides))).id

    // Reports created before numbers were stored hold no accreditation number,
    // which createReport no longer allows.
    const createReportWithoutAccreditationNumber = async (overrides = {}) => {
      const id = await createReport(overrides)
      await forgetAccreditationNumber(id)
      return id
    }

    describe('findIdsWithoutNumbers', () => {
      it('lists a report without an organisation number', async () => {
        const id = await createReport({
          registrationNumber: numbers.registrationNumber,
          accreditationNumber: numbers.accreditationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toEqual([id])
      })

      it('lists a report without a registration number', async () => {
        const id = await createReport({
          organisationNumber: numbers.organisationNumber,
          accreditationNumber: numbers.accreditationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toEqual([id])
      })

      it('lists a report without an accreditation number', async () => {
        const id = await createReportWithoutAccreditationNumber({
          organisationNumber: numbers.organisationNumber,
          registrationNumber: numbers.registrationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toEqual([id])
      })

      it('does not list a report holding every number', async () => {
        await createReport(numbers)

        expect(await repository.findIdsWithoutNumbers()).toEqual([])
      })

      it('does not list a registered-only report, whose accreditation number is null', async () => {
        await createReport({ ...numbers, ...registeredOnly })

        expect(await repository.findIdsWithoutNumbers()).toEqual([])
      })
    })

    it('sets the numbers and leaves the version and other fields alone', async () => {
      const id = await createReportWithoutAccreditationNumber()
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

    it('sets a null accreditation number on a registered-only report', async () => {
      const id = await createReportWithoutAccreditationNumber(registeredOnly)

      await repository.assignNumbers(id, { accreditationNumber: null })

      expect(await repository.findReportById(id)).toMatchObject({
        accreditationNumber: null
      })
    })

    it('refuses a null accreditation number on an accredited report, leaving it unnumbered', async () => {
      const id = await createReportWithoutAccreditationNumber()

      await expect(
        repository.assignNumbers(id, { accreditationNumber: null })
      ).rejects.toMatchObject({ output: { statusCode: 400 } })
      expect(await repository.findReportById(id)).not.toHaveProperty(
        'accreditationNumber'
      )
    })

    it('refuses an accreditation number on a registered-only report, leaving it unnumbered', async () => {
      const id = await createReportWithoutAccreditationNumber(registeredOnly)

      await expect(
        repository.assignNumbers(id, {
          accreditationNumber: numbers.accreditationNumber
        })
      ).rejects.toMatchObject({ output: { statusCode: 400 } })
      expect(await repository.findReportById(id)).not.toHaveProperty(
        'accreditationNumber'
      )
    })

    it('conflicts rather than overwrite a null accreditation number', async () => {
      const id = await createReport(registeredOnly)

      await expect(
        repository.assignNumbers(id, {
          accreditationNumber: numbers.accreditationNumber
        })
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
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
