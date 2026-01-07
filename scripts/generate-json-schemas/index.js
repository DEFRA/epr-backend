import fs from 'fs'
import path from 'path'
import { getOrganisationJSONSchema } from './organisation.update.js'

const organisation = getOrganisationJSONSchema()

const outputDir = path.join(process.cwd(), '.schemas')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir)
}

const outputPath = path.join(outputDir, 'organisation.json')
fs.writeFileSync(outputPath, JSON.stringify(organisation, null, 2))
