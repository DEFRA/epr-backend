import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { buildDraftPrn } from './test-data.js'

const numbers = {
  organisationNumber: toOrganisationNumber('500123'),
  registrationNumber: toRegistrationNumber('R25SR500010912PL')
}

export const testAssignNumbersBehaviour = (it) => {
  describe('assignNumbers', () => {
    /** @type {import('../port.js').PackagingRecyclingNotesRepository} */
    let repository

    beforeEach(
      async (
        /** @type {{ prnRepository: import('../port.js').PackagingRecyclingNotesRepository }} */ {
          prnRepository
        }
      ) => {
        repository = prnRepository
      }
    )

    /**
     * @param {import('../port.js').PrnNumbers} [held]
     */
    const createPrn = async ({
      organisationNumber,
      registrationNumber
    } = {}) => {
      const draft = buildDraftPrn()
      const prn = await repository.create({
        ...draft,
        organisation: {
          ...draft.organisation,
          ...(organisationNumber && { organisationNumber })
        },
        ...(registrationNumber && { registration: { registrationNumber } })
      })
      return prn.id
    }

    describe('findIdsWithoutNumbers', () => {
      it('lists a PRN without an organisation number', async () => {
        const id = await createPrn({
          registrationNumber: numbers.registrationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toContain(id)
      })

      it('lists a PRN without a registration number', async () => {
        const id = await createPrn({
          organisationNumber: numbers.organisationNumber
        })

        expect(await repository.findIdsWithoutNumbers()).toContain(id)
      })

      it('does not list a PRN holding both numbers', async () => {
        const id = await createPrn(numbers)

        expect(await repository.findIdsWithoutNumbers()).not.toContain(id)
      })
    })

    it('sets the numbers and leaves the version and other fields alone', async () => {
      const id = await createPrn()
      const before = await repository.findById(id)

      await repository.assignNumbers(id, numbers)

      expect(await repository.findById(id)).toStrictEqual({
        ...before,
        organisation: {
          ...before?.organisation,
          organisationNumber: numbers.organisationNumber
        },
        registration: { registrationNumber: numbers.registrationNumber }
      })
      expect(await repository.findIdsWithoutNumbers()).not.toContain(id)
    })

    it('sets one number, leaving the PRN listed for the other', async () => {
      const id = await createPrn()

      await repository.assignNumbers(id, {
        organisationNumber: numbers.organisationNumber
      })

      expect((await repository.findById(id))?.organisation).toMatchObject({
        organisationNumber: numbers.organisationNumber
      })
      expect(await repository.findIdsWithoutNumbers()).toContain(id)
    })

    it('conflicts rather than overwrite a number already held', async () => {
      const id = await createPrn({
        organisationNumber: numbers.organisationNumber
      })
      const before = await repository.findById(id)

      await expect(
        repository.assignNumbers(id, {
          organisationNumber: toOrganisationNumber('999999'),
          registrationNumber: numbers.registrationNumber
        })
      ).rejects.toMatchObject({ output: { statusCode: 409 } })
      expect(await repository.findById(id)).toStrictEqual(before)
    })

    it('throws not found for an unknown id', async () => {
      await expect(
        repository.assignNumbers(new ObjectId().toHexString(), numbers)
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })

    for (const [description, invalid] of [
      ['no numbers', {}],
      ['an unknown field', { accreditationNumber: 'A26ER5000000001PA' }],
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
        const id = await createPrn()

        await expect(
          repository.assignNumbers(id, /** @type {*} */ (invalid))
        ).rejects.toMatchObject({ output: { statusCode: 400 } })
      })
    }
  })
}
