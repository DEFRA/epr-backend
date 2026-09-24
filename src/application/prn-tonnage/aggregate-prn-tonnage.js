import Joi from 'joi'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { indexAccreditations } from '#waste-balances/application/accreditation-index.js'

/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { WasteProcessingTypeValue, ReprocessingType } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { AccreditationContext } from '#waste-balances/application/accreditation-index.js' */

/**
 * The registration's own processing-type fields, the same shape
 * `AccreditationContext` takes in `#waste-balances/domain/credited-tonnage.js`.
 * An exporter registration is forbidden a reprocessing type, so it arrives
 * absent.
 *
 * @typedef {Object} RegistrationProcessingTypes
 * @property {WasteProcessingTypeValue} wasteProcessingType
 * @property {ReprocessingType} [reprocessingType]
 */

/**
 * One accreditation's PRN tonnages, as the pipeline groups them by id.
 *
 * @typedef {Object} GroupedRow
 * @property {{ organisationId: string, registrationId: string, accId: string }} _id
 * @property {number} awaitingAuthorisationTonnage
 * @property {number} awaitingAcceptanceTonnage
 * @property {number} awaitingCancellationTonnage
 * @property {number} acceptedTonnage
 * @property {number} cancelledTonnage
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

const PRNS_COLLECTION = 'packaging-recycling-notes'

export const REGISTRATION_TYPE = Object.freeze({
  REPROCESSOR_INPUT: 'REPROCESSOR_INPUT',
  REPROCESSOR_OUTPUT: 'REPROCESSOR_OUTPUT',
  EXPORTER: 'EXPORTER'
})

const ZERO_BALANCES = Object.freeze({
  wasteBalance: 0,
  availableWasteBalance: 0
})

const AWAITING_AUTHORISATION_STATUSES = [PRN_STATUS.AWAITING_AUTHORISATION]
const AWAITING_ACCEPTANCE_STATUSES = [PRN_STATUS.AWAITING_ACCEPTANCE]
const AWAITING_CANCELLATION_STATUSES = [PRN_STATUS.AWAITING_CANCELLATION]
const ACCEPTED_STATUSES = [PRN_STATUS.ACCEPTED]
const CANCELLED_STATUSES = [PRN_STATUS.CANCELLED]
const EXCLUDED_STATUSES = [PRN_STATUS.DELETED, PRN_STATUS.DISCARDED]
const STATUS_FIELD = 'status.currentStatus'
const STATUS_PATH = `$${STATUS_FIELD}`

/** @param {string[]} statuses */
const buildStatusTonnageAccumulator = (statuses) => ({
  $sum: {
    $cond: [{ $in: [STATUS_PATH, statuses] }, '$tonnage', 0]
  }
})

const buildMatchStage = () => ({
  $match: {
    [STATUS_FIELD]: {
      $nin: EXCLUDED_STATUSES
    }
  }
})

/**
 * Keyed on ids alone. A PRN carries the organisation name, accreditation number
 * and material as they stood when it was raised, so keying on those would split
 * one accreditation across rows the ledger — keyed on ids — cannot tell apart,
 * reporting its balance once per row. The names come from the organisations
 * repository instead.
 */
const buildGroupStage = () => ({
  $group: {
    _id: {
      organisationId: '$organisation.id',
      registrationId: '$registrationId',
      accId: '$accreditation.id'
    },
    awaitingAuthorisationTonnage: buildStatusTonnageAccumulator(
      AWAITING_AUTHORISATION_STATUSES
    ),
    awaitingAcceptanceTonnage: buildStatusTonnageAccumulator(
      AWAITING_ACCEPTANCE_STATUSES
    ),
    awaitingCancellationTonnage: buildStatusTonnageAccumulator(
      AWAITING_CANCELLATION_STATUSES
    ),
    acceptedTonnage: buildStatusTonnageAccumulator(ACCEPTED_STATUSES),
    cancelledTonnage: buildStatusTonnageAccumulator(CANCELLED_STATUSES)
  }
})

const buildAggregationPipeline = () => [buildMatchStage(), buildGroupStage()]

/**
 * What a row must carry to be reportable. A row missing its ledger id would be
 * reported as a balance of zero, which a regulator cannot tell apart from an
 * operator holding nothing — so the report fails rather than publishes it.
 */
const aggregatedRowSchema = Joi.object({
  organisationName: Joi.string().required(),
  orgId: Joi.string().required(),
  registrationNumber: Joi.string().required(),
  accreditationNumber: Joi.string().required(),
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
 * The accreditation's context, provided the organisation and registration the
 * PRNs were raised under still hold it. Anything else leaves the row
 * unresolved, and the schema refuses to report it.
 *
 * @param {AccreditationContext | undefined} context
 * @param {{ organisationId: string, registrationId: string }} ids
 * @returns {AccreditationContext | undefined}
 */
const heldBy = (context, { organisationId, registrationId }) =>
  context?.organisation.id === organisationId &&
  context.registration.id === registrationId
    ? context
    : undefined

/**
 * Joins a grouped PRN row to the organisation, registration and accreditation
 * it was raised under.
 *
 * @param {GroupedRow} groupedRow
 * @param {AccreditationContext | undefined} context
 */
const toAggregatedRow = (
  { _id: { organisationId, registrationId, accId }, ...tonnages },
  context
) => {
  const resolved = heldBy(context, { organisationId, registrationId })

  return {
    organisationName: resolved?.organisation.companyDetails.name,
    orgId: resolved && String(resolved.organisation.orgId),
    registrationNumber: resolved?.registration.registrationNumber,
    accreditationNumber: resolved?.accreditation.accreditationNumber,
    material: resolved?.accreditation.material,
    tonnageBand: resolved?.accreditation.prnIssuance?.tonnageBand,
    ledgerId: { organisationId, registrationId, accreditationId: accId },
    registration: {
      wasteProcessingType: resolved?.registration.wasteProcessingType,
      reprocessingType: resolved?.registration.reprocessingType ?? undefined
    },
    ...tonnages
  }
}

/**
 * @param {string} a
 * @param {string} b
 */
const compareStrings = (a, b) => {
  if (a < b) {
    return -1
  }
  return a > b ? 1 : 0
}

/**
 * @param {AggregatedRow} a
 * @param {AggregatedRow} b
 */
const byOrganisationThenAccreditation = (a, b) =>
  compareStrings(a.organisationName, b.organisationName) ||
  compareStrings(a.accreditationNumber, b.accreditationNumber)

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
 * Test organisations' PRNs are left out of the report, as they are from the
 * other accreditation-level reports built on the same index.
 *
 * @param {import('mongodb').Db} db
 * @param {OrganisationsRepository} organisationsRepository
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 */
export const aggregatePrnTonnage = async (
  db,
  organisationsRepository,
  ledgerRepository
) => {
  const [groupedRows, organisations] = await Promise.all([
    db
      .collection(PRNS_COLLECTION)
      .aggregate(buildAggregationPipeline())
      .toArray(),
    organisationsRepository.findAll()
  ])

  const { index, testOrgAccreditationIds } = indexAccreditations(organisations)

  const aggregatedRows = /** @type {GroupedRow[]} */ (groupedRows)
    .filter(({ _id: { accId } }) => !testOrgAccreditationIds.has(accId))
    .map((groupedRow) => {
      const row = toAggregatedRow(groupedRow, index.get(groupedRow._id.accId))
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
