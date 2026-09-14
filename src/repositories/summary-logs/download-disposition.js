const ISO_SECONDS_LENGTH = 19

/**
 * Names a submission's download `<registrationNumber>-<submittedAt>.<ext>`,
 * down to the second because a rejected log is often resubmitted the same day.
 * Colons are dropped: they are illegal in Windows filenames.
 *
 * @param {string} registrationNumber
 * @param {string} submittedAt
 * @param {string} extension
 * @returns {string}
 */
export const buildDownloadDisposition = (
  registrationNumber,
  submittedAt,
  extension
) => {
  const submitted = submittedAt
    .slice(0, ISO_SECONDS_LENGTH)
    .replace('T', '-')
    .replaceAll(':', '')

  return `attachment; filename="${registrationNumber}-${submitted}.${extension}"`
}
