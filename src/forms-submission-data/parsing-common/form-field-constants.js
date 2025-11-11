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
  ACCREDITATION: {
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
  REGISTRATION: {
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
    },
    SUBMITTER_DETAILS: {
      fields: {
        NAME: 'App contact name',
        EMAIL: 'App contact email address',
        TELEPHONE_NUMBER: 'App contact telephone number',
        JOB_TITLE: 'App contact job title'
      }
    },
    SITE_DETAILS: {
      fields: {
        SITE_ADDRESS: 'Reprocessing site address',
        GRID_REFERENCE: 'Grid reference',
        NOTICE_ADDRESS: 'Address to serve notices'
      }
    },
    WASTE_REGISTRATION_NUMBER: 'Carrier, broker or dealer number',
    MATERIAL_REGISTERED: 'Packaging waste category to be registered',
    GLASS_RECYCLING_PROCESS: 'Glass process',
    SUPPLIERS: 'Suppliers',
    EXPORT_PORTS: 'Port name',
    PLANT_EQUIMENT_DETAILS: 'Plant and equipment',
    APPROVED_PERSON: {
      fields: {
        NAME: 'App contact name',
        EMAIL: 'App contact email address',
        TELEPHONE_NUMBER: 'App contact telephone number',
        JOB_TITLE: 'App contact job title'
      }
    },
    ENV_PERMIT_DETAILS: {
      title: 'Environmental permit or waste management licence details',
      fields: {
        PERMIT_NUMBER:
          'Environmental permit or Waste management licence number',
        AUTHORISED_MATERIALS: 'Authorised packaging waste categories'
      }
    },
    ENV_PERMIT_DETAILS_ALUMINIUM: {
      title:
        'Aluminium - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Aluminium)',
        TIMESCALE: 'Timescale (Aluminium)'
      }
    },
    ENV_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE: {
      title:
        'Fibre-based composite material - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Fibre-based composite material)',
        TIMESCALE: 'Timescale (Fibre-based composite material)'
      }
    },
    ENV_PERMIT_DETAILS_GLASS: {
      title: 'Glass - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Glass)',
        TIMESCALE: 'Timescale (Glass)'
      }
    },
    ENV_PERMIT_DETAILS_PAPER_OR_BOARD: {
      title:
        'Paper or board - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Paper or board)',
        TIMESCALE: 'Timescale (Paper or board)'
      }
    },
    ENV_PERMIT_DETAILS_PLASTIC: {
      title:
        'Plastic - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Plastic)',
        TIMESCALE: 'Timescale (Plastic)'
      }
    },
    ENV_PERMIT_DETAILS_STEEL: {
      title: 'Steel - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Steel)',
        TIMESCALE: 'Timescale (Steel)'
      }
    },
    ENV_PERMIT_DETAILS_WOOD: {
      title: 'Wood - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Wood)',
        TIMESCALE: 'Timescale (Wood)'
      }
    },
    INSTALLATION_PERMIT_DETAILS: {
      title: 'Installation permit details',
      fields: {
        PERMIT_NUMBER: 'Installation or PPC permit number',
        AUTHORISED_MATERIALS: 'Authorised packaging waste categories'
      }
    },
    INSTALLATION_PERMIT_DETAILS_ALUMINIUM: {
      title: 'Aluminium - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Aluminium)',
        TIMESCALE: 'Timescale (Aluminium)'
      }
    },
    INSTALLATION_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE: {
      title: 'Fibre-based composite material - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Fibre-based composite material)',
        TIMESCALE: 'Timescale (Fibre-based composite material)'
      }
    },
    INSTALLATION_PERMIT_DETAILS_GLASS: {
      title: 'Glass - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Glass)',
        TIMESCALE: 'Timescale (Glass)'
      }
    },
    INSTALLATION_PERMIT_DETAILS_PAPER_OR_BOARD: {
      title: 'Paper or board - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Paper or board)',
        TIMESCALE: 'Timescale (Paper or board)'
      }
    },
    INSTALLATION_PERMIT_DETAILS_PLASTIC: {
      title: 'Plastic - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Plastic)',
        TIMESCALE: 'Timescale (Plastic)'
      }
    },
    INSTALLATION_PERMIT_DETAILS_STEEL: {
      title: 'Steel - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Steel)',
        TIMESCALE: 'Timescale (Steel)'
      }
    },
    INSTALLATION_PERMIT_DETAILS_WOOD: {
      title: 'Wood - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: 'Authorised weight (Wood)',
        TIMESCALE: 'Timescale (Wood)'
      }
    },
    WASTE_EXEMPTION: {
      title: 'Waste exemption details',
      fields: {
        EXEMPTION_REFERENCE: 'Exemption reference',
        EXEMPTION: 'Exemption',
        PACKAGING_CATEGORIES: 'Waste exemption packaging category'
      }
    },
    SITE_CAPACITY_ALUMINIUM: {
      title: 'Site capacity for aluminium recycling',
      fields: {
        CAPACITY: 'Capacity (Aluminium)',
        TIMESCALE: 'Timescale (Aluminium)'
      }
    },
    SITE_CAPACITY_FIBRE_BASED_COMPOSITE: {
      title: 'Site capacity for fibre-based composite material recycling',
      fields: {
        CAPACITY: 'Capacity (Fibre-based composite material)',
        TIMESCALE: 'Timescale (Fibre-based composite material)'
      }
    },
    SITE_CAPACITY_GLASS: {
      title: 'Site capacity for glass recycling',
      fields: {
        CAPACITY: 'Capacity (Glass)',
        TIMESCALE: 'Timescale (Glass)'
      }
    },
    SITE_CAPACITY_PAPER_OR_BOARD: {
      title: 'Site capacity for paper or board recycling',
      fields: {
        CAPACITY: 'Capacity (Paper or board)',
        TIMESCALE: 'Timescale (Paper or board)'
      }
    },
    SITE_CAPACITY_PLASTIC: {
      title: 'Site capacity for plastic recycling',
      fields: {
        CAPACITY: 'Capacity (Plastic)',
        TIMESCALE: 'Timescale (Plastic)'
      }
    },
    SITE_CAPACITY_STEEL: {
      title: 'Site capacity for steel recycling',
      fields: {
        CAPACITY: 'Capacity (Steel)',
        TIMESCALE: 'Timescale (Steel)'
      }
    },
    SITE_CAPACITY_WOOD: {
      title: 'Site capacity for wood recycling',
      fields: {
        CAPACITY: 'Capacity (Wood)',
        TIMESCALE: 'Timescale (Wood)'
      }
    },
    SIP_FILE_UPLOAD: 'Sampling and inspection plan',
    ORS_FILE_UPLOAD: 'Overseas reprocessing and interim sites'
  }
}
