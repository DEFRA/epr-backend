import { packagingRecyclingNotesAccept } from './accept.js'
import { adminPackagingRecyclingNotesCancel } from './admin-cancel.js'
import { adminPackagingRecyclingNotesList } from './admin-list.js'
import { packagingRecyclingNotesList } from './list.js'
import { packagingRecyclingNotesReject } from './reject.js'
import {
  prnCancelByNaturalKey,
  prnRoutesByNaturalKey
} from './by-natural-key.js'

/**
 * Every PRN route the app serves.
 *
 * @param {import('convict').Config<Record<string, any>>} config
 */
export const packagingRecyclingNotesRoutes = (config) => {
  const adminCancellationRoutesBehindFeatureFlag = config.get(
    'featureFlags.prnAdminCancellation'
  )
    ? [adminPackagingRecyclingNotesCancel, prnCancelByNaturalKey]
    : []

  return [
    packagingRecyclingNotesAccept,
    packagingRecyclingNotesList,
    packagingRecyclingNotesReject,
    ...prnRoutesByNaturalKey,
    adminPackagingRecyclingNotesList,
    ...adminCancellationRoutesBehindFeatureFlag
  ]
}
