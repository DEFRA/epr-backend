import { randomUUID } from 'node:crypto'
import { describe, beforeEach, expect } from 'vitest'
import { summaryLogFactory, withoutAccreditationId } from './test-data.js'
import { waitForVersion } from './test-helpers.js'

const numbers = {
  organisationNumber: '500123',
  registrationNumber: 'R25SR500010912PL',
  accreditationNumber: 'ACC500123'
}

export const testAssignNumbers = (it) => {
  describe('assignNumbers', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ summaryLogsRepository: import('../port.js').SummaryLogsRepository }} */ {
          summaryLogsRepository
        }
      ) => {
        repository = summaryLogsRepository
      }
    )

    const insertLog = async (summaryLog) => {
      const id = `contract-numbers-${randomUUID()}`
      await repository.insert(id, summaryLog)
      return id
    }

    describe('findIdsWithoutNumbers', () => {
      it('lists a summary log without an organisation number', async () => {
        const id = await insertLog(
          summaryLogFactory.validating({
            accreditationNumber: null,
            registrationNumber: numbers.registrationNumber
          })
        )

        expect(await repository.findIdsWithoutNumbers()).toContain(id)
      })

      it('lists a summary log without a registration number', async () => {
        const id = await insertLog(
          summaryLogFactory.validating({
            accreditationNumber: null,
            organisationNumber: numbers.organisationNumber
          })
        )

        expect(await repository.findIdsWithoutNumbers()).toContain(id)
      })

      it('lists a summary log holding an accreditation id but no accreditation number', async () => {
        const id = await insertLog(
          summaryLogFactory.validating({
            accreditationId: 'acc-1',
            organisationNumber: numbers.organisationNumber,
            registrationNumber: numbers.registrationNumber
          })
        )

        expect(await repository.findIdsWithoutNumbers()).toContain(id)
      })

      it('does not list a summary log holding every number it needs', async () => {
        const accreditedId = await insertLog(
          summaryLogFactory.validating({ accreditationId: 'acc-1', ...numbers })
        )
        const registeredOnlyId = await insertLog(
          summaryLogFactory.validating({
            ...numbers,
            accreditationNumber: null
          })
        )
        const unscopedId = await insertLog(
          withoutAccreditationId(
            summaryLogFactory.validating({
              organisationNumber: numbers.organisationNumber,
              registrationNumber: numbers.registrationNumber
            })
          )
        )

        const ids = await repository.findIdsWithoutNumbers()

        expect(ids).not.toContain(accreditedId)
        expect(ids).not.toContain(registeredOnlyId)
        expect(ids).not.toContain(unscopedId)
      })
    })

    it('sets the numbers, bumps the version and leaves other fields alone', async () => {
      const id = await insertLog(
        summaryLogFactory.validating({ accreditationId: 'acc-1' })
      )
      const before = await repository.findById(id)

      await repository.assignNumbers(id, before.version, numbers)

      const after = await waitForVersion(repository, id, before.version + 1)
      expect(after.summaryLog).toEqual({ ...before.summaryLog, ...numbers })
      expect(await repository.findIdsWithoutNumbers()).not.toContain(id)
    })

    it('sets a null accreditation number', async () => {
      const id = await insertLog(summaryLogFactory.validating())
      const before = await repository.findById(id)

      await repository.assignNumbers(id, before.version, {
        accreditationNumber: null
      })

      const after = await waitForVersion(repository, id, before.version + 1)
      expect(after.summaryLog.accreditationNumber).toBeNull()
    })

    it('conflicts on a stale version', async () => {
      const id = await insertLog(summaryLogFactory.validating())

      await expect(
        repository.assignNumbers(id, 99, numbers)
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
    })

    it('conflicts rather than overwrite a number already held', async () => {
      const id = await insertLog(
        summaryLogFactory.validating({
          organisationNumber: numbers.organisationNumber
        })
      )
      const before = await repository.findById(id)

      await expect(
        repository.assignNumbers(id, before.version, {
          organisationNumber: '999999',
          registrationNumber: numbers.registrationNumber
        })
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
      expect((await repository.findById(id)).summaryLog).toEqual(
        before.summaryLog
      )
    })

    it('throws not found for an unknown id', async () => {
      await expect(
        repository.assignNumbers(`contract-missing-${randomUUID()}`, 1, numbers)
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })

    for (const [description, invalid] of [
      ['no numbers', {}],
      ['an unknown field', { status: 'submitted' }],
      ['a non-string number', { organisationNumber: 500123 }]
    ]) {
      it(`rejects ${description}`, async () => {
        const id = await insertLog(summaryLogFactory.validating())

        await expect(
          repository.assignNumbers(id, 1, invalid)
        ).rejects.toMatchObject({ output: { statusCode: 422 } })
      })
    }
  })
}
