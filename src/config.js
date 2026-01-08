import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

import { convictValidateMongoUri } from '#common/helpers/convict/validate-mongo-uri.js'

convict.addFormat(convictValidateMongoUri)
convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

// Fast test values for eventual consistency retries
const TEST_CONSISTENCY_MAX_RETRIES = 10
const TEST_CONSISTENCY_RETRY_DELAY_MS = 10

// Production-safe defaults for multi-AZ MongoDB w:majority (p99 lag: 100-200ms)
const PRODUCTION_CONSISTENCY_MAX_RETRIES = 20
const PRODUCTION_CONSISTENCY_RETRY_DELAY_MS = 25

const baseConfig = {
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'epr-backend'
  },
  awsRegion: {
    doc: 'AWS region',
    format: String,
    default: 'eu-west-2',
    env: 'AWS_REGION'
  },
  s3Endpoint: {
    doc: 'AWS S3 endpoint',
    format: String,
    default: 'http://127.0.0.1:4566',
    env: 'S3_ENDPOINT'
  },
  isProduction: {
    doc: 'If this application running in the production environment',
    format: Boolean,
    default: isProduction
  },
  isDevelopment: {
    doc: 'If this application running in the development environment',
    format: Boolean,
    default: isDevelopment
  },
  isTest: {
    doc: 'If this application running in the test environment',
    format: Boolean,
    default: isTest
  },
  debug: {
    doc: 'Determines which logged events are sent to the console. See: https://github.com/hapijs/hapi/blob/master/API.md#-serveroptionsdebug',
    format: '*',
    default: isTest ? false : { request: ['implementation'] }
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  audit: {
    isEnabled: {
      doc: 'Is auditing enabled',
      format: Boolean,
      default: true,
      env: 'AUDIT_ENABLED'
    },
    maxPayloadSizeBytes: {
      doc: 'Is auditing enabled',
      format: Number,
      default: 1000000, // 1MB
      env: 'AUDIT_MAX_PAYLOAD_SIZE_BYTES'
    }
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req.headers.authorization', 'req.headers.cookie']
    }
  },
  mongo: {
    mongoUrl: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017',
      env: 'MONGO_URI'
    },
    databaseName: {
      doc: 'database for mongodb',
      format: String,
      default: 'epr-backend',
      env: 'MONGO_DATABASE'
    },
    mongoOptions: {
      retryWrites: {
        doc: 'enable mongo write retries',
        format: Boolean,
        default: false
      },
      readPreference: {
        doc: 'mongo read preference',
        format: [
          'primary',
          'primaryPreferred',
          'secondary',
          'secondaryPreferred',
          'nearest'
        ],
        default: 'secondary'
      }
    },
    eventualConsistency: {
      maxRetries: {
        doc: 'Maximum number of retries when waiting for eventual consistency',
        format: 'nat',
        default: isTest
          ? TEST_CONSISTENCY_MAX_RETRIES
          : PRODUCTION_CONSISTENCY_MAX_RETRIES,
        env: 'MONGO_EVENTUAL_CONSISTENCY_MAX_RETRIES'
      },
      retryDelayMs: {
        doc: 'Delay in milliseconds between eventual consistency retries',
        format: 'nat',
        default: isTest
          ? TEST_CONSISTENCY_RETRY_DELAY_MS
          : PRODUCTION_CONSISTENCY_RETRY_DELAY_MS,
        env: 'MONGO_EVENTUAL_CONSISTENCY_RETRY_DELAY_MS'
      }
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  isSwaggerEnabled: {
    doc: 'Enable swagger documentation',
    format: Boolean,
    default: isDevelopment,
    env: 'ENABLE_SWAGGER'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  appBaseUrl: {
    doc: 'Backend base URL for callbacks',
    format: String,
    default: 'http://localhost:3001',
    env: 'APP_BASE_URL'
  },
  cdpUploader: {
    url: {
      doc: 'CDP Uploader service URL',
      format: String,
      default: 'http://localhost:7337',
      env: 'CDP_UPLOADER_URL'
    },
    s3Bucket: {
      doc: 'S3 bucket for summary log uploads',
      format: String,
      default: 're-ex-summary-logs',
      env: 'CDP_UPLOADER_S3_BUCKET_SUMMARY_LOGS'
    }
  },
  regulator: {
    EA: {
      email: {
        doc: 'EA regulator email address',
        format: String,
        default: 'test@ea.gov.uk',
        env: 'REGULATOR_EMAIL_EA'
      }
    },
    NIEA: {
      email: {
        doc: 'NIEA regulator email address',
        format: String,
        default: 'test@niea.gov.uk',
        env: 'REGULATOR_EMAIL_NIEA'
      }
    },
    NRW: {
      email: {
        doc: 'NRW regulator email address',
        format: String,
        default: 'test@nrw.gov.uk',
        env: 'REGULATOR_EMAIL_NRW'
      }
    },
    SEPA: {
      email: {
        doc: 'SEPA regulator email address',
        format: String,
        default: 'test@sepa.gov.uk',
        env: 'REGULATOR_EMAIL_SEPA'
      }
    }
  },
  oidc: {
    entraId: {
      oidcWellKnownConfigurationUrl: {
        doc: 'Entra OIDC .well-known configuration URL',
        format: String,
        env: 'ENTRA_OIDC_WELL_KNOWN_CONFIGURATION_URL',
        default:
          'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0/.well-known/openid-configuration'
      },
      clientId: {
        doc: 'Admin UI app as audience',
        format: String,
        env: 'ADMIN_UI_ENTRA_CLIENT_ID',
        default: 'test'
      }
    },
    defraId: {
      oidcWellKnownConfigurationUrl: {
        doc: 'The Defra Identity well known URL.',
        format: String,
        default:
          'https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com/v2.0/.well-known/openid-configuration?p=B2C_1A_CUI_CPDEV_SIGNUPSIGNIN',
        env: 'DEFRA_ID_OIDC_WELL_KNOWN_URL'
      },
      clientId: {
        doc: 'EPR Frontend as audience',
        format: String,
        default: 'dbc093e4-3e78-411d-898d-88e45c1e8bc3',
        env: 'DEFRA_ID_CLIENT_ID'
      }
    }
  },
  roles: {
    serviceMaintainers: {
      doc: 'Stringified object defining user roles',
      format: String,
      env: 'SERVICE_MAINTAINER_EMAILS',
      default: '["me@example.com", "you@example.com"]'
    }
  },
  featureFlags: {
    summaryLogs: {
      doc: 'Feature Flag: Summary Logs',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_SUMMARY_LOGS'
    },
    formsDataMigration: {
      doc: 'Feature Flag: Runs forms data migration on startup',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_FORMS_DATA_MIGRATION'
    },
    logFileUploadsFromForms: {
      doc: 'Feature Flag: To enable logging of file ids uploaded from defra-forms on startup',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_LOG_FILE_UPLOADS_FROM_FORMS'
    },
    devEndpoints: {
      doc: 'Feature Flag: Enable development endpoints',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_DEV_ENDPOINTS'
    },
    calculateWasteBalanceOnImport: {
      doc: 'Feature Flag: Enable waste balance calculation on summary log import',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_CALCULATE_WASTE_BALANCE_ON_IMPORT'
    }
  },
  formSubmissionOverrides: {
    doc: 'JSON configuration for form submission field overrides (registrations and accreditations) on migration to epr-organisations',
    format: String,
    default: '{"registrations":[],"accreditations":[],"organisations":[]}',
    env: 'FORM_SUBMISSION_OVERRIDES'
  },
  systemReferencesRequiringOrgIdMatch: {
    doc: 'JSON array of systemReference IDs that require orgId validation during linking to prevent misuse',
    format: String,
    default: '[]',
    env: 'SYSTEM_REFERENCES_REQUIRING_ORG_ID_MATCH'
  },
  truncateEprOrganisations: {
    doc: 'epr-organisations collection will be truncated when this is true. This is meant to be used until migration is being tested(day1).',
    format: Boolean,
    default: false,
    env: 'TRUNCATE_EPR_ORGANISATIONS'
  },
  govukNotify: {
    apiKey: {
      doc: 'GOV.UK Notify API key (used directly in non-development environments)',
      format: String,
      nullable: true,
      default: null,
      env: 'GOVUK_NOTIFY_API_KEY'
    },
    apiKeyPath: {
      doc: 'Path to file containing GOV.UK Notify API key (used in development to read secret from file)',
      format: String,
      nullable: true,
      default: null,
      env: 'GOVUK_NOTIFY_API_KEY'
    }
  }
}

const config = convict(baseConfig)

config.validate({ allowed: 'strict' })

function getConfig(overrides) {
  return convict(baseConfig, overrides)
}

export { config, getConfig }
