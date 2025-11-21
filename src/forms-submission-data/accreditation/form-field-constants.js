// Common field descriptions
const SIP_FILE_UPLOAD_SHORT_DESC = 'Sampling and inspection plan'
const ORS_FILE_UPLOAD_SHORT_DESC = 'Overseas reprocessing and interim sites'

const BUSINESS_PLAN_TITLE_NEW_INFRASTRUCTURE =
  'New reprocessing infrastructure and maintaining existing infrastructure'
const BUSINESS_PLAN_TITLE_PRICE_SUPPORT =
  'Price support for buying packaging waste or selling recycled packaging waste'
const BUSINESS_PLAN_TITLE_BUSINESS_COLLECTIONS =
  'Support for business collections'
const BUSINESS_PLAN_TITLE_COMMUNICATIONS =
  'Communications, including information campaigns'
const BUSINESS_PLAN_TITLE_DEVELOPING_NEW_MARKETS =
  'Developing new markets for products made from recycled packaging waste'
const BUSINESS_PLAN_TITLE_NEW_USES_FOR_RECYCLED_WASTE =
  'Developing new uses for recycled packaging waste'
const BUSINESS_PLAN_TITLE_OTHER_ACTIVITIES =
  'Activities or investment not covered by the other categories'

const HAVE_ORG_ID_TITLE = 'Do you have an Organisation ID number?'
const HAVE_ORG_ID_FIELD = 'Have an Org ID?'
const ORGANISATION_DETAILS_TITLE = 'Organisation details'
const ORG_NAME_FIELD = 'Org name'
const ORGANISATION_ID_FIELD = 'Organisation ID'
const SYSTEM_REFERENCE_FIELD = 'System Reference'

const SUBMITTER_NAME = 'Submitter name'
const SUBMITTER_EMAIL = 'Submitter email address'
const SUBMITTER_TELEPHONE = 'Submitter telephone number'
const SUBMITTER_JOB_TITLE = 'Submitter job title'

