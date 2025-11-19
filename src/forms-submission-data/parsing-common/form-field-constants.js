const TIMESCALE_ALUMINIUM = 'Timescale (Aluminium)'
const TIMESCALE_FIBRE = 'Timescale (Fibre-based composite material)'
const TIMESCALE_GLASS = 'Timescale (Glass)'
const TIMESCALE_PAPER = 'Timescale (Paper or board)'
const TIMESCALE_PLASTIC = 'Timescale (Plastic)'
const TIMESCALE_STEEL = 'Timescale (Steel)'
const TIMESCALE_WOOD = 'Timescale (Wood)'

const AUTHORISED_WEIGHT_ALUMINIUM = 'Authorised weight (Aluminium)'
const AUTHORISED_WEIGHT_FIBRE =
  'Authorised weight (Fibre-based composite material)'
const AUTHORISED_WEIGHT_GLASS = 'Authorised weight (Glass)'
const AUTHORISED_WEIGHT_PAPER = 'Authorised weight (Paper or board)'
const AUTHORISED_WEIGHT_PLASTIC = 'Authorised weight (Plastic)'
const AUTHORISED_WEIGHT_STEEL = 'Authorised weight (Steel)'
const AUTHORISED_WEIGHT_WOOD = 'Authorised weight (Wood)'

