import Joi from 'joi'
import chunk from 'lodash.chunk'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { WasteProcessingTypeValue, ReprocessingType } from '#domain/organisations/model.js' */

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
 * A row the pipeline resolved all the way down the hierarchy, ready to be
 * reported.
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
const ORGANISATIONS_COLLECTION = 'epr-organisations'

export const REGISTRATION_TYPE = Object.freeze({
  REPROCESSOR_INPUT: 'REPROCESSOR_INPUT',
  REPROCESSOR_OUTPUT: 'REPROCESSOR_OUTPUT',
  EXPORTER: 'EXPORTER'
})

/**
 * How many ledger reads the report holds in flight at once. Every report row
 * needs its own ledger read, and a whole report's worth of them released
 * together would check out the MongoDB driver's connection pool and queue
 * every other request on the pod behind it.
 */
export const LEDGER_READ_CONCURRENCY = 10

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
const GROUPED_ORGANISATION_ID = '$_id.organisationId'
const GROUPED_REGISTRATION_ID = '$_id.registrationId'
const GROUPED_ACCREDITATION_ID = '$_id.accId'

/** @param {string} field */
const fromOrganisation = (field) => ({ $first: `$orgLookup.${field}` })

const buildAccreditedRegistrationStage = () => ({
  $addFields: {
    accreditedRegistration: {
      $first: {
        $filter: {
          input: { $ifNull: ['$registrations', []] },
          as: 'registration',
          cond: { $eq: ['$$registration.id', '$$regId'] }
        }
      }
    }
  }
})

const buildOrganisationLookupStage = () => ({
  $lookup: {
    from: ORGANISATIONS_COLLECTION,
    let: {
      organisationId: { $toObjectId: GROUPED_ORGANISATION_ID },
      regId: GROUPED_REGISTRATION_ID,
      accId: GROUPED_ACCREDITATION_ID
    },
    pipeline: [
      { $match: { $expr: { $eq: ['$_id', '$$organisationId'] } } },
      buildAccreditedRegistrationStage(),
      { $unwind: '$accreditations' },
      {
        $match: {
          $expr: { $eq: ['$accreditations.id', '$$accId'] }
        }
      },
      {
        $project: {
          _id: 0,
          orgId: '$orgId',
          organisationName: '$companyDetails.name',
          accreditationNumber: '$accreditations.accreditationNumber',
          material: '$accreditations.material',
          tonnageBand: '$accreditations.prnIssuance.tonnageBand',
          registrationNumber: '$accreditedRegistration.registrationNumber',
          wasteProcessingType: '$accreditedRegistration.wasteProcessingType',
          reprocessingType: '$accreditedRegistration.reprocessingType'
        }
      }
    ],
    as: 'orgLookup'
  }
})

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
 * reporting its balance once per row. The names come from the organisation
 * lookup instead.
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

const buildAddFieldsStage = () => ({
  $addFields: {
    orgId: { $toString: fromOrganisation('orgId') },
    organisationName: fromOrganisation('organisationName'),
    registrationNumber: fromOrganisation('registrationNumber'),
    accreditationNumber: fromOrganisation('accreditationNumber'),
    material: fromOrganisation('material'),
    tonnageBand: fromOrganisation('tonnageBand'),
    ledgerId: {
      organisationId: GROUPED_ORGANISATION_ID,
      registrationId: GROUPED_REGISTRATION_ID,
      accreditationId: GROUPED_ACCREDITATION_ID
    },
    registration: {
      wasteProcessingType: fromOrganisation('wasteProcessingType'),
      reprocessingType: fromOrganisation('reprocessingType')
    }
  }
})

const buildProjectStage = () => ({
  $project: {
    _id: 0,
    organisationName: 1,
    orgId: 1,
    registrationNumber: 1,
    accreditationNumber: 1,
    material: 1,
    tonnageBand: 1,
    awaitingAuthorisationTonnage: 1,
    awaitingAcceptanceTonnage: 1,
    awaitingCancellationTonnage: 1,
    acceptedTonnage: 1,
    cancelledTonnage: 1,
    ledgerId: 1,
    registration: 1
  }
})

const buildSortStage = () => ({
  $sort: {
    organisationName: 1,
    accreditationNumber: 1
  }
})

const buildAggregationPipeline = () => [
  buildMatchStage(),
  buildGroupStage(),
  buildOrganisationLookupStage(),
  buildAddFieldsStage(),
  buildProjectStage(),
  buildSortStage()
]

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
 * Resolves the rows a batch at a time, so the report never has more than
 * `LEDGER_READ_CONCURRENCY` ledger reads outstanding however many
 * accreditations it covers.
 *
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {AggregatedRow[]} aggregatedRows
 */
const buildReportRows = async (ledgerRepository, aggregatedRows) => {
  const rows = []

  for (const batch of chunk(aggregatedRows, LEDGER_READ_CONCURRENCY)) {
    rows.push(
      ...(await Promise.all(
        batch.map((row) => buildReportRow(ledgerRepository, row))
      ))
    )
  }

  return rows
}

/**
 * @param {import('mongodb').Db} db
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 */
export const aggregatePrnTonnage = async (db, ledgerRepository) => {
  const pipeline = buildAggregationPipeline()

  const aggregatedRows = await db
    .collection(PRNS_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const rows = await buildReportRows(
    ledgerRepository,
    aggregatedRows.map((row) =>
      Joi.attempt(
        row,
        aggregatedRowSchema,
        `Unreportable PRN tonnage row for accreditation ${row.ledgerId.accreditationId}:`
      )
    )
  )

  return {
    generatedAt: new Date().toISOString(),
    rows
  }
}
