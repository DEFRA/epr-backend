import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  logWasteBalanceUpdate,
  toTransitionError
} from './update-status-reporting.js'
import {
  CANCELLED_PRN_STATUSES,
  PRN_STATUS
} from '#packaging-recycling-notes/domain/model.js'
import { decidePrnTransition } from '#packaging-recycling-notes/domain/prn-transition.js'
import { selectObligationYearForAcceptance } from '#packaging-recycling-notes/domain/obligation-year.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { foldPrnFromTailEvents } from '#packaging-recycling-notes/domain/fold-prn-from-tail-events.js'
import { persistIssuedPrn } from './persist-issued-prn.js'
import { bringPrnCurrent } from './get-projected-prn.js'

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {ReturnType<typeof createWasteBalanceService>} WasteBalanceService
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 * @typedef {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 * @typedef {import('#reports/application/prn-cancellation-events.js').OnPrnCancelled} OnPrnCancelled
 */

/**
 * Raises the `onCancelled` PRN event for any transition into a cancelled status, so interested domains (e.g. reports) can react; a no-op otherwise.
 *
 * @param {{ onCancelled: OnPrnCancelled }} prnEvents
 * @param {PrnStatus} newStatus
 * @param {PackagingRecyclingNote} updatedPrn
 */
async function notifyPrnCancelled(prnEvents, newStatus, updatedPrn) {
  if (!CANCELLED_PRN_STATUSES.has(newStatus)) {
    return
  }

  const issued =
    /** @type {import('#packaging-recycling-notes/domain/model.js').BusinessOperation} */ (
      updatedPrn.status.issued
    )

  await prnEvents.onCancelled({
    organisationId: updatedPrn.organisation.id,
    registrationId: updatedPrn.registrationId,
    prnId: updatedPrn.id,
    issuedAt: new Date(issued.at).toISOString()
  })
}

/**
 * What a caller asks for: the collaborators to reach through, the PRN and the
 * status to move it to. The three ids arrive loose here because that is the
 * route contract; `buildTransitionContext` is where they become one ledger id.
 *
 * @typedef {{
 *   prnRepository: PackagingRecyclingNotesRepository,
 *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   prnEvents: { onCancelled: OnPrnCancelled },
 *   logger: import('#common/hapi-types.js').TypedLogger,
 *   id: string,
 *   organisationId: string,
 *   registrationId: string,
 *   accreditationId: string,
 *   newStatus: PrnStatus,
 *   actor: import('#packaging-recycling-notes/domain/model.js').PrnActor,
 *   user: { id: string, name: string, email?: string },
 *   providedPrn?: PackagingRecyclingNote,
 *   updatedAt?: Date,
 *   obligationYear?: number
 * }} UpdatePrnStatusRequest
 */

/**
 * Everything a PRN status transition needs: the repositories and service it
 * reaches through, and the transition it is making. The identity is an
 * accreditation's: this path runs only for accredited streams, so
 * `accreditationId` is narrowed to non-null.
 *
 * @typedef {{
 *   ledgerId: WasteBalanceLedgerId & { accreditationId: string },
 *   prnRepository: PackagingRecyclingNotesRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   service: WasteBalanceService,
 *   logger: import('#common/hapi-types.js').TypedLogger,
 *   prn: PackagingRecyclingNote,
 *   newStatus: PrnStatus,
 *   user: { id: string, name: string, email?: string },
 *   actor: import('#packaging-recycling-notes/domain/model.js').PrnActor,
 *   now: Date,
 *   id: string,
 *   obligationYear?: number
 * }} PrnTransitionContext
 */

/**
 * Phase 1 — gather. The ledger is folded first and every other read follows it,
 * so nothing the ruling is made against is older than the head the events would
 * land on (PAE-1844). The accreditation is read here for that reason, and only
 * on the issuance path, which is the only transition that stamps the PRN number
 * from it.
 *
 * @param {PrnTransitionContext} ctx
 * @param {import('#waste-balances/repository/ledger-schema.js').PrnAcceptedPayload} payload
 * @returns {Promise<import('#waste-balances/application/waste-balance-service.js').PrnCommand & {
 *   projection: PackagingRecyclingNote,
 *   fromStatus: PrnStatus,
 *   issuance: { accreditation: import('#domain/organisations/accreditation.js').Accreditation } | undefined
 * }>}
 */
async function gatherTransitionState(
  { service, organisationsRepository, prn, newStatus, ledgerId, user },
  payload
) {
  const { balance, append } = await service.beginPrnCommand(
    ledgerId,
    payload,
    user
  )

  // Loading the PRN is split in two because the ledger fold must sit between
  // the halves: the stored document is fetched before the transition starts,
  // and brought current here, after `beginPrnCommand`.
  const projection = await bringPrnCurrent(prn, service)

  const issuance =
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE
      ? {
          accreditation: await organisationsRepository.findAccreditationById(
            ledgerId.organisationId,
            ledgerId.accreditationId
          )
        }
      : undefined

  return {
    balance,
    append,
    projection,
    fromStatus: projection.status.currentStatus,
    issuance
  }
}

/**
 * Phase 3, ledger arm — fold the committed events onto the PRN and persist the
 * result. There is no compensation: events appended without the document
 * persisted are recovered by the read-side catch-up on the next read.
 *
 * The fold is onto the projection the ruling was made against, not the fetched
 * document: they differ exactly when the document had fallen behind the stream,
 * and folding onto the document would drop the events it had yet to see.
 *
 * The projection is the only PRN value this phase needs: the fold carries every
 * field it reads through untouched, `version` included, which the repository's
 * optimistic-concurrency guard owns rather than the fold.
 *
 * @param {PrnTransitionContext} ctx
 * @param {Object} committed
 * @param {PackagingRecyclingNote} committed.projection
 * @param {PrnStatus} committed.fromStatus
 * @param {{ accreditation: import('#domain/organisations/accreditation.js').Accreditation } | undefined} committed.issuance
 * @param {import('#waste-balances/repository/ledger-port.js').LedgerEvent[]} committed.events
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistAppendedEvents(
  { prnRepository, logger, newStatus },
  { projection, fromStatus, issuance, events }
) {
  logWasteBalanceUpdate(logger, {
    events,
    prn: projection,
    fromStatus,
    newStatus
  })

  const updated = foldPrnFromTailEvents(projection, events)
  const expectedVersion = projection.version

  if (issuance) {
    return persistIssuedPrn(prnRepository, {
      projection: updated,
      expectedVersion,
      accreditation: issuance.accreditation
    })
  }

  const persisted = await prnRepository.persistProjection({
    projection: updated,
    expectedVersion
  })
  if (!persisted) {
    throw Boom.badImplementation('Failed to persist PRN projection')
  }
  return persisted
}

/**
 * Phase 3, stated arm — stamp the status onto the PRN document directly, for
 * the one transition that appends nothing (DRAFT→DISCARDED). Appending no event
 * means this write contends for no ledger slot, so it is serialised against a
 * concurrent write only by the document's own version.
 *
 * @param {PrnTransitionContext} ctx
 * @param {{ to: PrnStatus, at: Date, by: import('#packaging-recycling-notes/domain/prn-transition.js').StatusChangeActor }} statusChange
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistStatusChange({ prnRepository, prn, id }, statusChange) {
  // The stored document, not the projection: this arm persists no fold, so the
  // watermark it writes back is the one the document already carried.
  const updatedPrn = await prnRepository.updateStatus({
    id,
    version: prn.version,
    status: statusChange.to,
    updatedBy: statusChange.by,
    updatedAt: statusChange.at,
    lastAppliedEventNumber: prn.lastAppliedEventNumber
  })
  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }
  return updatedPrn
}

/**
 * The waste-balance command the ledger is folded for and the ruling is made
 * against: which PRN, how much, and — on acceptance only — the obligation year
 * the caller chose.
 *
 * @param {PrnTransitionContext} ctx
 * @returns {import('#waste-balances/repository/ledger-schema.js').PrnAcceptedPayload}
 */
function buildCommandPayload({ prn, obligationYear }) {
  const selectedObligationYear = selectObligationYearForAcceptance(
    prn,
    obligationYear
  )

  return {
    prnId: prn.id,
    amount: prn.tonnage,
    ...(selectedObligationYear === undefined
      ? {}
      : { obligationYear: selectedObligationYear })
  }
}

/**
 * A PRN status transition, as the three phases it is and nothing else: gather
 * the state and context, rule on the transition, then persist what the ruling
 * named. Each phase helper takes the context first and its own inputs second.
 *
 * The two persist arms are mutually exclusive and exactly one runs. Which one
 * is the *shape* of the domain's answer, not a branch on the requested status
 * taken ahead of the ruling, so phases 1 and 2 are the same lines either way
 * and the paths diverge only at persist. Issuance still takes the PRN-numbering
 * persist off the requested status, which is a numbering concern rather than a
 * balance one.
 *
 * @param {PrnTransitionContext} ctx
 * @returns {Promise<{ updatedPrn: PackagingRecyclingNote, fromStatus: PrnStatus }>}
 */
async function applyPrnTransition(ctx) {
  const { prn, newStatus, actor, user, now, ledgerId } = ctx
  const payload = buildCommandPayload(ctx)

  // Phase 1 — gather.
  const { balance, append, projection, fromStatus, issuance } =
    await gatherTransitionState(ctx, payload)

  // Phase 2 — decide. The only place the transition rules compose, and pure:
  // everything it rules against was gathered above and is passed in.
  const outcome = decidePrnTransition({
    fromStatus,
    newStatus,
    actor,
    accreditation: issuance?.accreditation,
    accreditationYear: prn.accreditation.accreditationYear,
    now,
    balance,
    payload,
    updatedBy: { id: user.id, name: user.name }
  })

  if ('error' in outcome) {
    throw toTransitionError(outcome.error, ledgerId.accreditationId)
  }

  // Phase 3 — persist, on whichever arm the ruling named.
  if ('statusChange' in outcome) {
    return {
      updatedPrn: await persistStatusChange(ctx, outcome.statusChange),
      fromStatus
    }
  }

  // The append is the commit (ADR-0036); the persist below only projects what
  // it took. A statement of its own so that order stays visible.
  const events = await append(outcome.balanceEvents)

  return {
    updatedPrn: await persistAppendedEvents(ctx, {
      projection,
      fromStatus,
      issuance,
      events
    }),
    fromStatus
  }
}

/**
 * Move a PRN to a new status: resolve the PRN, run the transition, then report
 * it. Metrics and the cancellation notification sit outside the transition
 * because neither may change whether it committed.
 *
 * @param {UpdatePrnStatusRequest} request
 * @returns {Promise<PackagingRecyclingNote>}
 */
export async function updatePrnStatus(request) {
  const { prnEvents, logger, newStatus } = request

  const prn = await fetchStoredPrn(request)
  const ctx = buildTransitionContext(request, prn)

  const { updatedPrn, fromStatus } = await applyPrnTransition(ctx)

  await prnMetrics.recordStatusTransition({
    fromStatus,
    toStatus: newStatus,
    material: prn.accreditation.material,
    isExport: prn.isExport
  })

  try {
    await notifyPrnCancelled(prnEvents, newStatus, updatedPrn)
  } catch (error) {
    // Best-effort: the PRN transition is already committed, so don't fail the caller for a stale-notification error.
    logger.error({
      err: error,
      message: `PRN-cancellation notification failed for ${updatedPrn.id}; PRN status is already committed`
    })
  }

  return updatedPrn
}

/**
 * The first half of loading the PRN: the stored document as the repository
 * holds it, asserted to belong to the caller's organisation and accreditation.
 * `bringPrnCurrent` is the second half, and runs after the ledger fold.
 *
 * @param {UpdatePrnStatusRequest} request
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function fetchStoredPrn({
  prnRepository,
  id,
  organisationId,
  accreditationId,
  providedPrn
}) {
  const prn = providedPrn ?? (await prnRepository.findById(id))

  if (
    !prn ||
    prn.organisation.id !== organisationId ||
    prn.accreditation.id !== accreditationId
  ) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  return prn
}

/**
 * Assembles the `PrnTransitionContext` the three phases run on. This is the one
 * place the caller's three loose ids become a `ledgerId`; everything downstream
 * takes it whole.
 *
 * @param {UpdatePrnStatusRequest} request
 * @param {PackagingRecyclingNote} prn
 * @returns {PrnTransitionContext}
 */
function buildTransitionContext(
  {
    prnRepository,
    ledgerRepository,
    organisationsRepository,
    logger,
    newStatus,
    actor,
    organisationId,
    registrationId,
    accreditationId,
    user,
    id,
    updatedAt,
    obligationYear
  },
  prn
) {
  return {
    prnRepository,
    organisationsRepository,
    service: createWasteBalanceService(ledgerRepository),
    logger,
    prn,
    newStatus,
    actor,
    ledgerId: { organisationId, registrationId, accreditationId },
    user,
    now: updatedAt ?? new Date(),
    id,
    obligationYear
  }
}
