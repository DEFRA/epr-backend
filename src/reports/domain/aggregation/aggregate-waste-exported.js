import { toNumber } from '#common/helpers/decimal-utils.js'

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteExportedRecords
 */
export function aggregateWasteExported(wasteExportedRecords) {
  let totalTonnageReceivedForExporting = 0
  const seenOrsIds = new Set()
  const overseasSites = []

  for (const { data } of wasteExportedRecords) {
    const tonnage = toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)

    totalTonnageReceivedForExporting += tonnage

    // OSR_ID is wrongly named, it should be ORS_ID but its a significant amount of work to correct that.
    const orsId = data.OSR_ID
    const siteName = data.OSR_NAME

    if (orsId && !seenOrsIds.has(orsId)) {
      seenOrsIds.add(orsId)
      overseasSites.push({ orsId, siteName })
    }
  }

  return {
    overseasSites,
    totalTonnageReceivedForExporting,
    tonnageReceivedNotExported: null,
    tonnageRefusedAtRecepientDestination: null,
    tonnageStoppedDuringExport: null,
    tonnageRepatriated: null
  }
}
