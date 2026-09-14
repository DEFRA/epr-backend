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
import { resolvePool } from '#packaging-recycling-notes/domain/resolve-pool.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { applyCatchupEventsToPrn } from '#packaging-recycling-notes/domain/apply-catchup-events-to-prn.js'
import { reservePrnNumber } from './reserve-prn-number.js'
import { catchUpPrnProjection } from './get-projected-prn.js'

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
 * The transitions that debit a balance pool: the ringfence (draft →
 * awaiting_authorisation) and the issue (awaiting_authorisation →
 * awaiting_acceptance). A December-declared one resolves its pool from the
 * accreditation and records it on the event, so a later reversal can read it
 * back (ADR-0049).
 *
 * @type {Set<PrnStatus>}
 */
const RAISE_TARGET_STATUSES = new Set([
  PRN_STATUS.AWAITING_AUTHORISATION,
  PRN_STATUS.AWAITING_ACCEPTANCE
])

/**
 * The transitions that credit a balance pool back: the delete (→ deleted) and
 * the cancel (→ cancelled). A December-declared one resolves its pool by reading
 * it off the PRN's raise event rather than the accreditation, so it restores the
 * pool the raise actually drew even if the accreditation has since changed
 * (ADR-0049).
 *
 * Keyed on target status alone, which is sound only because these targets are
 * currently reached by exactly one transition each, all balance-crediting. A
 * future transition reusing `deleted`/`cancelled` as a target from a state that
 * moves no balance would need this gate to key on the `(from, to)` pair instead.
 *
 * @type {Set<PrnStatus>}
 */
const REVERSAL_TARGET_STATUSES = new Set([
  PRN_STATUS.DELETED,
  PRN_STATUS.CANCELLED
])

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
 * `accreditationId` is narrowed to non-null. The PRN itself is not here — it is
 * loaded inside phase 1, after the balance is read for update.
 *
 * @typedef {{
 *   ledgerId: WasteBalanceLedgerId & { accreditationId: string },
 *   prnRepository: PackagingRecyclingNotesRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   service: WasteBalanceService,
 *   logger: import('#common/hapi-types.js').TypedLogger,
 *   providedPrn?: PackagingRecyclingNote,
 *   newStatus: PrnStatus,
 *   user: { id: string, name: string, email?: string },
 *   actor: import('#packaging-recycling-notes/domain/model.js').PrnActor,
 *   now: Date,
 *   id: string,
 *   obligationYear?: number
 * }} PrnTransitionContext
 */

/**
 * Move a PRN to a new status, then report it.
 *
 * @param {UpdatePrnStatusRequest} request
 * @returns {Promise<PackagingRecyclingNote>}
 */
