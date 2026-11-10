import Joi from 'joi'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { toPrnMaterial } from '#packaging-recycling-notes/domain/issuing-accreditation.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { ledgerKey } from '#waste-balances/application/accreditation-index.js'

/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { WasteProcessingTypeValue, ReprocessingType } from '#domain/organisations/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { AccreditationCommon, Organisation, Registration } from '#organisation-read-model/domain/model.js' */
/** @import { AccreditationTonnage, PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */

/**
 * The organisation, registration and accreditation a ledger belongs to, as the
 * organisation read model serves them.
 *
 * @typedef {Object} ServedAccreditation
 * @property {Organisation} organisation
 * @property {Registration} registration
 * @property {AccreditationCommon} accreditation
 */

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
 * A row resolved all the way down the hierarchy, ready to be reported.
 *
 * @typedef {Object} AggregatedRow
 * @property {string} organisationName
 * @property {OrganisationNumber} organisationNumber
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
 * What a row must carry to be reportable. The read model passes stored fields
 * such as the tonnage band through unchecked, so the report checks them here.
 */
const aggregatedRowSchema = Joi.object({
  organisationName: Joi.string().required(),
  organisationNumber: Joi.string().required(),
  registrationNumber: Joi.string().required(),
  accreditationNumber: Joi.string().required(),
  material: Joi.string().required(),
  tonnageBand: Joi.string().required(),
  ledgerId: Joi.object({
    organisationNumber: Joi.string().required(),
    registrationNumber: Joi.string().required(),
    accreditationNumber: Joi.string().required()
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
 * @param {Registration} registration
 * @returns {RegistrationProcessingTypes}
 */
const processingTypesOf = (registration) =>
  registration.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? {
        wasteProcessingType: registration.wasteProcessingType,
        reprocessingType: registration.reprocessingType
      }
    : { wasteProcessingType: registration.wasteProcessingType }

/**
 * Every accreditation the read model serves, by the `ledgerKey` of the ledger
 * it writes to.
 *
 * @param {Organisation[]} organisations
 * @returns {Map<string, ServedAccreditation>}
 */
const indexByLedger = (organisations) =>
  new Map(
    organisations.flatMap((organisation) =>
      Object.entries(organisation.registrations).flatMap(
        ([registrationNumber, registration]) =>
          Object.values(registration.accreditations).map((accreditation) => [
            ledgerKey({
              organisationNumber: organisation.organisationNumber,
              registrationNumber: toRegistrationNumber(registrationNumber),
              accreditationNumber: accreditation.accreditationNumber
            }),
            { organisation, registration, accreditation }
          ])
      )
    )
  )

/**
 * Joins an accreditation's PRN totals to the organisation, registration and
 * accreditation they were raised under.
 *
 * @param {AccreditationTonnage} accreditationTonnage
 * @param {ServedAccreditation} served
 */
const toAggregatedRow = (
  { numbers, tonnageByStatus },
  { organisation, registration, accreditation }
) => ({
  organisationName: organisation.name,
  organisationNumber: organisation.organisationNumber,
  registrationNumber: numbers.registrationNumber,
  accreditationNumber: numbers.accreditationNumber,
  material: toPrnMaterial(registration.material).material,
  tonnageBand: accreditation.prnIssuance.tonnageBand,
  ledgerId: numbers,
  registration: processingTypesOf(registration),
  ...toTonnageColumns(tonnageByStatus)
})

/**
 * PRN totals the report cannot place would publish a balance of zero, which a
 * regulator cannot tell apart from an operator holding nothing.
 *
 * @param {Map<string, ServedAccreditation>} index
 * @param {WasteBalanceLedgerId} numbers
 * @returns {ServedAccreditation}
 */
const servedAccreditationFor = (index, numbers) => {
  const served = index.get(ledgerKey(numbers))
  if (!served) {
    throw new Error(
      `No organisation in the read model holds accreditation ${numbers.accreditationNumber} under registration ${numbers.registrationNumber} of organisation ${numbers.organisationNumber}`
    )
  }
  return served
}

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
    organisationNumber,
    registrationNumber,
    accreditationNumber,
    material,
    tonnageBand,
    ...tonnages
  }
) => ({
  organisationName,
  organisationNumber,
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

  const index = indexByLedger(organisations)

  const aggregatedRows = accreditationTonnages
    .map((accreditationTonnage) => {
      const row = toAggregatedRow(
        accreditationTonnage,
        servedAccreditationFor(index, accreditationTonnage.numbers)
      )
      return /** @type {AggregatedRow} */ (
        Joi.attempt(
          row,
          aggregatedRowSchema,
          `Unreportable PRN tonnage row for accreditation ${accreditationTonnage.numbers.accreditationNumber}:`
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
