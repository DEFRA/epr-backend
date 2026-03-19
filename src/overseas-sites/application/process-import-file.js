import { parse } from '../parsers/ors-spreadsheet-parser.js'
import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import { ORS_FILE_RESULT_STATUS } from '#overseas-sites/domain/import-status.js'

/**
 * Processes a single ORS spreadsheet file: parses it, creates overseas site
 * records, and replaces the registration's overseasSites map.
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

  const { overseasSitesMap, sitesCreated } = await findOrCreateOverseasSites(
    sites,
    overseasSitesRepository
  )

  const replaced =
    await organisationsRepository.replaceRegistrationOverseasSites(
      org.id,
      org.version,
      registration.id,
      overseasSitesMap
    )

  if (!replaced) {
    return failureResult(metadata.registrationNumber, [
      {
        field: 'version',
        message: `Failed to update registration ${metadata.registrationNumber} — version conflict`
      }
    ])
  }

  logger.info({
    message: `Processed ORS file: ${sitesCreated} sites created, ${sites.length - sitesCreated} reused for registration ${metadata.registrationNumber}`
  })

  return {
    status: ORS_FILE_RESULT_STATUS.SUCCESS,
    sitesCreated,
    mappingsUpdated: Object.keys(overseasSitesMap).length,
    registrationNumber: metadata.registrationNumber,
    errors: []
  }
}

const findOrCreateOverseasSites = async (sites, overseasSitesRepository) => {
  const overseasSitesMap = {}
  let sitesCreated = 0

  for (const site of sites) {
    const properties = {
      name: site.name,
      address: site.address,
      country: site.country,
      coordinates: site.coordinates ?? undefined,
      validFrom: site.validFrom ? new Date(site.validFrom) : null
    }

    const existing = await overseasSitesRepository.findByProperties(properties)

    if (existing) {
      overseasSitesMap[site.orsId] = { overseasSiteId: existing.id }
    } else {
      const now = new Date()
      const created = await overseasSitesRepository.create({
        ...properties,
        createdAt: now,
        updatedAt: now
      })
      overseasSitesMap[site.orsId] = { overseasSiteId: created.id }
      sitesCreated++
    }
  }

  return { overseasSitesMap, sitesCreated }
}

const failureResult = (registrationNumber, errors) => ({
  status: ORS_FILE_RESULT_STATUS.FAILURE,
  sitesCreated: 0,
  mappingsUpdated: 0,
  registrationNumber,
  errors
})
