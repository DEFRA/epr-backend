import { vi } from 'vitest'

/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {SystemLogsRepository} from '#repositories/system-logs/port.js' */
/** @import {FormSubmissionsRepository} from '#repositories/form-submissions/port.js' */
/** @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */

/**
 * Builds a fully-typed OrganisationsRepository mock with every method as a
 * vi.fn(). Pass `overrides` to stub specific methods for a test. Use this
 * instead of hand-rolling partial inline mocks so new port methods only need
 * adding in one place.
 *
 * @param {Partial<OrganisationsRepository>} [overrides]
 * @returns {OrganisationsRepository}
 */
export const createMockOrganisationsRepository = (overrides = {}) => ({
  insert: vi.fn(),
  replace: vi.fn(),
  findAll: vi.fn(),
  findAllBySchemaVersion: vi.fn(),
  findPage: vi.fn(),
  findAllForOverseasSitesAdminList: vi.fn(),
  findPageForOverseasSitesAdminList: vi.fn(),
  findByIds: vi.fn(),
  findById: vi.fn(),
  findByLinkedDefraOrgId: vi.fn(),
  findByAccreditationNumber: vi.fn(),
  findAllLinked: vi.fn(),
  findAllLinkableForUser: vi.fn(),
  findRegistrationById: vi.fn(),
  findAccreditationById: vi.fn(),
  findAllIds: vi.fn(),
  findByOrgId: vi.fn(),
  replaceRegistrationOverseasSites: vi.fn(),
  ...overrides
})

/**
 * Builds a fully-typed SummaryLogsRepository mock with every method as a
 * vi.fn(). Pass `overrides` to stub specific methods for a test.
 *
 * @param {Partial<SummaryLogsRepository>} [overrides]
 * @returns {SummaryLogsRepository}
 */
export const createMockSummaryLogsRepository = (overrides = {}) => ({
  insert: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findLatestSubmittedForOrgReg: vi.fn(),
  findAllByOrgReg: vi.fn(),
  findAllSummaryLogStatsByRegistrationId: vi.fn(),
  transitionToSubmittingExclusive: vi.fn(),
  getDownloadUrl: vi.fn(),
  ...overrides
})

/**
 * Builds a fully-typed SystemLogsRepository mock with every method as a
 * vi.fn(). Pass `overrides` to stub specific methods for a test.
 *
 * @param {Partial<SystemLogsRepository>} [overrides]
 * @returns {SystemLogsRepository}
 */
export const createMockSystemLogsRepository = (overrides = {}) => ({
  insert: vi.fn(),
  insertMany: vi.fn(),
  find: vi.fn(),
  findSummaryLogSubmitActors: vi.fn(),
  ...overrides
})

/**
 * Builds a fully-typed FormSubmissionsRepository mock with every method as a
 * vi.fn(). Pass `overrides` to stub specific methods for a test.
 *
 * @param {Partial<FormSubmissionsRepository>} [overrides]
 * @returns {FormSubmissionsRepository}
 */
export const createMockFormSubmissionsRepository = (overrides = {}) => ({
  findAllAccreditations: vi.fn(),
  findAccreditationById: vi.fn(),
  findAccreditationsBySystemReference: vi.fn(),
  findAllRegistrations: vi.fn(),
  findRegistrationById: vi.fn(),
  findRegistrationsBySystemReference: vi.fn(),
  findAllOrganisations: vi.fn(),
  findOrganisationById: vi.fn(),
  findAllFormSubmissionIds: vi.fn(),
  ...overrides
})

/**
 * Builds a fully-typed PackagingRecyclingNotesRepository mock with every
 * method as a vi.fn(). Pass `overrides` to stub specific methods for a test.
 *
 * @param {Partial<PackagingRecyclingNotesRepository>} [overrides]
 * @returns {PackagingRecyclingNotesRepository}
 */
export const createMockPackagingRecyclingNotesRepository = (
  overrides = {}
) => ({
  findById: vi.fn(),
  findByPrnNumber: vi.fn(),
  create: vi.fn(),
  findByAccreditation: vi.fn(),
  findByStatus: vi.fn(),
  updateStatus: vi.fn(),
  persistProjection: vi.fn(),
  rollbackIssuance: vi.fn(),
  rollbackPendingCancellation: vi.fn(),
  rollbackIssuedCancellation: vi.fn(),
  ...overrides
})

/**
 * Builds a fully-typed OverseasSitesRepository mock with every method as a
 * vi.fn(). Pass `overrides` to stub specific methods for a test.
 *
 * @param {Partial<OverseasSitesRepository>} [overrides]
 * @returns {OverseasSitesRepository}
 */
export const createMockOverseasSitesRepository = (overrides = {}) => ({
  findById: vi.fn(),
  findByProperties: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  findAll: vi.fn(),
  findByIds: vi.fn(),
  ...overrides
})
