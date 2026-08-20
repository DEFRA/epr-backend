/**
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { FindParams, OrganisationsRepository } from '#repositories/organisations/port.js'
 */

/**
 * One organisation on the list route.
 *
 * The identity fields name the organisation and address its record. The
 * registration and accreditation lines carry the numbers the public register
 * already publishes, and the id that pairs a registration with its
 * accreditation.
 *
 * @typedef {{
 *   id: string,
 *   orgId: number,
 *   companyDetails: { name: string },
 *   status: string,
 *   submittedToRegulator: string,
 *   registrations: Array<{ registrationNumber?: string | null, accreditationId?: string }>,
 *   accreditations: Array<{ id: string, accreditationNumber?: string | null }>
 * }} OrganisationListItem
 */

/**
 * @typedef {{
 *   items: OrganisationListItem[],
 *   page: number,
 *   pageSize: number,
 *   totalItems: number,
 *   totalPages: number
 * }} OrganisationListPage
 */

/**
 * @typedef {{
 *   findAll: () => Promise<OrganisationListItem[]>,
 *   find: (params: FindParams) => Promise<OrganisationListPage>
 * }} OrganisationsListView
 */

/**
 * @param {Organisation} organisation
 * @returns {OrganisationListItem}
 */
const toListItem = (organisation) => ({
  id: organisation.id,
  orgId: organisation.orgId,
  companyDetails: { name: organisation.companyDetails.name },
  status: organisation.status,
  submittedToRegulator: organisation.submittedToRegulator,
  registrations: organisation.registrations.map(
    ({ registrationNumber, accreditationId }) => ({
      registrationNumber,
      accreditationId
    })
  ),
  accreditations: organisation.accreditations.map(
    ({ id, accreditationNumber }) => ({ id, accreditationNumber })
  )
})

/**
 * Reads the organisations list.
 *
 * An organisation document carries personal data about two sets of people —
 * the operator's staff in `users` and `submitterContactDetails`, and our own
 * staff in `linkedDefraOrganisation.linkedBy` and `statusHistory[].updatedBy`.
 * ADR 45 assigns that data to `service-data.read`, which the regulator bundle
 * does not hold, and a list of every operator is the wrong place to hand it
 * out in any case.
 *
 * So this view builds each item field by field instead of narrowing a whole
 * document. A field arrives in a response because someone named it above, and
 * a field added to the organisation model reaches nobody until someone does.
 *
 * Every caller reads the same item. The fields here are the organisation's
 * identity and the numbers the public register publishes, so no caller has
 * grounds to see less and none needs to see more.
 *
 * @param {{ organisationsRepository: OrganisationsRepository }} params
 * @returns {OrganisationsListView}
 */
export const createOrganisationsListView = ({ organisationsRepository }) => ({
  findAll: async () =>
    (await organisationsRepository.findAll()).map(toListItem),
  find: async (params) => {
    const { items, ...envelope } = await organisationsRepository.find(params)
    return { ...envelope, items: items.map(toListItem) }
  }
})
