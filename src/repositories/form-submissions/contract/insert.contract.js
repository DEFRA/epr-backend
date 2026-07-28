import { describe, expect } from 'vitest'
import { ORG_ID_START_NUMBER } from '#common/enums/index.js'
import {
  accreditationSubmission,
  organisationSubmission,
  registrationSubmission
} from '#domain/form-submissions/submission-records.js'
import { generateReferenceNumber } from './test-data.js'

const anAnswer = {
  shortDescription: 'Organisation name',
  title: 'What is the name of your organisation?',
  type: 'TextField',
  value: 'ACME ltd'
}

export const testAllocateOrgIdBehaviour = (it) => {
  describe('allocateOrgId', () => {
    it('allocates above the organisation id start number', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()

      const orgId = await repository.allocateOrgId()

      expect(orgId).toBeGreaterThan(ORG_ID_START_NUMBER)
    })

    it('allocates the next id on each call', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()

      const first = await repository.allocateOrgId()
      const second = await repository.allocateOrgId()

      expect(second).toBe(first + 1)
    })

    it('never hands the same id to two concurrent callers', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const allocations = 20

      const orgIds = await Promise.all(
        Array.from({ length: allocations }, () => repository.allocateOrgId())
      )

      expect(new Set(orgIds).size).toBe(allocations)
    })
  })
}

export const testInsertBehaviour = (it) => {
  describe('insertOrganisation', () => {
    it('stores the organisation and returns its reference number', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const orgId = await repository.allocateOrgId()
      const submission = organisationSubmission({
        orgId,
        orgName: 'ACME ltd',
        email: 'alice@foo.com',
        answers: [anAnswer],
        rawSubmissionData: { meta: { definition: { name: 'Apply (ea)' } } }
      })

      const referenceNumber = await repository.insertOrganisation(submission)

      const stored = await repository.findOrganisationById(referenceNumber)
      expect(stored.id).toBe(referenceNumber)
      expect(stored.orgId).toBe(orgId)
      expect(stored.rawSubmissionData).toEqual(submission.rawSubmissionData)
    })

    it('hands a distinct reference number to each organisation', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const build = async () =>
        repository.insertOrganisation(
          organisationSubmission({
            orgId: await repository.allocateOrgId(),
            orgName: 'ACME ltd',
            email: 'alice@foo.com',
            answers: [anAnswer],
            rawSubmissionData: {}
          })
        )

      const first = await build()
      const second = await build()

      expect(first).not.toBe(second)
    })

    it('makes the organisation visible to findAllOrganisations', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const orgId = await repository.allocateOrgId()

      const referenceNumber = await repository.insertOrganisation(
        organisationSubmission({
          orgId,
          orgName: 'ACME ltd',
          email: 'alice@foo.com',
          answers: [anAnswer],
          rawSubmissionData: {}
        })
      )

      const all = await repository.findAllOrganisations()
      expect(all.map((org) => org.id)).toContain(referenceNumber)
    })
  })

  describe('insertRegistration', () => {
    it('stores the registration against its organisation and reference number', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const orgId = await repository.allocateOrgId()
      const referenceNumber = generateReferenceNumber()
      const submission = registrationSubmission({
        orgId,
        referenceNumber,
        answers: [anAnswer],
        rawSubmissionData: { data: { main: { field: 'value' } } }
      })

      await repository.insertRegistration(submission)

      const found =
        await repository.findRegistrationsBySystemReference(referenceNumber)
      expect(found).toHaveLength(1)
      expect(found[0].orgId).toBe(orgId)
      expect(found[0].referenceNumber).toBe(referenceNumber)
      expect(found[0].rawSubmissionData).toEqual(submission.rawSubmissionData)
    })

    it('gives the stored registration an id that findRegistrationById resolves', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const referenceNumber = generateReferenceNumber()

      await repository.insertRegistration(
        registrationSubmission({
          orgId: await repository.allocateOrgId(),
          referenceNumber,
          answers: [anAnswer],
          rawSubmissionData: {}
        })
      )

      const [stored] =
        await repository.findRegistrationsBySystemReference(referenceNumber)
      const byId = await repository.findRegistrationById(stored.id)
      expect(byId.id).toBe(stored.id)
    })
  })

  describe('insertAccreditation', () => {
    it('stores the accreditation against its organisation and reference number', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const orgId = await repository.allocateOrgId()
      const referenceNumber = generateReferenceNumber()
      const submission = accreditationSubmission({
        orgId,
        referenceNumber,
        answers: [anAnswer],
        rawSubmissionData: { data: { main: { field: 'value' } } }
      })

      await repository.insertAccreditation(submission)

      const found =
        await repository.findAccreditationsBySystemReference(referenceNumber)
      expect(found).toHaveLength(1)
      expect(found[0].orgId).toBe(orgId)
      expect(found[0].referenceNumber).toBe(referenceNumber)
      expect(found[0].rawSubmissionData).toEqual(submission.rawSubmissionData)
    })

    it('gives the stored accreditation an id that findAccreditationById resolves', async ({
      formSubmissionsRepository
    }) => {
      const repository = formSubmissionsRepository()
      const referenceNumber = generateReferenceNumber()

      await repository.insertAccreditation(
        accreditationSubmission({
          orgId: await repository.allocateOrgId(),
          referenceNumber,
          answers: [anAnswer],
          rawSubmissionData: {}
        })
      )

      const [stored] =
        await repository.findAccreditationsBySystemReference(referenceNumber)
      const byId = await repository.findAccreditationById(stored.id)
      expect(byId.id).toBe(stored.id)
    })
  })
}
