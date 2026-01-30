import { ObjectId } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'

function hasBothGlassProcesses(registration) {
  return (
    registration.material === MATERIAL.GLASS &&
    registration.glassRecyclingProcess?.includes(
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    ) &&
    registration.glassRecyclingProcess?.includes(
      GLASS_RECYCLING_PROCESS.GLASS_OTHER
    )
  )
}

function splitIntoRemeltAndOther(registration) {
  const remelt = {
    ...registration,
    glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
  }

  const other = {
    ...registration,
    id: new ObjectId().toString(),
    glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
  }

  return [remelt, other]
}

export function splitGlassSubmissions(registrations) {
  const result = registrations.flatMap((registration) =>
    hasBothGlassProcesses(registration)
      ? splitIntoRemeltAndOther(registration)
      : [registration]
  )

  const splitCount = result.length - registrations.length
  if (splitCount > 0) {
    logger.info({
      message: `Split ${splitCount} glass registration(s) with both processes into remelt + other`
    })
  }

  return result
}
