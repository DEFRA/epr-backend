import { extractRepeaters } from '#formsubmission/parsing-common/parse-forms-data.js'
import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'
import {
  mapMaterial,
  mapTimeScale,
  convertToNumber
} from '#formsubmission/parsing-common/form-data-mapper.js'
import { MATERIAL, WASTE_PERMIT_TYPE } from '#domain/organisations.js'

const ENV_PERMIT_BY_MATERIALS = [
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_ALUMINIUM,
    material: MATERIAL.ALUMINIUM
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE,
    material: MATERIAL.FIBRE
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_GLASS,
    material: MATERIAL.GLASS
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_PAPER_OR_BOARD,
    material: MATERIAL.PAPER
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_PLASTIC,
    material: MATERIAL.PLASTIC
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_STEEL,
    material: MATERIAL.STEEL
  },
  {
    config: FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS_WOOD,
    material: MATERIAL.WOOD
  }
]

const INSTALLATION_PERMIT_BY_MATERIALS = [
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_ALUMINIUM,
    material: MATERIAL.ALUMINIUM
  },
  {
    config:
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE,
    material: MATERIAL.FIBRE
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_GLASS,
    material: MATERIAL.GLASS
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_PAPER_OR_BOARD,
    material: MATERIAL.PAPER
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_PLASTIC,
    material: MATERIAL.PLASTIC
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_STEEL,
    material: MATERIAL.STEEL
  },
  {
    config: FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS_WOOD,
    material: MATERIAL.WOOD
  }
]

function getEnvironmentPermitDetails(answersByPages) {
  const permitNumber =
    answersByPages[FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS.title]?.[
      FORM_PAGES.REGISTRATION.ENV_PERMIT_DETAILS.fields.PERMIT_NUMBER
    ]

  return permitNumber
    ? {
        type: WASTE_PERMIT_TYPE.WML,
        permitNumber,
        authorisedMaterials: ENV_PERMIT_BY_MATERIALS.map(
          ({ config, material }) => {
            const pageData = answersByPages[config.title]

            if (!pageData?.[config.fields.TIMESCALE]) return undefined

            return {
              material,
              authorisedWeight: convertToNumber(
                pageData[config.fields.AUTHORISED_WEIGHT],
                'authorisedWeight'
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
  const permitNumber =
    answersByPages[FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS.title]?.[
      FORM_PAGES.REGISTRATION.INSTALLATION_PERMIT_DETAILS.fields.PERMIT_NUMBER
    ]

  return permitNumber
    ? {
        type: WASTE_PERMIT_TYPE.PPC,
        permitNumber,
        authorisedMaterials: INSTALLATION_PERMIT_BY_MATERIALS.map(
          ({ config, material }) => {
            const pageData = answersByPages[config.title]

            if (!pageData?.[config.fields.TIMESCALE]) return undefined

            return {
              material,
              authorisedWeight: convertToNumber(
                pageData[config.fields.AUTHORISED_WEIGHT],
                'authorisedWeight'
              ),
              timeScale: mapTimeScale(pageData[config.fields.TIMESCALE])
            }
          }
        ).filter(Boolean)
      }
    : undefined
}

export function getWasteManagementPermits(rawSubmissionData, answersByPages) {
  return [
    getEnvironmentPermitDetails(answersByPages),
    getInstallationPermitDetails(answersByPages),
    getWasteExemptionDetails(rawSubmissionData)
  ].filter(Boolean)
}