export async function updatePrnStatus(request) {
  const { prnEvents, logger, newStatus } = request

  const { updatedPrn, fromStatus } = await applyPrnTransition(
    buildTransitionContext(request)
  )

  await prnMetrics.recordStatusTransition({
    fromStatus,
    toStatus: newStatus,
    material: updatedPrn.accreditation.material,
    isExport: updatedPrn.isExport
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
 * Assembles the `PrnTransitionContext` the three phases run on. This is the one
 * place the caller's three loose ids become a `ledgerId`; everything downstream
 * takes it whole.
 *
 * @param {UpdatePrnStatusRequest} request
 * @returns {PrnTransitionContext}
 */
function buildTransitionContext({
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
  obligationYear,
  providedPrn
}) {
  return {
    prnRepository,
    organisationsRepository,
    service: createWasteBalanceService(ledgerRepository),
    logger,
    providedPrn,
    newStatus,
    actor,
    ledgerId: { organisationId, registrationId, accreditationId },
    user,
    now: updatedAt ?? new Date(),
    id,
    obligationYear
  }
}

/**
 * A PRN status transition, as the three phases it is and nothing else: gather
 * the state and context, rule on the transition, then persist what the ruling
 * named.
 *
 * The ruling comes back on exactly one of three arms, so phases 1 and 2 are the
 * same lines whichever it is and the two persist paths diverge only at the end.
 *
 * @param {PrnTransitionContext} ctx
 * @returns {Promise<{ updatedPrn: PackagingRecyclingNote, fromStatus: PrnStatus }>}
 */
async function applyPrnTransition(ctx) {
  const { newStatus, actor, user, now, ledgerId, obligationYear } = ctx

  // Phase 1 — gather.
  const { balance, append, prn, issuance, pool } =
    await gatherTransitionState(ctx)
  const fromStatus = prn.status.currentStatus

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
    payload: buildCommandPayload(prn, obligationYear, pool),
    updatedBy: { id: user.id, name: user.name }
  })

  if ('error' in outcome) {
    throw toTransitionError(outcome.error, ledgerId.accreditationId)
  }

  // Phase 3 — persist, on whichever arm the ruling named.
  if ('statusChange' in outcome) {
    return {
      updatedPrn: await persistStatusChange(ctx, {
        prn,
        statusChange: outcome.statusChange
      }),
      fromStatus
    }
  }

  // The note takes its number before the event announcing it, so a read landing
  // between the two never sees an issuance with no number.
  const numbered = issuance
    ? await reservePrnNumber(ctx.prnRepository, {
        prn,
        accreditation: issuance.accreditation
      })
    : prn

  const events = await append(outcome.balanceEvents)

  return {
    updatedPrn: await persistProjectedPrn(ctx, {
      prn: numbered,
      fromStatus,
      events
    }),
    fromStatus
  }
}

/**
 * Phase 1 — gather. The balance is read for update first and every other read
 * follows it, so nothing the ruling is made against is older than the head the
 * events would land on (PAE-1844). That ordering is why the PRN is loaded here
 * rather than handed in, and why the accreditation is read here too — on the
 * issuance path only, which is the one transition that stamps the PRN number
 * from it.
 *
 * @param {PrnTransitionContext} ctx
 * @returns {Promise<import('#waste-balances/application/waste-balance-service.js').BalanceForUpdate & {
 *   prn: PackagingRecyclingNote,
 *   issuance: { accreditation: import('#domain/organisations/accreditation.js').Accreditation } | undefined,
 *   pool: import('#waste-balances/repository/ledger-schema.js').Pool | undefined
 * }>}
 */
async function gatherTransitionState(ctx) {
  const { service, organisationsRepository, newStatus, ledgerId, user } = ctx

  const { balance, append } = await service.readBalanceForUpdate(ledgerId, user)

  const prn = await loadPrn(ctx)

  // The accreditation is read when the transition needs it: always on issue
  // (which stamps the PRN number from it), and on a raise of a December-declared
  // PRN, to resolve the pool it debits (PAE-1922). A reversal resolves its pool
  // from the raise event instead (PAE-1923), so it reads no accreditation; a PRN
  // that never declared December waste draws the general balance, so it reads
  // none either. Read after the balance, so nothing the ruling uses predates the
  // head.
  const needsAccreditation =
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE ||
    (prn.isDecemberWaste && RAISE_TARGET_STATUSES.has(newStatus))
  const accreditation = needsAccreditation
    ? await organisationsRepository.findAccreditationById(
        ledgerId.organisationId,
        ledgerId.accreditationId
      )
    : undefined

  const issuance =
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE && accreditation
      ? { accreditation }
      : undefined

  const pool = await resolveTransitionPool(ctx, { prn, accreditation })

  return { balance, append, prn, issuance, pool }
}

/**
 * The pool a transition's balance movement draws on, or `undefined` when it
 * touches none. A raise re-derives it from the accreditation — safe because both
 * inputs are immutable (`accruesDecember` reads only the processing type,
 * `isDecemberWaste` is fixed on the PRN). A reversal reads it off the PRN's raise
 * event, so it restores the pool the raise actually drew even if the
 * accreditation has since changed, which is what ADR-0049 mandates.
 *
 * @param {PrnTransitionContext} ctx
 * @param {Object} gathered
 * @param {PackagingRecyclingNote} gathered.prn
 * @param {import('#domain/organisations/accreditation.js').Accreditation} [gathered.accreditation]
 * @returns {Promise<import('#waste-balances/repository/ledger-schema.js').Pool | undefined>}
 */
async function resolveTransitionPool(
  { service, ledgerId, newStatus },
  { prn, accreditation }
) {
  if (prn.isDecemberWaste && REVERSAL_TARGET_STATUSES.has(newStatus)) {
    return readRaisePool(service, ledgerId, prn.id)
  }
  return accreditation !== undefined
    ? resolvePool({ isDecemberWaste: prn.isDecemberWaste, accreditation })
    : undefined
}

/**
 * The pool the PRN's raise recorded, read off its `prn-created` event. The whole
 * PRN history is scanned from the start rather than the read watermark, because
 * the raise is the earliest event and the reversal must find it whatever the
 * projection has folded. An absent pool means only a raise recorded before the
 * pool dimension existed; a current general raise states `general` explicitly
 * (`resolvePool` never returns `undefined`). Either routes to the general
 * credit, as the closing-balance reader coalesces an absent pool to general.
 *
 * @param {WasteBalanceService} service
 * @param {WasteBalanceLedgerId & { accreditationId: string }} ledgerId
 * @param {string} prnId
 * @returns {Promise<import('#waste-balances/repository/ledger-schema.js').Pool | undefined>}
 */
async function readRaisePool(service, ledgerId, prnId) {
  const events = await service.prnCatchupEvents({
    ...ledgerId,
    prnId,
    afterEventNumber: 0
  })
  const raise = events.find(
    (event) => event.kind === LEDGER_EVENT_KIND.PRN_CREATED
  )
  return raise === undefined
    ? undefined
    : /** @type {{ pool?: import('#waste-balances/repository/ledger-schema.js').Pool }} */ (
        raise.payload
      ).pool
}

/**
 * The PRN the transition rules against: the stored document, asserted to belong
 * to the caller's organisation and accreditation, brought current by folding on
 * the stream events it has not yet seen.
 *
 * It runs inside phase 1 rather than ahead of the transition so that no read it
 * makes predates the head the transition's events will land on. That costs a
 * wasted fold when the PRN turns out not to exist or not to belong to the
 * caller, which is the price of the hazard being unstateable.
 *
 * @param {PrnTransitionContext} ctx
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function loadPrn({ prnRepository, service, ledgerId, id, providedPrn }) {
  const stored = providedPrn ?? (await prnRepository.findById(id))

  if (
    stored?.organisation.id !== ledgerId.organisationId ||
    stored?.accreditation.id !== ledgerId.accreditationId
  ) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  return catchUpPrnProjection(stored, service)
}

/**
 * The waste-balance command the ruling is made against: which PRN, how much,
 * and — on acceptance only — the obligation year the caller chose.
 *
 * The positive-amount invariant is asserted here, where the amount is read off
 * the PRN, because that is the document it is an invariant of: tonnage is
 * validated positive at the route and in the PRN schema. A non-positive one is
 * corruption rather than client error, so it surfaces as a 500 rather than
 * slipping past the deciders' `<` sufficiency check. `NaN` is the only value
 * that passes that check, so it is refused by name.
 *
 * The pool is written only where `resolveTransitionPool` genuinely resolved one
 * — on the raises (from the accreditation) and the December reversals (off the
 * raise event) — and omitted where it did not, rather than guessed. A transition
 * that moves no pool (accept, reject) resolves none, so its event carries no
 * pool: writing `general` there would be a falsehood on a December PRN, and
 * nothing reads it anyway. A reader coalesces an absent pool to `general`, as it
 * does a pre-feature event, so an omitted general is read exactly as the flag's
 * absence was (ADR-0049).
 *
 * @param {PackagingRecyclingNote} prn
 * @param {number} [obligationYear]
 * @param {import('#waste-balances/repository/ledger-schema.js').Pool} [pool]
 * @returns {import('#waste-balances/repository/ledger-schema.js').PrnAcceptedPayload}
 */
function buildCommandPayload(prn, obligationYear, pool) {
  if (Number.isNaN(prn.tonnage) || prn.tonnage <= 0) {
    throw Boom.badImplementation(
      `PRN tonnage must be positive at the waste-balance write boundary; received ${prn.tonnage}`
    )
  }

  const selectedObligationYear = selectObligationYearForAcceptance(
    prn,
    obligationYear
  )

  return {
    prnId: prn.id,
    amount: prn.tonnage,
    ...(pool !== undefined && { pool }),
    ...(selectedObligationYear === undefined
      ? {}
      : { obligationYear: selectedObligationYear })
  }
}

/**
 * Phase 3, ledger arm — fold the committed events onto the PRN and persist the
 * result. There is no compensation: events appended without the document
 * persisted are recovered by the read-side catch-up on the next read.
 *
 * `version` is read off the PRN as handed in rather than off the fold, because
 * the repository's optimistic-concurrency guard owns it and the fold leaves it
 * alone.
 *
 * @param {PrnTransitionContext} ctx
 * @param {Object} committed
 * @param {PackagingRecyclingNote} committed.prn
 * @param {PrnStatus} committed.fromStatus
 * @param {import('#waste-balances/repository/ledger-port.js').LedgerEvent[]} committed.events
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistProjectedPrn(
  { prnRepository, logger, newStatus },
  { prn, fromStatus, events }
) {
  logWasteBalanceUpdate(logger, { events, prn, fromStatus, newStatus })

  const persisted = await prnRepository.persistProjection({
    projection: applyCatchupEventsToPrn(prn, events),
    expectedVersion: prn.version
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
 * It writes the watermark back rather than the status fields the fold produced,
 * which is safe only because `draft` is the one status no transition leads into:
 * a PRN still in it has appended nothing, so there is no fold to lose.
 *
 * @param {PrnTransitionContext} ctx
 * @param {Object} stated
 * @param {PackagingRecyclingNote} stated.prn
 * @param {{ to: PrnStatus, at: Date, by: import('#packaging-recycling-notes/domain/prn-transition.js').StatusChangeActor }} stated.statusChange
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistStatusChange(
  { prnRepository, id },
  { prn, statusChange }
) {
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
