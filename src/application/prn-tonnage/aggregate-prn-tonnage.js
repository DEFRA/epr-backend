import Joi from 'joi'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { requireStoredNumbers } from '#domain/organisations/numbers.js'
import {
  accreditationKey,
  indexReadModelAccreditations
} from '#waste-balances/application/accreditation-index.js'

/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { WasteProcessingTypeValue, ReprocessingType } from '#domain/organisations/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { AccreditationTonnage, PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */
/** @import { AccreditationReadModelContext } from '#waste-balances/application/accreditation-index.js' */

/**
 * The registration's own processing-type fields. An exporter registration has
 * no reprocessing type, so it arrives absent.
 *
 * @typedef {Object} RegistrationProcessingTypes
 * @property {WasteProcessingTypeValue} wasteProcessingType
 * @property {ReprocessingType} [reprocessingType]
 */

/**
 * A row resolved all the way down the hierarchy, ready to be reported.
 *
 * @typedef {Object} AggregatedRow
 * @property {string} organisationName
 * @property {string} orgId
 * @property {string} registrationNumber
 * @property {string} accreditationNumber
 * @property {string} material
 * @property {string} tonnageBand
 * @property {WasteBalanceLedgerId} ledgerId
 * @property {RegistrationProcessingTypes} registration
 * @property {number} awaitingAuthorisationTonnage
 * @property {number} awaitingAcceptanceTonnage
 * @property {number} awaitingCancellationTonnage
 * @property {number} acceptedTonnage
 * @property {number} cancelledTonnage
 */

export const REGISTRATION_TYPE = Object.freeze({
  REPROCESSOR_INPUT: 'REPROCESSOR_INPUT',
  REPROCESSOR_OUTPUT: 'REPROCESSOR_OUTPUT',
  EXPORTER: 'EXPORTER'
})

const ZERO_BALANCES = Object.freeze({
  wasteBalance: 0,
  availableWasteBalance: 0
})

/**
 * Deleted and discarded PRNs never counted towards anything, so they are left
 * out of the totals. Drafts are totalled but reported in no column, so an
 * accreditation with only drafts still gets a row of zeros.
 */
const EXCLUDED_STATUSES = [PRN_STATUS.DELETED, PRN_STATUS.DISCARDED]

/**
 * The report's tonnage columns, each fed by one current PRN status.
 */
const TONNAGE_COLUMNS = Object.freeze({
  awaitingAuthorisationTonnage: PRN_STATUS.AWAITING_AUTHORISATION,
  awaitingAcceptanceTonnage: PRN_STATUS.AWAITING_ACCEPTANCE,
  awaitingCancellationTonnage: PRN_STATUS.AWAITING_CANCELLATION,
  acceptedTonnage: PRN_STATUS.ACCEPTED,
  cancelledTonnage: PRN_STATUS.CANCELLED
})

/**
 * @param {AccreditationTonnage['tonnageByStatus']} tonnageByStatus
 */
const toTonnageColumns = (tonnageByStatus) =>
  Object.fromEntries(
    Object.entries(TONNAGE_COLUMNS).map(([column, status]) => [
      column,
      tonnageByStatus[status] ?? 0
    ])
  )

/**
 * What a row must carry to be reportable. A row missing its ledger id would be
 * reported as a balance of zero, which a regulator cannot tell apart from an
 * operator holding nothing — so the report fails rather than publishes it.
 */
