import { beforeEach, describe, expect, it as base } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import {
  buildOrganisation,
  buildRegistration,
  prepareOrgUpdate
} from './contract/test-data.js'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const factory = createInMemoryOrganisationsRepository([])
    await use(factory)
  }
})

describe('In-memory organisations repository', () => {
  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(it)
  })

  describe('findByOrgId', () => {
    let repository

    beforeEach(() => {
      const factory = createInMemoryOrganisationsRepository([])
      repository = factory()
    })

    it('returns organisation matching the business orgId', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      const found = await repository.findByOrgId(organisation.orgId)

      expect(found).toBeDefined()
      expect(found.id).toBe(organisation.id)
      expect(found.orgId).toBe(organisation.orgId)
    })

    it('returns null when no organisation matches', async () => {
      const found = await repository.findByOrgId(999999)
      expect(found).toBeNull()
    })
  })

  describe('mergeRegistrationOverseasSites', () => {
    let repository

    beforeEach(() => {
      const factory = createInMemoryOrganisationsRepository([])
      repository = factory()
    })

    it('merges new entries into registration overseasSites', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            overseasSites: {}
          })
        ]
      })
      await repository.insert(organisation)

      const regId = organisation.registrations[0].id
      const entries = {
        '001': { overseasSiteId: 'site-aaa' },
        '002': { overseasSiteId: 'site-bbb' }
      }

      const success = await repository.mergeRegistrationOverseasSites(
        organisation.id,
        1,
        regId,
        entries
      )

      expect(success).toBe(true)

      const updated = await repository.findById(organisation.id, 2)
      const reg = updated.registrations.find((r) => r.id === regId)
      expect(reg.overseasSites['001']).toEqual({ overseasSiteId: 'site-aaa' })
      expect(reg.overseasSites['002']).toEqual({ overseasSiteId: 'site-bbb' })
    })

    it('preserves existing entries when merging', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            overseasSites: { '001': { overseasSiteId: 'existing-site' } }
          })
        ]
      })
      await repository.insert(organisation)

      const regId = organisation.registrations[0].id
      const entries = {
        '002': { overseasSiteId: 'new-site' }
      }

      await repository.mergeRegistrationOverseasSites(
        organisation.id,
        1,
        regId,
        entries
      )

      const updated = await repository.findById(organisation.id, 2)
      const reg = updated.registrations.find((r) => r.id === regId)
      expect(reg.overseasSites['001']).toEqual({
        overseasSiteId: 'existing-site'
      })
      expect(reg.overseasSites['002']).toEqual({ overseasSiteId: 'new-site' })
    })

    it('overwrites existing keys', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            overseasSites: { '001': { overseasSiteId: 'old-site' } }
          })
        ]
      })
      await repository.insert(organisation)

      const regId = organisation.registrations[0].id
      const entries = {
        '001': { overseasSiteId: 'new-site' }
      }

      await repository.mergeRegistrationOverseasSites(
        organisation.id,
        1,
        regId,
        entries
      )

      const updated = await repository.findById(organisation.id, 2)
      const reg = updated.registrations.find((r) => r.id === regId)
      expect(reg.overseasSites['001']).toEqual({ overseasSiteId: 'new-site' })
    })

    it('returns false on version conflict', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            overseasSites: {}
          })
        ]
      })
      await repository.insert(organisation)

      const regId = organisation.registrations[0].id
      const entries = { '001': { overseasSiteId: 'site-aaa' } }

      const success = await repository.mergeRegistrationOverseasSites(
        organisation.id,
        999,
        regId,
        entries
      )

      expect(success).toBe(false)
    })

    it('returns false when organisation not found', async () => {
      const success = await repository.mergeRegistrationOverseasSites(
        'nonexistent-id',
        1,
        'reg-id',
        { '001': { overseasSiteId: 'site-aaa' } }
      )

      expect(success).toBe(false)
    })

    it('returns false when registration not found', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            overseasSites: {}
          })
        ]
      })
      await repository.insert(organisation)

      const success = await repository.mergeRegistrationOverseasSites(
        organisation.id,
        1,
        'nonexistent-reg-id',
        { '001': { overseasSiteId: 'site-aaa' } }
      )

      expect(success).toBe(false)
    })

    it('initialises overseasSites when not present on registration', async () => {
      const organisation = buildOrganisation({
        registrations: [
          buildRegistration({
            wasteProcessingType: 'exporter',
            overseasSites: {}
          })
        ]
      })
      await repository.insert(organisation)

      // Remove overseasSites from internal storage to simulate missing field
      const storage = repository._getStorageForTesting()
      delete storage[0].registrations[0].overseasSites

      const regId = organisation.registrations[0].id
      const entries = { '001': { overseasSiteId: 'site-aaa' } }

      const success = await repository.mergeRegistrationOverseasSites(
        organisation.id,
        1,
        regId,
        entries
      )

      expect(success).toBe(true)

      const updated = await repository.findById(organisation.id, 2)
      const reg = updated.registrations.find((r) => r.id === regId)
      expect(reg.overseasSites['001']).toEqual({ overseasSiteId: 'site-aaa' })
    })
  })

  describe('In-memory specific: status field storage', () => {
    let repository

    beforeEach(() => {
      const factory = createInMemoryOrganisationsRepository([])
      repository = factory()
    })

    it('does not persist status field to storage', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      const orgReplacement = prepareOrgUpdate(organisation, {
        status: ORGANISATION_STATUS.REJECTED,
        registrations: [
          {
            ...organisation.registrations[0],
            status: REG_ACC_STATUS.REJECTED
          }
        ],
        accreditations: [
          {
            ...organisation.accreditations[0],
            status: REG_ACC_STATUS.REJECTED
          }
        ]
      })
      await repository.replace(organisation.id, 1, orgReplacement)

      // Read directly from storage (bypassing repository enrichment)
      const storage = repository._getStorageForTesting()
      const storedOrg = storage.find((o) => o._id === organisation.id)

      expect(storedOrg.status).toBeUndefined()
      expect(storedOrg.registrations[0].status).toBeUndefined()
      expect(storedOrg.accreditations[0].status).toBeUndefined()
    })
  })
})
