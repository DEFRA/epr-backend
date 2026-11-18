import { PROCESSING_TYPES } from '../meta-fields.js'
import { hasTemplate, tableSchemasOf, yearsWithTemplates } from './index.js'

/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {ProcessingType} from '../meta-fields.js' */
/** @import {TableSchema} from './index.js' */

/**
 * Every table of every year's templates.
 *
 * @returns {{processingType: ProcessingType, schema: TableSchema, tableName: string, year: Year}[]}
 */
export const everyTemplateTable = () =>
  yearsWithTemplates().flatMap((year) =>
    Object.values(PROCESSING_TYPES)
      .filter((processingType) => hasTemplate(year, processingType))
      .flatMap((processingType) =>
        Object.entries(tableSchemasOf(year, processingType)).map(
          ([tableName, schema]) => ({ processingType, schema, tableName, year })
        )
      )
  )