const aggregatedRowSchema = Joi.object({
  organisationName: Joi.string().required(),
  orgId: Joi.string().required(),
  registrationNumber: Joi.string().required(),
  accreditationNumber: Joi.string().allow('').required(),
  material: Joi.string().required(),
  tonnageBand: Joi.string().required(),
  ledgerId: Joi.object({
    organisationId: Joi.string().required(),
    registrationId: Joi.string().required(),
    accreditationId: Joi.string().required()
  }).required(),
  registration: Joi.object({
    wasteProcessingType: Joi.string()
      .valid(...Object.values(WASTE_PROCESSING_TYPE))
      .required(),
    reprocessingType: Joi.string()
      .valid(...Object.values(REPROCESSING_TYPE))
      .when('wasteProcessingType', {
        is: WASTE_PROCESSING_TYPE.REPROCESSOR,
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
  }).required(),
  awaitingAuthorisationTonnage: Joi.number().required(),
  awaitingAcceptanceTonnage: Joi.number().required(),
  awaitingCancellationTonnage: Joi.number().required(),
  acceptedTonnage: Joi.number().required(),
  cancelledTonnage: Joi.number().required()
})

/**
 * The read model records a glass registration's recycling process as its
 * material, where the report names the material it applied for: glass.
 *
 * @param {string} material
 */
const reportedMaterial = (material) =>
  Object.values(GLASS_RECYCLING_PROCESS).includes(/** @type {any} */ (material))
    ? MATERIAL.GLASS
    : material

/**
 * Joins an accreditation's PRN totals to the organisation, registration and
 * accreditation they were raised under. Left unresolved where the read model
 * holds none, and the schema refuses to report it.
 *
 * @param {AccreditationTonnage} accreditationTonnage
 * @param {AccreditationReadModelContext | undefined} context
 */
const toAggregatedRow = ({ id, tonnageByStatus }, context) => ({
  organisationName: context?.organisation.name,
  orgId: context?.organisation.organisationNumber,
  registrationNumber: context?.registrationNumber,
  accreditationNumber: context?.accreditation.accreditationNumber,
  material: context && reportedMaterial(context.registration.material),
  tonnageBand: context?.accreditation.prnIssuance.tonnageBand,
  ledgerId: id,
  registration: {
    wasteProcessingType: context?.registration.wasteProcessingType,
    reprocessingType:
      context && 'reprocessingType' in context.registration
        ? context.registration.reprocessingType
        : undefined
  },
  ...toTonnageColumns(tonnageByStatus)
})

/**
 * @param {AggregatedRow} a
 * @param {AggregatedRow} b
 */
const byOrganisationThenAccreditation = (a, b) =>
  a.organisationName.localeCompare(b.organisationName) ||
  a.accreditationNumber.localeCompare(b.accreditationNumber)

/**
 * Mirrors `processingTypeFor`
 * (`#waste-balances/domain/credited-tonnage.js`): an exporter registration is
 * an exporter, and a reprocessor registration is typed by the reprocessing type
 * an approved registration is required to carry.
 *
 * @param {RegistrationProcessingTypes} registration
 */
const registrationTypeFor = ({ wasteProcessingType, reprocessingType }) => {
  if (wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return REGISTRATION_TYPE.EXPORTER
  }
  if (reprocessingType === REPROCESSING_TYPE.OUTPUT) {
    return REGISTRATION_TYPE.REPROCESSOR_OUTPUT
  }
  return REGISTRATION_TYPE.REPROCESSOR_INPUT
}

/**
 * The accreditation's balances, read from the head of its ledger. An
 * accreditation whose ledger has no events yet holds nothing.
 *
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {WasteBalanceLedgerId} ledgerId
 */
const balancesFor = async (ledgerRepository, ledgerId) => {
  const latest = await ledgerRepository.findLatestInLedger(ledgerId)

  if (latest === null) {
    return ZERO_BALANCES
  }

  return {
    wasteBalance: latest.closingBalance.amount,
    availableWasteBalance: latest.closingBalance.availableAmount
  }
}

/**
 * Reads down the hierarchy — organisation, registration, accreditation — before
 * the figures, so the response carries the report's column order.
 *
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {AggregatedRow} aggregatedRow
 */
const buildReportRow = async (
  ledgerRepository,
  {
    ledgerId,
    registration,
    organisationName,
    orgId,
    registrationNumber,
    accreditationNumber,
    material,
    tonnageBand,
    ...tonnages
  }
) => ({
  organisationName,
  orgId,
  registrationNumber,
  registrationType: registrationTypeFor(registration),
  accreditationNumber,
  material,
  tonnageBand,
  ...(await balancesFor(ledgerRepository, ledgerId)),
  ...tonnages
})

/**
 * Test organisations' PRNs are reported like any other.
 *
 * @param {PackagingRecyclingNotesRepository} prnRepository
 * @param {OrganisationReadRepository} organisationReadRepository
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 */
export const aggregatePrnTonnage = async (
  prnRepository,
  organisationReadRepository,
  ledgerRepository
) => {
  const [accreditationTonnages, organisations] = await Promise.all([
    prnRepository.sumTonnageByAccreditation({
      excludeStatuses: EXCLUDED_STATUSES
    }),
    organisationReadRepository.findAll()
  ])

  const { index } = indexReadModelAccreditations(organisations, {
    includeTestOrganisations: true
  })

  const aggregatedRows = accreditationTonnages
    .map((accreditationTonnage) => {
      const { id, numbers } = accreditationTonnage
      const { organisationNumber, registrationNumber, accreditationNumber } =
        requireStoredNumbers(
          numbers,
          `PRNs of accreditation ${id.accreditationId}`
        )
      const row = toAggregatedRow(
        accreditationTonnage,
        // A registered-only registration holds no PRNs, so a null number
        // names no accreditation and finds nothing
        index.get(
          accreditationKey({
            organisationNumber,
            registrationNumber,
            accreditationNumber: /** @type {AccreditationNumber} */ (
              accreditationNumber
            )
          })
        )
      )
      return /** @type {AggregatedRow} */ (
        Joi.attempt(
          row,
          aggregatedRowSchema,
          `Unreportable PRN tonnage row for accreditation ${row.ledgerId.accreditationId}:`
        )
      )
    })
    .sort(byOrganisationThenAccreditation)

  const rows = await Promise.all(
    aggregatedRows.map((row) => buildReportRow(ledgerRepository, row))
  )

  return {
    generatedAt: new Date().toISOString(),
    rows
  }
}
