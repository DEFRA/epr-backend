import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildRegistration,
  buildAccreditation
} from '#repositories/organisations/contract/test-data.js'

import { runOrganisationValidationSweep } from './run-organisation-validation-sweep.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

const seedRepositoryWith = (organisations) => {
  vi.mocked(createOrganisationsRepository).mockResolvedValue(
    createInMemoryOrganisationsRepository(organisations)
  )
}

describe('runOrganisationValidationSweep', () => {
  let mockServer
  let mockLock

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: {},
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }
  })

  it('acquires a lock scoped to the sweep and releases it afterwards', async () => {
    seedRepositoryWith([])

    await runOrganisationValidationSweep(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'organisation-validation-sweep'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips the sweep when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runOrganisationValidationSweep(mockServer)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping organisation validation sweep'
    })
  })

  it('emits no issue lines and a zero-flagged summary for conforming organisations', async () => {
    const org = buildOrganisation({
      registrations: [buildRegistration({ accreditationId: undefined })],
      accreditations: []
    })
    seedRepositoryWith([org])

    await runOrganisationValidationSweep(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Organisation validation sweep: scanned=1 flagged=0 issues=0'
    })
  })

  it('logs an issue line at info with the org, code, severity and target for a non-conforming organisation', async () => {
    const org = buildOrganisation({
      registrations: [buildRegistration({ accreditationId: 'acc-missing' })],
      accreditations: []
    })
    seedRepositoryWith([org])

    await runOrganisationValidationSweep(mockServer)

    const [registration] = org.registrations
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: `Organisation validation issue: organisationId=${org.id} code=DANGLING_ACCREDITATION_REF severity=error targetType=registration targetId=${registration.id} message="Registration ${registration.id} references accreditation acc-missing, which does not exist on the organisation"`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Organisation validation sweep: scanned=1 flagged=1 issues=1'
    })
  })

  it('logs a warning-severity issue at info, regardless of its severity classification', async () => {
    const org = buildOrganisation({
      registrations: [buildRegistration({ accreditationId: undefined })],
      accreditations: [buildAccreditation({ id: 'acc-orphan' })]
    })
    seedRepositoryWith([org])

    await runOrganisationValidationSweep(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: `Organisation validation issue: organisationId=${org.id} code=ORPHAN_ACCREDITATION severity=warning targetType=accreditation targetId=acc-orphan message="Accreditation acc-orphan is not referenced by any registration"`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Organisation validation sweep: scanned=1 flagged=1 issues=1'
    })
  })

  it('logs every issue and accumulates the count when one organisation has several', async () => {
    const org = buildOrganisation({
      registrations: [buildRegistration({ accreditationId: 'acc-missing' })],
      accreditations: [buildAccreditation({ id: 'acc-orphan' })]
    })
    seedRepositoryWith([org])

    await runOrganisationValidationSweep(mockServer)

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'code=DANGLING_ACCREDITATION_REF severity=error'
      )
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'code=ORPHAN_ACCREDITATION severity=warning'
      )
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Organisation validation sweep: scanned=1 flagged=1 issues=2'
    })
  })

  it('counts orgs and issues across a mixed population', async () => {
    const conforming = buildOrganisation({
      registrations: [buildRegistration({ accreditationId: undefined })],
      accreditations: []
    })
    const nonConforming = buildOrganisation({
      registrations: [buildRegistration({ accreditationId: 'acc-missing' })],
      accreditations: []
    })
    seedRepositoryWith([conforming, nonConforming])

    await runOrganisationValidationSweep(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Organisation validation sweep: scanned=2 flagged=1 issues=1'
    })
  })

  it('releases the lock and logs an error when building the repository throws', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runOrganisationValidationSweep(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run organisation validation sweep'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runOrganisationValidationSweep(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run organisation validation sweep'
    })
  })
})