const AUTHORISED_MATERIAL_SHORT_DESC = 'Authorised packaging waste categories'

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
    PLANT_EQUIPMENT_DETAILS: 'Plant and equipment',
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
        AUTHORISED_MATERIALS: AUTHORISED_MATERIAL_SHORT_DESC
      }
    },
    ENV_PERMIT_DETAILS_ALUMINIUM: {
      title:
        'Aluminium - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_ALUMINIUM,
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    EXPORTER_PERMITS: {
      title: 'Do you hold a permit or waste exemption?',
      fields: {
        PERMITS: 'Permit type'
      }
    },
    ENV_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE: {
      title:
        'Fibre-based composite material - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_FIBRE,
        TIMESCALE: TIMESCALE_FIBRE
      }
    },
    ENV_PERMIT_DETAILS_GLASS: {
      title: 'Glass - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_GLASS,
        TIMESCALE: TIMESCALE_GLASS
      }
    },
    ENV_PERMIT_DETAILS_PAPER_OR_BOARD: {
      title:
        'Paper or board - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PAPER,
        TIMESCALE: TIMESCALE_PAPER
      }
    },
    ENV_PERMIT_DETAILS_PLASTIC: {
      title:
        'Plastic - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PLASTIC,
        TIMESCALE: TIMESCALE_PLASTIC
      }
    },
    ENV_PERMIT_DETAILS_STEEL: {
      title: 'Steel - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_STEEL,
        TIMESCALE: TIMESCALE_STEEL
      }
    },
    ENV_PERMIT_DETAILS_WOOD: {
      title: 'Wood - environmental permit or waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_WOOD,
        TIMESCALE: TIMESCALE_WOOD
      }
    },
    INSTALLATION_PERMIT_DETAILS: {
      title: 'Installation permit details',
      fields: {
        PERMIT_NUMBER: 'Installation or PPC permit number',
        AUTHORISED_MATERIALS: AUTHORISED_MATERIAL_SHORT_DESC
      }
    },
    INSTALLATION_PERMIT_DETAILS_ALUMINIUM: {
      title: 'Aluminium - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_ALUMINIUM,
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    INSTALLATION_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE: {
      title: 'Fibre-based composite material - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_FIBRE,
        TIMESCALE: TIMESCALE_FIBRE
      }
    },
    INSTALLATION_PERMIT_DETAILS_GLASS: {
      title: 'Glass - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_GLASS,
        TIMESCALE: TIMESCALE_GLASS
      }
    },
    INSTALLATION_PERMIT_DETAILS_PAPER_OR_BOARD: {
      title: 'Paper or board - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PAPER,
        TIMESCALE: TIMESCALE_PAPER
      }
    },
    INSTALLATION_PERMIT_DETAILS_PLASTIC: {
      title: 'Plastic - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PLASTIC,
        TIMESCALE: TIMESCALE_PLASTIC
      }
    },
    INSTALLATION_PERMIT_DETAILS_STEEL: {
      title: 'Steel - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_STEEL,
        TIMESCALE: TIMESCALE_STEEL
      }
    },
    INSTALLATION_PERMIT_DETAILS_WOOD: {
      title: 'Wood - installation permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_WOOD,
        TIMESCALE: TIMESCALE_WOOD
      }
    },
    // SEPA/NIEA configurations (same field names as EA/NRW but different page titles)
    ENV_PERMIT_DETAILS_SEPA_NIEA: {
      title: 'Waste management licence details',
      fields: {
        PERMIT_NUMBER:
          'Environmental permit or Waste management licence number',
        AUTHORISED_MATERIALS: AUTHORISED_MATERIAL_SHORT_DESC
      }
    },
    ENV_PERMIT_DETAILS_ALUMINIUM_SEPA_NIEA: {
      title: 'Aluminium - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_ALUMINIUM,
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    ENV_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE_SEPA_NIEA: {
      title:
        'Fibre-based composite material - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_FIBRE,
        TIMESCALE: TIMESCALE_FIBRE
      }
    },
    ENV_PERMIT_DETAILS_GLASS_SEPA_NIEA: {
      title: 'Glass - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_GLASS,
        TIMESCALE: TIMESCALE_GLASS
      }
    },
    ENV_PERMIT_DETAILS_PAPER_OR_BOARD_SEPA_NIEA: {
      title: 'Paper or board - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PAPER,
        TIMESCALE: TIMESCALE_PAPER
      }
    },
    ENV_PERMIT_DETAILS_PLASTIC_SEPA_NIEA: {
      title: 'Plastic - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PLASTIC,
        TIMESCALE: TIMESCALE_PLASTIC
      }
    },
    ENV_PERMIT_DETAILS_STEEL_SEPA_NIEA: {
      title: 'Steel - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_STEEL,
        TIMESCALE: TIMESCALE_STEEL
      }
    },
    ENV_PERMIT_DETAILS_WOOD_SEPA_NIEA: {
      title: 'Wood - waste management licence details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_WOOD,
        TIMESCALE: TIMESCALE_WOOD
      }
    },
    INSTALLATION_PERMIT_DETAILS_SEPA_NIEA: {
      title: 'Pollution, Prevention and Control (PPC) permit details',
      fields: {
        PERMIT_NUMBER: 'Installation or PPC permit number',
        AUTHORISED_MATERIALS: AUTHORISED_MATERIAL_SHORT_DESC
      }
    },
    INSTALLATION_PERMIT_DETAILS_ALUMINIUM_SEPA_NIEA: {
      title: 'Aluminium - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_ALUMINIUM,
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    INSTALLATION_PERMIT_DETAILS_FIBRE_BASED_COMPOSITE_SEPA_NIEA: {
      title: 'Fibre-based composite material - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_FIBRE,
        TIMESCALE: TIMESCALE_FIBRE
      }
    },
    INSTALLATION_PERMIT_DETAILS_GLASS_SEPA_NIEA: {
      title: 'Glass - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_GLASS,
        TIMESCALE: TIMESCALE_GLASS
      }
    },
    INSTALLATION_PERMIT_DETAILS_PAPER_OR_BOARD_SEPA_NIEA: {
      title: 'Paper or board - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PAPER,
        TIMESCALE: TIMESCALE_PAPER
      }
    },
    INSTALLATION_PERMIT_DETAILS_PLASTIC_SEPA_NIEA: {
      title: 'Plastic - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_PLASTIC,
        TIMESCALE: TIMESCALE_PLASTIC
      }
    },
    INSTALLATION_PERMIT_DETAILS_STEEL_SEPA_NIEA: {
      title: 'Steel - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_STEEL,
        TIMESCALE: TIMESCALE_STEEL
      }
    },
    INSTALLATION_PERMIT_DETAILS_WOOD_SEPA_NIEA: {
      title: 'Wood - PPC permit details',
      fields: {
        AUTHORISED_WEIGHT: AUTHORISED_WEIGHT_WOOD,
        TIMESCALE: TIMESCALE_WOOD
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
        TIMESCALE: TIMESCALE_ALUMINIUM
      }
    },
    SITE_CAPACITY_FIBRE_BASED_COMPOSITE: {
      title: 'Site capacity for fibre-based composite material recycling',
      fields: {
        CAPACITY: 'Capacity (Fibre-based composite material)',
        TIMESCALE: TIMESCALE_FIBRE
      }
    },
    SITE_CAPACITY_GLASS: {
      title: 'Site capacity for glass recycling',
      fields: {
        CAPACITY: 'Capacity (Glass)',
        TIMESCALE: TIMESCALE_GLASS
      }
    },
    SITE_CAPACITY_PAPER_OR_BOARD: {
      title: 'Site capacity for paper or board recycling',
      fields: {
        CAPACITY: 'Capacity (Paper or board)',
        TIMESCALE: TIMESCALE_PAPER
      }
    },
    SITE_CAPACITY_PLASTIC: {
      title: 'Site capacity for plastic recycling',
      fields: {
        CAPACITY: 'Capacity (Plastic)',
        TIMESCALE: TIMESCALE_PLASTIC
      }
    },
    SITE_CAPACITY_STEEL: {
      title: 'Site capacity for steel recycling',
      fields: {
        CAPACITY: 'Capacity (Steel)',
        TIMESCALE: TIMESCALE_STEEL
      }
    },
    SITE_CAPACITY_WOOD: {
      title: 'Site capacity for wood recycling',
      fields: {
        CAPACITY: 'Capacity (Wood)',
        TIMESCALE: TIMESCALE_WOOD
      }
    },
    SIP_FILE_UPLOAD: 'Sampling and inspection plan',
    ORS_FILE_UPLOAD: 'Overseas reprocessing and interim sites',
    INPUT_TO_RECYLING: {
      title: 'Inputs for calendar year 2024',
      fields: {
        ESTIMATED_OR_ACTUAL: 'Input actual or estimated tonnages?',
        UK_PACKAGING_WASTE: 'UK packaging waste input',
        NON_UK_PACKAGING_WASTE: 'Non-UK packaging waste input',
        NON_PACKAGING_WASTE: 'Non-packaging input'
      },
      INPUT_RAW_MATERIAL: {
        title: 'Raw material inputs for calendar year 2024',
        fields: {
          MATERIAL: 'Input raw material',
          TONNAGE: 'Input raw material tonnage'
        }
      },
      OUTPUT_FROM_RECYCLING: {
        title: 'Outputs for calendar year 2024',
        fields: {
          ESTIMATED_OR_ACTUAL: 'Output actual or estimated tonnages?',
          TONNAGE_SENT_TO_ANOTHER_SITE: 'Tonnage sent to another reprocessor',
          TOTAL_CONTAMINANTS: 'Tonnage of contaminants',
          PROCESS_LOSS: 'Total process loss'
        }
      },
      PRODUCTS_MADE: {
        title: 'Products made from recycling for 2024',
        fields: {
          NAME: 'Product name',
          TONNAGE: 'Product tonnage'
        }
      }
    }
  }
}
