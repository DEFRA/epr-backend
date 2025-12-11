import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { STATUS } from '#domain/organisations/model.js'

export async function buildApprovedOrg(organisationsRepository, overrides) {
  const org = buildOrganisation(overrides)

  const INITIAL_VERSION = 1

  await organisationsRepository.insert(org)

  const now = new Date()
  const oneYearFromNow = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate()
  )

  // Only approve the first accreditation (which is already linked to the first registration)
  const approvedAccreditations = [
    {
      ...org.accreditations[0],
      status: STATUS.APPROVED,
      accreditationNumber: org.accreditations[0].accreditationNumber || 'ACC1',
      validFrom: now,
      validTo: oneYearFromNow
    }
  ]

  const approvedRegistrations = [
    Object.assign({}, org.registrations[0], {
      status: STATUS.APPROVED,
      cbduNumber: org.registrations[0].cbduNumber || 'CBDU123456',
      registrationNumber: 'REG1',
      validFrom: now,
      validTo: oneYearFromNow
    })
  ]

  await organisationsRepository.update(org.id, INITIAL_VERSION, {
    status: STATUS.APPROVED,
    accreditations: approvedAccreditations,
    registrations: approvedRegistrations
  })

  // TODO: For some reason, without this request tests fail
  const updatedOrg = await organisationsRepository.findById(
    org.id,
    INITIAL_VERSION + 1
  )

  return updatedOrg
}
