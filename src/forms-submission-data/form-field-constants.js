const TIMESCALE_ALUMINIUM = 'Timescale (Aluminium)'

export const FORM_PAGES = {
  ORGANISATION: {
    BUSINESS_TYPE: {
      title: 'Organisation type',
      fields: {
        TYPE: 'Organisation type'
      }
    },
    COMPANY_DETAILS: {
      fields: {
        NAME: 'Organisation name',
        TRADING_NAME: 'Trading name',
        REGISTRATION_NUMBER: 'Companies House number',
        REGISTERED_ADDRESS: 'Registered office address',
        ORGANISATION_ADDRESS: 'Organisation address',
        ADDRESS_LINE_1: 'Address line 1',
        ADDRESS_LINE_2: 'Address line 2',
        TOWN: 'Town or city',
        COUNTRY: 'Country',
        REGION: 'State, province or region',
        POST_CODE: 'Postcode or equivalent'
      }
    },
    SUBMITTER_DETAILS: {
      fields: {
        NAME: 'Submitter name',
        EMAIL: 'Submitter email address',
        TELEPHONE_NUMBER: 'Submitter telephone number',
        JOB_TITLE: 'Submitter job title'
      }
    },
    MANAGEMENT_CONTACT_DETAILS: {
      IS_SEPARATE_CONTACT_NON_UK: 'Non-UK - manage or control?',
      IS_SEPARATE_CONTACT_UNINCORP:
        'Unincorporated association - manage or control?',
      IS_SEPARATE_CONTACT_SOLE_TRADER: 'Sole trader - in charge?',

      fields: {
        NON_UK_NAME: 'Non-UK - manage or control name',
        NON_UK_EMAIL: 'Non-UK - manage or control email',
        NON_UK_PHONE: 'Non-UK - manage or control phone',
        NON_UK_JOB_TITLE: 'Non-UK - manage or control job title',

        UNINCORP_NAME: 'Unincorporated association - manage or control name',
        UNINCORP_EMAIL: 'Unincorporated association - manage or control email',
        UNINCORP_PHONE: 'Unincorporated association - manage or control phone',
        UNINCORP_JOB_TITLE:
          'Unincorporated association - manage or control job title',

        SOLE_TRADER_NAME: 'Sole trader - in charge name',
        SOLE_TRADER_EMAIL: 'Sole trader - in charge email',
        SOLE_TRADER_PHONE: 'Sole trader - in charge phone',
        SOLE_TRADER_JOB_TITLE: 'Sole trader - in charge job title'
      }
    },
    LTD_PARTNERSHIP_DETAILS: {
      title: 'Names of partners in your limited partnership',
      fields: {
        PARTNER_NAMES: 'Partner names',
        PARTNER_TYPE: 'Partner type'
      }
    },
    PARTNERSHIP_DETAILS: {
      PARTNERSHIP_TYPE: 'Are you a partnership?',
      fields: {
        PARTNER_NAME: 'Partner name',
        TYPE_OF_PARTNER: 'Type of partner'
      }
    },
    WASTE_PROCESSING_DETAILS: {
      fields: {
        TYPES: 'Currently operational?'
      }
    },
    REPROCESSING_NATIONS: {
      fields: {
        NATIONS: 'Nations with sites'
      }
    }
  },
  REPROCESSOR_ACCREDITATION: {
    PRN_SIGNATORY: {
      title: 'Authority to issue PRNs for this packaging waste category',
      fields: {
        NAME: 'PRN signatory name',
        EMAIL: 'PRN signatory email address',
        PHONE: 'PRN signatory phone number',
        JOB_TITLE: 'PRN signatory job title'
      }
    }
  },
  REPROCESSOR_REGISTRATION: {
    HAVE_ORGANISATION_ID: {
      title: 'Do you have an Organisation ID number?',
      fields: {
        HAVE_ORG_ID: 'Have an Org ID?'
      }
    },
    ORGANISATION_DETAILS: {
      title: 'Organisation details',
      fields: {
        ORG_NAME: 'Org name',
        ORGANISATION_ID: 'Organisation ID',
        SYSTEM_REFERENCE: 'System Reference'
      }
    },
    ALUMINIUM_ENVIRONMENTAL_PERMIT: {
      title:
        'Aluminium - environmental permit or waste management licence details',
      fields: {
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    ALUMINIUM_INSTALLATION_PERMIT: {
      title: 'Aluminium - installation permit details',
      fields: {
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    ALUMINIUM_SITE_CAPACITY: {
      title: 'Site capacity for aluminium recycling',
      fields: {
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    }
  }
}
