import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildAccreditationKeys,
  buildAwaitingAcceptancePrn,
  buildDeletedPrn,
  buildDraftPrn,
  underAccreditation
} from './test-data.js'

/** @import { PackagingRecyclingNotesRepository as PrnRepository } from '../port.js' */

export const testFindBehaviour = (it) => {
  describe('find', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ prnRepository: PrnRepository }} */ { prnRepository }
      ) => {
        repository = prnRepository
      }
    )

    describe('findById', () => {
      it('returns null when id not found', async () => {
        const result = await repository.findById('000000000000000000000000')

        expect(result).toBeNull()
      })

      it('retrieves a PRN by id after create', async () => {
        const prnInput = buildDraftPrn({
          organisation: { name: 'Find Test Org' },
          tonnage: 123.45
        })

        const created = await repository.create(prnInput)
        const found = await repository.findById(created.id)

        expect(found).toBeTruthy()
        expect(found.id).toBe(created.id)
        expect(found.organisation.name).toBe('Find Test Org')
        expect(found.tonnage).toBe(123.45)
      })

      it('does not return PRNs with different ids', async () => {
        const prn1 = await repository.create(
          buildDraftPrn({
            organisation: { name: 'Org A' }
          })
        )
        await repository.create(
          buildDraftPrn({
            organisation: { name: 'Org B' }
          })
        )

        const found = await repository.findById(prn1.id)

        expect(found.organisation.name).toBe('Org A')
      })
    })

    describe('findByPrnNumber', () => {
      it('returns null when PRN number not found', async () => {
        const result = await repository.findByPrnNumber('NONEXISTENT001')

        expect(result).toBeNull()
      })

      it('retrieves a PRN by its PRN number', async () => {
        const prnInput = buildAwaitingAcceptancePrn({
          prnNumber: `FIND-${Date.now()}`
        })

        const created = await repository.create(prnInput)
        const found = await repository.findByPrnNumber(created.prnNumber)

        expect(found).toBeTruthy()
        expect(found.id).toBe(created.id)
        expect(found.prnNumber).toBe(created.prnNumber)
      })

      it('returns PRN with correct status', async () => {
        const prnNumber = `STATUS-${Date.now()}`
        await repository.create(buildAwaitingAcceptancePrn({ prnNumber }))

        const found = await repository.findByPrnNumber(prnNumber)

        expect(found.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      })

      it('does not return PRNs with different PRN numbers', async () => {
        const prnNumber1 = `A-${Date.now()}`
        const prnNumber2 = `B-${Date.now()}`

        await repository.create(
          buildAwaitingAcceptancePrn({
            prnNumber: prnNumber1,
            tonnage: 100
          })
        )
        await repository.create(
          buildAwaitingAcceptancePrn({
            prnNumber: prnNumber2,
            tonnage: 200
          })
        )

        const found = await repository.findByPrnNumber(prnNumber1)

        expect(found.tonnage).toBe(100)
      })

      it('does not leak _id in returned PRN', async () => {
        const prnNumber = `NOID-${Date.now()}`
        await repository.create(buildAwaitingAcceptancePrn({ prnNumber }))

        const found = await repository.findByPrnNumber(prnNumber)

        expect(found._id).toBeUndefined()
      })
    })

    describe('findByAccreditation', () => {
      it('returns empty array when no PRNs for accreditation', async () => {
        const accreditation = buildAccreditationKeys()

        const result = await repository.findByAccreditation(accreditation)

        expect(result).toEqual([])
      })

      it('returns all PRNs for the specified accreditation', async () => {
        const accreditation = buildAccreditationKeys()
        const other = buildAccreditationKeys()

        await repository.create(
          buildDraftPrn(underAccreditation(accreditation, { tonnage: 100 }))
        )
        await repository.create(
          buildDraftPrn(underAccreditation(accreditation, { tonnage: 200 }))
        )
        await repository.create(
          buildDraftPrn(underAccreditation(other, { tonnage: 300 }))
        )

        const result = await repository.findByAccreditation(accreditation)

        expect(result).toHaveLength(2)
        const tonnages = result.map((prn) => prn.tonnage).sort((a, b) => a - b)
        expect(tonnages).toEqual([100, 200])
      })

      it('returns PRNs with their ids populated', async () => {
        const accreditation = buildAccreditationKeys()

        await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByAccreditation(accreditation)

        expect(result).toHaveLength(1)
        expect(result[0].id).toBeDefined()
        expect(typeof result[0].id).toBe('string')
      })

      it('does not return PRNs from different accreditations', async () => {
        const accreditationA = buildAccreditationKeys()
        const accreditationB = buildAccreditationKeys()

        await repository.create(
          buildDraftPrn(underAccreditation(accreditationA))
        )
        await repository.create(
          buildDraftPrn(underAccreditation(accreditationB))
        )

        const result = await repository.findByAccreditation(accreditationA)

        expect(result).toHaveLength(1)
        expect(result[0].organisation.organisationNumber).toBe(
          accreditationA.organisationNumber
        )
      })

      it('reads nothing for the same accreditation under a different organisation', async () => {
        const accreditation = buildAccreditationKeys()
        await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByAccreditation({
          ...accreditation,
          organisationNumber: buildAccreditationKeys().organisationNumber
        })

        expect(result).toEqual([])
      })

      it('reads nothing for the same accreditation under a different registration', async () => {
        const accreditation = buildAccreditationKeys()
        await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByAccreditation({
          ...accreditation,
          registrationNumber: buildAccreditationKeys().registrationNumber
        })

        expect(result).toEqual([])
      })

      it('does not return deleted PRNs (soft delete)', async () => {
        const accreditation = buildAccreditationKeys()

        await repository.create(
          buildDraftPrn(underAccreditation(accreditation, { tonnage: 100 }))
        )
        await repository.create(
          buildDeletedPrn(underAccreditation(accreditation, { tonnage: 200 }))
        )

        const result = await repository.findByAccreditation(accreditation)

        expect(result).toHaveLength(1)
        expect(result[0].tonnage).toBe(100)
      })
    })

    describe('findByIds', () => {
      it('reads the notes the ids name', async () => {
        const accreditation = buildAccreditationKeys()
        const wanted = await repository.create(
          buildDraftPrn(underAccreditation(accreditation, { tonnage: 100 }))
        )
        await repository.create(
          buildDraftPrn(underAccreditation(accreditation, { tonnage: 200 }))
        )

        const result = await repository.findByIds({
          ...accreditation,
          ids: [wanted.id]
        })

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe(wanted.id)
        expect(result[0].tonnage).toBe(100)
      })

      it('reads nothing when no ids are named', async () => {
        const accreditation = buildAccreditationKeys()
        await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByIds({ ...accreditation, ids: [] })

        expect(result).toEqual([])
      })

      it('reads nothing for a note another accreditation holds', async () => {
        const accreditation = buildAccreditationKeys()
        const elsewhere = await repository.create(
          buildDraftPrn(underAccreditation(buildAccreditationKeys()))
        )

        const result = await repository.findByIds({
          ...accreditation,
          ids: [elsewhere.id]
        })

        expect(result).toEqual([])
      })

      it('reads nothing for the same accreditation under a different organisation', async () => {
        const accreditation = buildAccreditationKeys()
        const note = await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByIds({
          ...accreditation,
          organisationNumber: buildAccreditationKeys().organisationNumber,
          ids: [note.id]
        })

        expect(result).toEqual([])
      })

      it('reads nothing for the same accreditation under a different registration', async () => {
        const accreditation = buildAccreditationKeys()
        const note = await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByIds({
          ...accreditation,
          registrationNumber: buildAccreditationKeys().registrationNumber,
          ids: [note.id]
        })

        expect(result).toEqual([])
      })

      it('reads nothing for an id no note is stored under', async () => {
        const accreditation = buildAccreditationKeys()
        await repository.create(
          buildDraftPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByIds({
          ...accreditation,
          ids: ['a note that was never stored']
        })

        expect(result).toEqual([])
      })

      it('does not return deleted PRNs (soft delete)', async () => {
        const accreditation = buildAccreditationKeys()
        const deleted = await repository.create(
          buildDeletedPrn(underAccreditation(accreditation))
        )

        const result = await repository.findByIds({
          ...accreditation,
          ids: [deleted.id]
        })

        expect(result).toEqual([])
      })
    })
  })
}
