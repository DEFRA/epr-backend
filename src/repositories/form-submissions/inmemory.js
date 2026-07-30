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
 * One collection of submissions, cloned on the way in and on the way out so a
 * caller cannot reach the stored documents.
 *
 * @param {Object[]} initialItems
 */
const collectionOf = (initialItems) => {
  const items = structuredClone(initialItems)

  return {
    insert(submission) {
      const id = new ObjectId().toString()
      items.push({ ...structuredClone(submission), id })
      return id
    },
    findAll: () => structuredClone(items),
    findById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return structuredClone(items).find((item) => item.id === id) || null
    },
    findBySystemReference: (ref) =>
      structuredClone(items).filter(
        (item) => item.referenceNumber.toLowerCase() === ref.toLowerCase()
      ),
    ids: () => new Set(items.map((item) => item.id))
  }
}

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
  const organisations = collectionOf(initialOrganisations)
  const accreditations = collectionOf(initialAccreditations)
  const registrations = collectionOf(initialRegistrations)

  let orgIdCounter = highestOrgId(initialOrganisations)

  return () => ({
    async allocateOrgId() {
      orgIdCounter += 1
      return orgIdCounter
    },
    async insertOrganisation(submission) {
      return organisations.insert(submission)
    },
    async insertRegistration(submission) {
      registrations.insert(submission)
    },
    async insertAccreditation(submission) {
      accreditations.insert(submission)
    },
    findAllAccreditations: async () => accreditations.findAll(),
    findAccreditationsBySystemReference: async (ref) =>
      accreditations.findBySystemReference(ref),
    findAccreditationById: async (id) => accreditations.findById(id),
    findAllOrganisations: async () => organisations.findAll(),
    findOrganisationById: async (id) => organisations.findById(id),
    findAllRegistrations: async () => registrations.findAll(),
    findRegistrationsBySystemReference: async (ref) =>
      registrations.findBySystemReference(ref),
    findRegistrationById: async (id) => registrations.findById(id),
    findAllFormSubmissionIds: async () => ({
      organisations: organisations.ids(),
      registrations: registrations.ids(),
      accreditations: accreditations.ids()
    })
  })
}
