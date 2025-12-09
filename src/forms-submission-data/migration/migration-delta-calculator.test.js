import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { getSubmissionsToMigrate } from './migration-delta-calculator.js'

describe('getSubmissionsToMigrate', () => {
  let formsSubmissionRepository
  let organisationsRepository

  const org1Id = new ObjectId()
  const org2Id = new ObjectId()
  const reg1Id = new ObjectId()
  const reg2Id = new ObjectId()
  const accr1Id = new ObjectId()
  const accr2Id = new ObjectId()

  beforeEach(() => {
    formsSubmissionRepository = {
      findAllFormSubmissionIds: vi.fn()
    }
    organisationsRepository = {
      findAllIds: vi.fn()
    }
    vi.clearAllMocks()
  })

  it('should return all submissions when nothing is migrated yet', async () => {
    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set(),
      registrations: new Set(),
      accreditations: new Set()
    })
    formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
      organisations: new Set([org1Id.toString(), org2Id.toString()]),
      registrations: new Set([reg1Id.toString(), reg2Id.toString()]),
      accreditations: new Set([accr1Id.toString()])
    })

    const result = await getSubmissionsToMigrate(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.migrated.organisations.size).toBe(0)
    expect(result.migrated.registrations.size).toBe(0)
    expect(result.migrated.accreditations.size).toBe(0)
    expect(result.migrated.totalCount).toBe(0)
    expect(result.pendingMigration.organisations.size).toBe(2)
    expect(result.pendingMigration.registrations.size).toBe(2)
    expect(result.pendingMigration.accreditations.size).toBe(1)
    expect(result.pendingMigration.totalCount).toBe(5)
  })

  it('should return only unmigrated submissions for incremental migration', async () => {
    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set([org1Id.toString()]),
      registrations: new Set([reg1Id.toString()]),
      accreditations: new Set([accr2Id.toString()])
    })
    formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
      organisations: new Set([org1Id.toString(), org2Id.toString()]),
      registrations: new Set([reg1Id.toString(), reg2Id.toString()]),
      accreditations: new Set([accr1Id.toString(), accr2Id.toString()])
    })

    const result = await getSubmissionsToMigrate(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.migrated.organisations.size).toBe(1)
    expect(result.migrated.registrations.size).toBe(1)
    expect(result.migrated.accreditations.size).toBe(1)
    expect(result.migrated.totalCount).toBe(3)
    expect(result.pendingMigration.organisations).toEqual(
      new Set([org2Id.toString()])
    )
    expect(result.pendingMigration.registrations).toEqual(
      new Set([reg2Id.toString()])
    )
    expect(result.pendingMigration.accreditations).toEqual(
      new Set([accr1Id.toString()])
    )
    expect(result.pendingMigration.totalCount).toBe(3)
  })

  it('should return empty sets when all submissions are already migrated', async () => {
    const org1IdStr = org1Id.toString()
    const reg1IdStr = reg1Id.toString()
    const accr1IdStr = accr1Id.toString()

    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set([org1IdStr]),
      registrations: new Set([reg1IdStr]),
      accreditations: new Set([accr1IdStr])
    })
    formsSubmissionRepository.findAllFormSubmissionIds.mockResolvedValue({
      organisations: new Set([org1IdStr]),
      registrations: new Set([reg1IdStr]),
      accreditations: new Set([accr1IdStr])
    })

    const result = await getSubmissionsToMigrate(
      formsSubmissionRepository,
      organisationsRepository
    )

    expect(result.migrated.totalCount).toBe(3)
    expect(result.pendingMigration.organisations.size).toBe(0)
    expect(result.pendingMigration.registrations.size).toBe(0)
    expect(result.pendingMigration.accreditations.size).toBe(0)
    expect(result.pendingMigration.totalCount).toBe(0)
  })
})
