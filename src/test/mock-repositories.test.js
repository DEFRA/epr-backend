import { describe, it, expect, vi } from 'vitest'

import {
  createMockOrganisationsRepository,
  createMockSummaryLogsRepository,
  createMockWasteRecordsRepository,
  createMockSystemLogsRepository,
  createMockFormSubmissionsRepository,
  createMockPackagingRecyclingNotesRepository,
  createMockOverseasSitesRepository
} from '#test/mock-repositories.js'

describe('mock-repositories', () => {
  const builders = {
    createMockOrganisationsRepository: {
      build: createMockOrganisationsRepository,
      methods: [
        'insert',
        'replace',
        'findAll',
        'findAllBySchemaVersion',
        'findPage',
        'findAllForOverseasSitesAdminList',
        'findPageForOverseasSitesAdminList',
        'findByIds',
        'findById',
        'findByLinkedDefraOrgId',
        'findAllLinked',
        'findAllLinkableForUser',
        'findRegistrationById',
        'findAccreditationById',
        'findAllIds',
        'findByOrgId',
        'replaceRegistrationOverseasSites'
      ]
    },
    createMockSummaryLogsRepository: {
      build: createMockSummaryLogsRepository,
      methods: [
        'insert',
        'update',
        'findById',
        'findLatestSubmittedForOrgReg',
        'findAllByOrgReg',
        'findAllSummaryLogStatsByRegistrationId',
        'transitionToSubmittingExclusive',
        'getDownloadUrl'
      ]
    },
    createMockWasteRecordsRepository: {
      build: createMockWasteRecordsRepository,
      methods: ['findByRegistration', 'appendVersions', 'findDistinctDataKeys']
    },
    createMockSystemLogsRepository: {
      build: createMockSystemLogsRepository,
      methods: ['insert', 'insertMany', 'find', 'findSummaryLogSubmitActors']
    },
    createMockFormSubmissionsRepository: {
      build: createMockFormSubmissionsRepository,
      methods: [
        'findAllAccreditations',
        'findAccreditationById',
        'findAccreditationsBySystemReference',
        'findAllRegistrations',
        'findRegistrationById',
        'findRegistrationsBySystemReference',
        'findAllOrganisations',
        'findOrganisationById',
        'findAllFormSubmissionIds'
      ]
    },
    createMockPackagingRecyclingNotesRepository: {
      build: createMockPackagingRecyclingNotesRepository,
      methods: [
        'findById',
        'findByPrnNumber',
        'create',
        'findByAccreditation',
        'findByStatus',
        'updateStatus',
        'persistProjection',
        'rollbackIssuance',
        'rollbackPendingCancellation',
        'rollbackIssuedCancellation'
      ]
    },
    createMockOverseasSitesRepository: {
      build: createMockOverseasSitesRepository,
      methods: [
        'findById',
        'findByProperties',
        'create',
        'update',
        'remove',
        'findAll',
        'findByIds'
      ]
    }
  }

  describe.each(Object.entries(builders))('%s', (_name, { build, methods }) => {
    it('should expose every port method as a vi mock', () => {
      const repository = build()

      expect(Object.keys(repository).sort()).toEqual([...methods].sort())
      for (const method of methods) {
        expect(vi.isMockFunction(repository[method])).toBe(true)
      }
    })

    it('should apply overrides over the default mocks', () => {
      const stub = vi.fn()
      const [firstMethod] = methods

      const repository = build({ [firstMethod]: stub })

      expect(repository[firstMethod]).toBe(stub)
    })
  })
})
