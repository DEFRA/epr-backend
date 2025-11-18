import { extractRepeaters } from '#formsubmission/parsing-common/parse-forms-data.js'
import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'
import {
  mapMaterial,
  mapTimeScale,
  convertToNumber,
  mapWastePermitType
} from '#formsubmission/parsing-common/form-data-mapper.js'
import {
  MATERIAL,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

const ENV_PERMIT_BY_MATERIALS = [
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_ALUMINIUM,
    configSepa: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_ALUMINIUM_SEPA_NIEA,
    material: MATERIAL.ALUMINIUM
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE,
    configSepa:
      FORM_PAGES.REGISTRATION
        .ENV_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE_SEPA_NIEA,
    material: MATERIAL.FIBRE
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_GLASS,
    configSepa: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_GLASS_SEPA_NIEA,
    material: MATERIAL.GLASS
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_PAPER_OR_BOARD,
    configSepa:
      FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_PAPER_OR_BOARD_SEPA_NIEA,
    material: MATERIAL.PAPER
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_PLASTIC,
    configSepa: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_PLASTIC_SEPA_NIEA,
    material: MATERIAL.PLASTIC
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_STEEL,
    configSepa: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_STEEL_SEPA_NIEA,
    material: MATERIAL.STEEL
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_WOOD,
    configSepa: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_WOOD_SEPA_NIEA,
    material: MATERIAL.WOOD
  }
]

const INSTALLATION_PERMIT_BY_MATERIALS = [
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_ALUMINIUM,
    configSepa:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_ALUMINIUM_SEPA_NIEA,
    material: MATERIAL.ALUMINIUM
  },
  {
    config:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE,
    configSepa:
      FORM_PAGES.REGISTRATION
        .INSTALLATION_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE_SEPA_NIEA,
    material: MATERIAL.FIBRE
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_GLASS,
    configSepa:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_GLASS_SEPA_NIEA,
    material: MATERIAL.GLASS
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_PAPER_OR_BOARD,
    configSepa:
      FORM_PAGES.REGISTRATION
        .INSTALLATION_PERMIT_DETAILS_PAPER_OR_BOARD_SEPA_NIEA,
    material: MATERIAL.PAPER
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_PLASTIC,
    configSepa:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_PLASTIC_SEPA_NIEA,
    material: MATERIAL.PLASTIC
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_STEEL,
    configSepa:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_STEEL_SEPA_NIEA,
    material: MATERIAL.STEEL
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_WOOD,
    configSepa:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_WOOD_SEPA_NIEA,
    material: MATERIAL.WOOD
  }
]

function getEnvironmentPermitDetails(answersByPages) {
  // Try EA/NRW page title first, then SEPA/NIEA
  const permitNumber =
    answersByPages[FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS.title]?.[
      FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS.fields.PERMIT_NUMBER
    ] ||
    answersByPages[
      FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_SEPA_NIEA.title
    ]?.[
      FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_SEPA_NIEA.fields.PERMIT_NUMBER
    ]

  return permitNumber
    ? {
        type: WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT,
        permitNumber,
        authorisedMaterials: ENV_PERMIT_BY_MATERIALS.map(
          ({ config, configSepa, material }) => {
            // Try EA/NRW page first, then SEPA/NIEA
            const pageData =
              answersByPages[config.title] || answersByPages[configSepa.title]

            if (!pageData?.[config.fields.TIMESCALE]) {
              return undefined
            }

            return {
              material,
              authorisedWeightInTonnes: convertToNumber(
                pageData[config.fields.AUTHORISED_WEIGHT],
                'authorisedWeightInTonnes'
              ),
              timeScale: mapTimeScale(pageData[config.fields.TIMESCALE])
            }
          }
        ).filter(Boolean)
      }
    : undefined
}

function getWasteExemptionDetails(rawSubmissionData) {
  const exemptions = extractRepeaters(
    rawSubmissionData,
    FORM_PAGES.REGISTRATION.WASTE_EXEMPTION.title,
    {
      [FORM_PAGES.REGISTRATION.WASTE_EXEMPTION.fields.EXEMPTION_REFERENCE]:
        'reference',
      [FORM_PAGES.REGISTRATION.WASTE_EXEMPTION.fields.EXEMPTION]:
        'exemptionCode',
      [FORM_PAGES.REGISTRATION.WASTE_EXEMPTION.fields.PACKAGING_CATEGORIES]:
        'materials'
    }
  )
  if (exemptions.length > 0) {
    return {
      type: WASTE_PERMIT_TYPE.WASTE_EXEMPTION,
      exemptions: exemptions.map((exemption) => ({
        ...exemption,
        materials: exemption.materials
          ?.split(',')
          .map((material) => mapMaterial(material))
      }))
    }
  } else {
    return undefined
  }
}

function getInstallationPermitDetails(answersByPages) {
  // Try EA/NRW page title first, then SEPA/NIEA
  const permitNumber =
    answersByPages[FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS.title]?.[
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS.fields.PERMIT_NUMBER
    ] ||
    answersByPages[
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_SEPA_NIEA.title
    ]?.[
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_SEPA_NIEA.fields
        .PERMIT_NUMBER
    ]

  return permitNumber
    ? {
        type: WASTE_PERMIT_TYPE.INSTALLATION_PERMIT,
        permitNumber,
        authorisedMaterials: INSTALLATION_PERMIT_BY_MATERIALS.map(
          ({ config, configSepa, material }) => {
            // Try EA/NRW page first, then SEPA/NIEA
            const pageData =
              answersByPages[config.title] || answersByPages[configSepa.title]

            if (!pageData?.[config.fields.TIMESCALE]) {
              return undefined
            }

            return {
              material,
              authorisedWeightInTonnes: convertToNumber(
                pageData[config.fields.AUTHORISED_WEIGHT],
                'authorisedWeightInTonnes'
              ),
              timeScale: mapTimeScale(pageData[config.fields.TIMESCALE])
            }
          }
        ).filter(Boolean)
      }
    : undefined
}

function getPermitsForReprocessor(answersByPages, rawSubmissionData) {
  return [
    getEnvironmentPermitDetails(answersByPages),
    getInstallationPermitDetails(answersByPages),
    getWasteExemptionDetails(rawSubmissionData)
  ].filter(Boolean)
}

const NONE_OF_ABOVE = 'None of the above'

function getPermitsForExporter(answersByPages) {
  const exporterPermits = FORM_PAGES.REGISTRATION.EXPORTER_PERMITS
  const permits =
    answersByPages[exporterPermits.title][exporterPermits.fields.PERMITS]

  if (!permits) {
    return []
  }

  return permits
    .split(',')
    .map((permit) => permit.trim())
    .filter((permit) => permit && permit !== NONE_OF_ABOVE)
    .map((permit) => ({ type: mapWastePermitType(permit) }))
}

export function getWasteManagementPermits(
  wasteProcessingType,
  rawSubmissionData,
  answersByPages
) {
  return wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? getPermitsForReprocessor(answersByPages, rawSubmissionData)
    : getPermitsForExporter(answersByPages)
}
