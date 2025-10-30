import { randomUUID } from 'node:crypto'
import { ORG_ID_START_NUMBER } from '#common/enums/index.js'
import {
  validateAccreditation,
  validateRegistration,
  validateOrganisation
} from './validation.js'

/**
 * @returns {import('./port.js').ApplicationsRepositoryFactory}
 */
export const createInMemoryApplicationsRepository = () => {
  const accreditations = new Map()
  const registrations = new Map()
  const organisations = new Map()

  return (logger) => ({
    async insertAccreditation(data) {
      const validated = validateAccreditation(data)
      const key = `${validated.orgId}-${validated.referenceNumber}`
      accreditations.set(key, structuredClone(validated))
    },

    async insertRegistration(data) {
      const validated = validateRegistration(data)
      const key = `${validated.orgId}-${validated.referenceNumber}`
      registrations.set(key, structuredClone(validated))
    },

    async insertOrganisation(data) {
      const validated = validateOrganisation(data)

      const count = Array.from(organisations.values()).filter(
        (org) => org.orgId >= ORG_ID_START_NUMBER
      ).length

      const orgId = ORG_ID_START_NUMBER + count + 1
      const referenceNumber = randomUUID()

      organisations.set(referenceNumber, {
        ...structuredClone(validated),
        orgId
      })

      return { orgId, referenceNumber }
    }
  })
}
