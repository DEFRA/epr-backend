import { ObjectId } from 'mongodb'
import { ORG_ID_START_NUMBER } from '#common/enums/index.js'

/**
 * Mirrors the store's orgId counter: seeded from the organisations already
 * present, then handed out one at a time.
 *
 * @param {{orgId?: number}[]} organisations
 * @returns {number}
 */
const highestOrgId = (organisations) =>
  organisations.reduce(
    (highest, { orgId }) => Math.max(highest, orgId ?? ORG_ID_START_NUMBER),
    ORG_ID_START_NUMBER
  )

/**
 * @param {Object[]} [initialAccreditations=[]]
 * @param {Object[]} [initialRegistrations=[]]
 * @param {Object[]} [initialOrganisations=[]]
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (
  initialAccreditations = [],
  initialRegistrations = [],
  initialOrganisations = []
) => {
  const organisations = structuredClone(initialOrganisations)
  const accreditations = structuredClone(initialAccreditations)
  const registrations = structuredClone(initialRegistrations)

  let orgIdCounter = highestOrgId(organisations)

  return () => ({
    async allocateOrgId() {
      orgIdCounter += 1
      return orgIdCounter
    },
    async insertOrganisation(submission) {
      const id = new ObjectId().toString()
      organisations.push({ ...structuredClone(submission), id })
      return id
    },
    async insertRegistration(submission) {
      registrations.push({
        ...structuredClone(submission),
        id: new ObjectId().toString()
      })
    },
    async insertAccreditation(submission) {
      accreditations.push({
        ...structuredClone(submission),
        id: new ObjectId().toString()
      })
    },
    async findAllAccreditations() {
      return structuredClone(accreditations)
    },
    async findAccreditationsBySystemReference(ref) {
      return structuredClone(accreditations).filter(
        (acc) => acc.referenceNumber.toLowerCase() === ref.toLowerCase()
      )
    },
    async findAccreditationById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return (
        structuredClone(accreditations).find((org) => org.id === id) || null
      )
    },
    async findAllOrganisations() {
      return structuredClone(organisations)
    },
    async findOrganisationById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return structuredClone(organisations).find((org) => org.id === id) || null
    },
    async findAllRegistrations() {
      return structuredClone(registrations)
    },
    async findRegistrationsBySystemReference(ref) {
      return structuredClone(registrations).filter(
        (reg) => reg.referenceNumber.toLowerCase() === ref.toLowerCase()
      )
    },
    async findRegistrationById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return structuredClone(registrations).find((org) => org.id === id) || null
    },
    async findAllFormSubmissionIds() {
      return {
        organisations: new Set(organisations.map((org) => org.id)),
        registrations: new Set(registrations.map((reg) => reg.id)),
        accreditations: new Set(accreditations.map((acc) => acc.id))
      }
    }
  })
}