export const ACCREDITATION = {
  HAVE_ORGANISATION_ID: {
    title: HAVE_ORG_ID_TITLE,
    fields: {
      HAVE_ORG_ID: HAVE_ORG_ID_FIELD
    }
  },
  ORGANISATION_DETAILS: {
    title: ORGANISATION_DETAILS_TITLE,
    fields: {
      ORG_NAME: ORG_NAME_FIELD,
      ORGANISATION_ID: ORGANISATION_ID_FIELD,
      SYSTEM_REFERENCE: SYSTEM_REFERENCE_FIELD
    }
  },
  SITE: {
    fields: {
      POSTCODE: 'Site post code',
      FIRST_LINE_ADDRESS: '1st line of site address'
    }
  },
  CATEGORY_TO_ACCREDIT: {
    fields: {
      MATERIAL: 'Packaging waste category to accredit'
    }
  },
  GLASS_RECYCLING_PROCESS: 'Glass process',
  SUBMITTER_DETAILS: {
    fields: {
      NAME: SUBMITTER_NAME,
      EMAIL: SUBMITTER_EMAIL,
      TELEPHONE_NUMBER: SUBMITTER_TELEPHONE,
      JOB_TITLE: SUBMITTER_JOB_TITLE
    }
  },
  PRN: {
    fields: {
      TONNAGE_BAND: 'Tonnage band'
    }
  },
  PRN_SIGNATORY: {
    title: 'Authority to issue PRNs for this packaging waste category',
    fields: {
      NAME: 'PRN signatory name',
      EMAIL: 'PRN signatory email address',
      PHONE: 'PRN signatory phone number',
      JOB_TITLE: 'PRN signatory job title'
    }
  },
  PERN_SIGNATORY: {
    title: 'Authority to issue PERNs for this packaging waste category',
    fields: {
      NAME: 'PERN signatory name',
      EMAIL: 'PERN signatory email address',
      PHONE: 'PERN signatory phone number',
      JOB_TITLE: 'PERN signatory job title'
    }
  },
  SIP_FILE_UPLOAD_PART_2: SIP_FILE_UPLOAD_SHORT_DESC,
  ORS_FILE_UPLOAD: ORS_FILE_UPLOAD_SHORT_DESC,
  // Exporter-specific business plan fields (without "Percentage for..." prefix)
  BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_NEW_INFRASTRUCTURE,
    fields: {
      PERCENT_SPENT: 'New and maintaining infrastructure'
    }
  },
  BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_DETAILS: {
    title: 'More detail for spend on new reprocessing infrastructure',
    fields: {
      DETAILS: 'More detail for new and maintaining infrastructure'
    }
  },
  BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_PRICE_SUPPORT,
    fields: {
      PERCENT_SPENT: 'Price support'
    }
  },
  BUSINESS_PLAN_PRICE_SUPPORT_DETAILS: {
    title: 'More detail for spend on price support',
    fields: {
      DETAILS: 'More detail for price support'
    }
  },
  BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_BUSINESS_COLLECTIONS,
    fields: {
      PERCENT_SPENT: 'Support for business collections'
    }
  },
  BUSINESS_PLAN_BUSINESS_COLLECTIONS_DETAILS: {
    title: 'More detail for spend on support for business collections',
    fields: {
      DETAILS: 'More detail for support for business collections'
    }
  },
  BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_COMMUNICATIONS,
    fields: {
      PERCENT_SPENT: 'Communications'
    }
  },
  BUSINESS_PLAN_COMMUNICATIONS_DETAILS: {
    title: 'More detail for spend on communications',
    fields: {
      DETAILS: 'More detail for communications'
    }
  },
  BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_DEVELOPING_NEW_MARKETS,
    fields: {
      PERCENT_SPENT: 'Developing new markets'
    }
  },
  BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_DETAILS: {
    title: 'More detail for spend on developing new markets',
    fields: {
      DETAILS: 'More detail for developing new markets'
    }
  },

  BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_NEW_USES_FOR_RECYCLED_WASTE,
    fields: {
      PERCENT_SPENT: 'New uses for recycled packaging waste'
    }
  },
  BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_DETAILS: {
    title:
      'More detail for spend on developing new uses for recycled packaging waste',
    fields: {
      DETAILS: 'More detail for new uses for recycled packaging waste'
    }
  },
  BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_EXPORTER: {
    title: BUSINESS_PLAN_TITLE_OTHER_ACTIVITIES,
    fields: {
      PERCENT_SPENT: 'Activities or investment not already covered'
    }
  },
  BUSINESS_PLAN_OTHER_ACTIVITIES_DETAILS: {
    title:
      'More detail for spend on activities not covered by the other categories',
    fields: {
      DETAILS: 'More detail for activities or investment not already covered'
    }
  },
  // Reprocessor-specific business plan fields (with "Percentage for..." prefix)
  BUSINESS_PLAN_NEW_AND_MAINTAINING_INFRASTRUCTURE_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_NEW_INFRASTRUCTURE,
    fields: {
      PERCENT_SPENT: 'Percentage for new and maintaining infrastructure'
    }
  },
  BUSINESS_PLAN_PRICE_SUPPORT_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_PRICE_SUPPORT,
    fields: {
      PERCENT_SPENT: 'Percentage for price support'
    }
  },
  BUSINESS_PLAN_BUSINESS_COLLECTIONS_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_BUSINESS_COLLECTIONS,
    fields: {
      PERCENT_SPENT: 'Percentage for support for business collections'
    }
  },
  BUSINESS_PLAN_COMMUNICATIONS_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_COMMUNICATIONS,
    fields: {
      PERCENT_SPENT: 'Percentage for communications'
    }
  },
  BUSINESS_PLAN_DEVELOPING_NEW_MARKETS_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_DEVELOPING_NEW_MARKETS,
    fields: {
      PERCENT_SPENT: 'Percentage for developing new markets'
    }
  },
  BUSINESS_PLAN_NEW_USES_FOR_RECYCLED_WASTE_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_NEW_USES_FOR_RECYCLED_WASTE,
    fields: {
      PERCENT_SPENT: 'Percentage for new uses for recycled packaging waste'
    }
  },
  BUSINESS_PLAN_OTHER_ACTIVITIES_PERCENTAGE_REPROCESSOR: {
    title: BUSINESS_PLAN_TITLE_OTHER_ACTIVITIES,
    fields: {
      PERCENT_SPENT:
        'Percentage for activities or investment not already covered'
    }
  }
}
