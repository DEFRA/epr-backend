import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '../../enums/index.js'
import { logger } from '../logging/logger.js'

const EXPECTED_HEADERS = [
  'Our reference',
  'Date received',
  'EWC code',
  'Gross weight (Tonnes)',
  'Tare weight (Tonnes)',
  'Pallet weight or other transit packaging (Tonnes)',
  'Weight of non-target  material and contaminants (Tonnes)',
  'Net weight of  UK packaging waste received (Tonnes, automatically calculated)',
  'Baling wire protocol  applied? (This is a deduction  of 0.15%)',
  'How did you calculate the recyclable  proportion?',
  'Recyclable proportion (Percentage)',
  'Tonnage of UK packaging  waste received for recycling (Automatically calculated)'
]

export async function validateSummaryLog({ summaryLog, filename }) {
  try {
    /**
     * This is placeholder POC code only...
     */

    if (!summaryLog?.sections?.[0]?.headers) {
      throw new Error(
        'Invalid summary log structure: missing sections or headers'
      )
    }

    const actualHeaders = summaryLog.sections[0].headers

    if (actualHeaders.length !== EXPECTED_HEADERS.length) {
      throw new Error(
        `Invalid headers: expected ${EXPECTED_HEADERS.length} headers but found ${actualHeaders.length}`
      )
    }

    for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
      if (actualHeaders[i] !== EXPECTED_HEADERS[i]) {
        throw new Error(
          `Invalid header at position ${i}: expected "${EXPECTED_HEADERS[i]}" but found "${actualHeaders[i]}"`
        )
      }
    }

    return true
  } catch (err) {
    logger.error(err, {
      message: `Failed to validate summary log: ${filename}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.WORKER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    throw err
  }
}
