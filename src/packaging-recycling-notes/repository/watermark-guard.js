import Boom from '@hapi/boom'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */

/**
 * Once a PRN carries a watermark it has migrated to ledger-event status
 * tracking, so every subsequent write must carry the watermark forward and
 * never move it backwards. A write is a regression when the PRN already has a
 * watermark and the write either drops it (carries none) or supplies a lower
 * one. A write that carries an equal or higher watermark, or any write to a
 * PRN that has never had one, is fine.
 *
 * @param {number | undefined} storedEventNumber
 * @param {number | undefined} incomingEventNumber
 * @returns {storedEventNumber is number}
 */
export const isWatermarkRegression = (storedEventNumber, incomingEventNumber) =>
  storedEventNumber !== undefined &&
  (incomingEventNumber === undefined || incomingEventNumber < storedEventNumber)

/**
 * A watermark regression can only happen when the calling code, holding the
 * current version, fails to carry a migrated PRN's watermark forward — an
 * out-of-order or dropped event fed into the projection. That is a coding
 * error, not a retryable conflict, so it is logged and surfaced as an internal
 * error. Both repository adapters route through here so their message, log
 * event and status code stay identical.
 *
 * @param {string} id
 * @param {number} storedEventNumber
 * @param {number | undefined} incomingEventNumber
 * @param {TypedLogger} logger
 * @returns {never}
 */
export const throwWatermarkRegression = (
  id,
  storedEventNumber,
  incomingEventNumber,
  logger
) => {
  const message =
    incomingEventNumber === undefined
      ? `Watermark regression: PRN ${id} has applied event ${storedEventNumber} but the update did not carry a watermark`
      : `Watermark regression: PRN ${id} has applied event ${storedEventNumber} but the update would move it back to ${incomingEventNumber}`

  const error = new Error(message)
  logger.error({
    err: error,
    message: `Watermark regression detected for PRN ${id}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.DB,
      action: LOGGING_EVENT_ACTIONS.WATERMARK_REGRESSION_DETECTED,
      reference: id
    }
  })
  throw Boom.badImplementation(message)
}
