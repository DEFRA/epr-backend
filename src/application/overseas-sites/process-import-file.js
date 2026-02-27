import { parse } from '#adapters/parsers/overseas-sites/ors-spreadsheet-parser.js'
import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'

/**
 * Processes a single ORS spreadsheet file: parses it, creates overseas site
 * records, and merges them into the registration's overseasSites map.
 *
 * @param {Buffer} buffer - Excel file contents
 * @param {object} deps
 * @param {object} deps.overseasSitesRepository
 * @param {object} deps.organisationsRepository
 * @param {object} deps.logger
 * @returns {Promise<{status: string, sitesCreated: number, mappingsUpdated: number, registrationNumber: string|null, errors: Array}>}
 */
export const processImportFile = async (
  buffer,
  { overseasSitesRepository, organisationsRepository, logger }
) => {
  let metadata
  let sites
  let errors

  try {
    ;({ metadata, sites, errors } = await parse(buffer))
  } catch (err) {
    if (err instanceof SpreadsheetValidationError) {
      return failureResult(null, [{ field: 'file', message: err.message }])
    }
    throw err
  }

  if (errors.length > 0) {
    return failureResult(metadata.registrationNumber, errors)
  }

  const org = await organisationsRepository.findByOrgId(metadata.orgId)
  if (!org) {
    return failureResult(metadata.registrationNumber, [
      {
        field: 'orgId',
        message: `Organisation with orgId ${metadata.orgId} not found`
      }
    ])
  }

  const registration = org.registrations.find(
    (r) => r.registrationNumber === metadata.registrationNumber
  )
  if (!registration) {
    return failureResult(metadata.registrationNumber, [
      {
        field: 'registrationNumber',
        message: `Registration ${metadata.registrationNumber} not found in organisation ${metadata.orgId}`
      }
    ])
  }

  const overseasSitesMap = {}

  for (const site of sites) {
    const now = new Date()
    const created = await overseasSitesRepository.create({
      name: site.name,
      address: site.address,
      country: site.country,
      coordinates: site.coordinates ?? undefined,
      validFrom: site.validFrom ? new Date(site.validFrom) : null,
      createdAt: now,
      updatedAt: now
    })

    overseasSitesMap[site.orsId] = { overseasSiteId: created.id }
  }

  const merged = await organisationsRepository.mergeRegistrationOverseasSites(
    org.id,
    org.version,
    registration.id,
    overseasSitesMap
  )

  if (!merged) {
    return failureResult(metadata.registrationNumber, [
      {
        field: 'version',
        message: `Failed to update registration ${metadata.registrationNumber} — version conflict`
      }
    ])
  }

  logger.info({
    message: `Processed ORS file: ${sites.length} sites created for registration ${metadata.registrationNumber}`
  })

  return {
    status: 'success',
    sitesCreated: sites.length,
    mappingsUpdated: Object.keys(overseasSitesMap).length,
    registrationNumber: metadata.registrationNumber,
    errors: []
  }
}

const failureResult = (registrationNumber, errors) => ({
  status: 'failure',
  sitesCreated: 0,
  mappingsUpdated: 0,
  registrationNumber,
  errors
})
