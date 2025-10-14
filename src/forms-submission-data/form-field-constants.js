const TIMESCALE_ALUMINIUM = 'Timescale (Aluminium)'

export const FORM_PAGES = {
  ORGANISATION: {
    PARTNERSHIP_DETAILS: {
      title: 'Names of partners in your limited partnership',
      fields: {
        PARTNER_NAMES: 'Partner names',
        PARTNER_TYPE: 'Partner type'
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
