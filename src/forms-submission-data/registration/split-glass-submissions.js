import { ObjectId } from 'mongodb'
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
  return registrations.flatMap((registration) =>
    hasBothGlassProcesses(registration)
      ? splitIntoRemeltAndOther(registration)
      : [registration]
  )
}
