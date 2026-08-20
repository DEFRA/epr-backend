import { SCOPES } from '#common/helpers/auth/constants.js'

/**
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { FindParams, OrganisationsRepository } from '#repositories/organisations/port.js'
 */

/**
 * What every reader of the organisations list sees: the columns the regulator
 * organisations page renders, plus the document id its link needs.
 *
 * @typedef {{
 *   id: string,
 *   orgId: number,
 *   companyDetails: { name: string },
 *   status: string,
 *   submittedToRegulator: string
 * }} OrganisationListItem
 */

/**
 * What the back office adds on top: the numbers behind the Reg/Acc column, one
 * line per registration and one per accreditation no registration references.
 *
 * @typedef {OrganisationListItem & {
 *   registrations: Array<{ registrationNumber?: string | null, accreditationId?: string }>,
 *   accreditations: Array<{ id: string, accreditationNumber?: string | null }>
 * }} AdminOrganisationListItem
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
const toListItem = ({
  id,
  orgId,
  companyDetails,
  status,
  submittedToRegulator
}) => ({
  id,
  orgId,
  companyDetails: { name: companyDetails.name },
  status,
  submittedToRegulator
})

/**
 * @param {Organisation} organisation
 * @returns {AdminOrganisationListItem}
 */
const toAdminListItem = (organisation) => ({
  ...toListItem(organisation),
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
 * Reads the organisations list at the width the caller's scopes earn.
 *
 * An organisation document carries personal data about two sets of people —
 * the operator's staff in `users` and `submitterContactDetails`, and our own
 * staff in `linkedDefraOrganisation.linkedBy` and `statusHistory[].updatedBy`.
 * A list of every operator is the wrong place to hand either set out, so this
 * view builds each item field by field instead of narrowing a whole document.
 * A field arrives in a response because someone named it here.
 *
 * The two shapes differ by what each page renders, not by what each caller is
 * entitled to: the extra fields are registration and accreditation numbers,
 * which the public register already publishes. `admin.read` selects the wider
 * shape because it marks the back-office table, the one page with a column for
 * them. A caller holding no scopes reads the narrow shape, so a new caller
 * starts narrow.
 *
 * @param {{ organisationsRepository: OrganisationsRepository, scopes: string[] }} params
 * @returns {OrganisationsListView}
 */
export const createOrganisationsListView = ({
  organisationsRepository,
  scopes
}) => {
  const toItem = scopes.includes(SCOPES.adminRead)
    ? toAdminListItem
    : toListItem

  return {
    findAll: async () => (await organisationsRepository.findAll()).map(toItem),
    find: async (params) => {
      const { items, ...envelope } = await organisationsRepository.find(params)
      return { ...envelope, items: items.map(toItem) }
    }
  }
}
