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

const PRNS_COLLECTION = 'packaging-recycling-notes'
const ORGANISATIONS_COLLECTION = 'epr-organisations'

/**
 * The kind of balance a report row is showing. The three are not comparable
 * figures — reprocessor input and exporter balances measure waste taken in,
 * reprocessor output measures recyclate produced — so a row carries its type
 * alongside its balance.
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

const AWAITING_AUTHORISATION_STATUSES = [PRN_STATUS.AWAITING_AUTHORISATION]
const AWAITING_ACCEPTANCE_STATUSES = [PRN_STATUS.AWAITING_ACCEPTANCE]
const AWAITING_CANCELLATION_STATUSES = [PRN_STATUS.AWAITING_CANCELLATION]
const ACCEPTED_STATUSES = [PRN_STATUS.ACCEPTED]
const CANCELLED_STATUSES = [PRN_STATUS.CANCELLED]
const EXCLUDED_STATUSES = [PRN_STATUS.DELETED, PRN_STATUS.DISCARDED]
const STATUS_FIELD = 'status.currentStatus'
const STATUS_PATH = `$${STATUS_FIELD}`
const GROUPED_ORGANISATION_ID = '$_id.orgId'
const GROUPED_ACCREDITATION_ID = '$_id.accId'

const buildAccreditedRegistrationStage = () => ({
  $addFields: {
    accreditedRegistration: {
      $first: {
        $filter: {
          input: { $ifNull: ['$registrations', []] },
          as: 'registration',
          cond: { $eq: ['$$registration.accreditationId', '$$accId'] }
        }
      }
    }
  }
})

const buildOrganisationLookupStage = () => ({
  $lookup: {
    from: ORGANISATIONS_COLLECTION,
    let: {
      orgId: { $toObjectId: GROUPED_ORGANISATION_ID },
      accId: GROUPED_ACCREDITATION_ID
    },
    pipeline: [
      { $match: { $expr: { $eq: ['$_id', '$$orgId'] } } },
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
          tonnageBand: '$accreditations.prnIssuance.tonnageBand',
          registrationId: '$accreditedRegistration.id',
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

const buildGroupStage = () => ({
  $group: {
    _id: {
      orgId: '$organisation.id',
      orgName: '$organisation.name',
      accId: '$accreditation.id',
      accNumber: '$accreditation.accreditationNumber',
      material: '$accreditation.material'
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
    organisationId: { $toString: GROUPED_ORGANISATION_ID },
    registrationNumber: { $first: '$orgLookup.registrationNumber' },
    tonnageBand: { $first: '$orgLookup.tonnageBand' },
    ledgerId: {
      organisationId: GROUPED_ORGANISATION_ID,
      registrationId: { $first: '$orgLookup.registrationId' },
      accreditationId: GROUPED_ACCREDITATION_ID
    },
    registration: {
      wasteProcessingType: { $first: '$orgLookup.wasteProcessingType' },
      reprocessingType: { $first: '$orgLookup.reprocessingType' }
    }
  }
})

const buildProjectStage = () => ({
  $project: {
    _id: 0,
    organisationName: '$_id.orgName',
    organisationId: 1,
    registrationNumber: 1,
    accreditationNumber: '$_id.accNumber',
    material: '$_id.material',
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
 * Mirrors `processingTypeFor`
 * (`#waste-balances/domain/credited-tonnage.js`): an exporter registration is
 * an exporter, and a reprocessor registration without an explicit reprocessing
 * type is an input reprocessor.
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
 * @param {import('mongodb').Document} aggregatedRow
 */
const buildReportRow = async (
  ledgerRepository,
  {
    ledgerId,
    registration,
    organisationName,
    organisationId,
    registrationNumber,
    accreditationNumber,
    material,
    tonnageBand,
    ...tonnages
  }
) => ({
  organisationName,
  organisationId,
  registrationNumber,
  registrationType: registrationTypeFor(registration),
  accreditationNumber,
  material,
  tonnageBand,
  ...(await balancesFor(ledgerRepository, ledgerId)),
  ...tonnages
})

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

  const rows = await Promise.all(
    aggregatedRows.map((row) => buildReportRow(ledgerRepository, row))
  )

  return {
    generatedAt: new Date().toISOString(),
    rows
  }
}
