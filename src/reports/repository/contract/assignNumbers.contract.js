import { describe, beforeEach, expect } from 'vitest'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { randomUUID } from 'node:crypto'
import { buildCreateReportParams } from './test-data.js'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL'
}
const accreditationNumber = 'A26ER5000000001PA'

export const testAssignNumbersBehaviour = (it) => {
  describe('assignNumbers', () => {
    let repository
    /** @type {(reportId: string, accreditationNumber: string | null) => Promise<void>} */
    let storeAccreditationNumber

    beforeEach(
      async (
        /** @type {{ reportsRepository: import('../port.js').ReportsRepositoryFactory, storeAccreditationNumber: typeof storeAccreditationNumber }} */ {
          reportsRepository,
          storeAccreditationNumber: store
        }
      ) => {
        repository = reportsRepository()
        storeAccreditationNumber = store
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

      it('does not list a report holding every number', async () => {
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
      ['an accreditation number', { accreditationNumber }],
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

    describe('removing an accreditation number', () => {
      it('lists only the reports stored with an accreditation number, null included', async () => {
        const accredited = await createReport()
        const registeredOnly = await createReport({ period: 2 })
        await createReport({ period: 3 })
        await storeAccreditationNumber(accredited, accreditationNumber)
        await storeAccreditationNumber(registeredOnly, null)

        expect(
          (await repository.findIdsWithAccreditationNumber()).toSorted()
        ).toEqual([accredited, registeredOnly].toSorted())
      })

      for (const [description, held] of [
        ['an accreditation number', accreditationNumber],
        ['a null accreditation number', null]
      ]) {
        it(`removes ${description}, returning it and leaving the rest of the report alone`, async () => {
          const id = await createReport(numbers)
          const before = await repository.findReportById(id)
          await storeAccreditationNumber(id, held)

          expect(await repository.removeAccreditationNumber(id)).toEqual({
            accreditationNumber: held
          })
          expect(await repository.findReportById(id)).toEqual(before)
          expect(await repository.findIdsWithAccreditationNumber()).toEqual([])
        })
      }

      it('updates a report still stored with an accreditation number, which stays for removal', async () => {
        const id = await createReport(numbers)
        await storeAccreditationNumber(id, accreditationNumber)

        await repository.updateReport({
          reportId: id,
          version: 1,
          fields: { supportingInformation: 'Supply chain disruption' }
        })
        await repository.updateReportStatus({
          reportId: id,
          version: 2,
          status: REPORT_STATUS.READY_TO_SUBMIT,
          slot: REPORT_STATUS_SLOT.READY,
          changedBy: { id: 'user-1', name: 'Test User', position: 'tester' }
        })

        expect(await repository.findReportById(id)).toMatchObject({
          version: 3,
          supportingInformation: 'Supply chain disruption',
          status: { currentStatus: REPORT_STATUS.READY_TO_SUBMIT }
        })
        expect(await repository.removeAccreditationNumber(id)).toEqual({
          accreditationNumber
        })
      })

      it('returns null for a report holding no accreditation number', async () => {
        const id = await createReport()

        expect(await repository.removeAccreditationNumber(id)).toBeNull()
      })

      it('returns null for an unknown id', async () => {
        expect(
          await repository.removeAccreditationNumber(randomUUID())
        ).toBeNull()
      })
    })
  })
}
