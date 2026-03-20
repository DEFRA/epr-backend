import { config } from '#root/config.js'

const SIXTY_SECONDS = 60

export const summaryLogFilesConfig = {
  summaryLogsBucket: config.get('cdpUploader.summaryLogsBucket'),
  preSignedUrlExpiry: SIXTY_SECONDS
}
