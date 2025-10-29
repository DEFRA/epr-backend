import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

import { convictValidateMongoUri } from '#common/helpers/convict/validate-mongo-uri.js'

convict.addFormat(convictValidateMongoUri)
convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

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
        : ['req', 'res', 'responseTime']
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
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
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
  featureFlags: {
    summaryLogs: {
      doc: 'Feature Flag: Summary Logs',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_SUMMARY_LOGS'
    },
    organisations: {
      doc: 'Feature Flag: Organisations',
      format: Boolean,
      default: false,
      env: 'FEATURE_FLAG_ORGANISATIONS'
    },
    formsDataMigration: {
      doc: 'Feature Flag: Runs forms data migration on startup',
      format: Boolean,
      default: true,
      env: 'FEATURE_FLAG_FORMS_DATA_MIGRATION'
    }
  }
}

const config = convict(baseConfig)

config.validate({ allowed: 'strict' })

function getConfig(overrides) {
  return convict(baseConfig, overrides)
}

export { config, getConfig }
