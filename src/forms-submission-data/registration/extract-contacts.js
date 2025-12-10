import { REGISTRATION } from './form-field-constants.js'

export function getSubmitterDetails(answersByShortDescription) {
  return {
    fullName:
      answersByShortDescription[REGISTRATION.SUBMITTER_DETAILS.fields.NAME],
    email:
      answersByShortDescription[REGISTRATION.SUBMITTER_DETAILS.fields.EMAIL],
    phone:
      answersByShortDescription[
        REGISTRATION.SUBMITTER_DETAILS.fields.TELEPHONE_NUMBER
      ],
    jobTitle:
      answersByShortDescription[REGISTRATION.SUBMITTER_DETAILS.fields.JOB_TITLE]
  }
}

export function getApprovedPersons(answersByShortDescription) {
  const approvedPerson = {
    fullName:
      answersByShortDescription[REGISTRATION.APPROVED_PERSON.fields.NAME],
    email: answersByShortDescription[REGISTRATION.APPROVED_PERSON.fields.EMAIL],
    phone:
      answersByShortDescription[
        REGISTRATION.APPROVED_PERSON.fields.TELEPHONE_NUMBER
      ],
    jobTitle:
      answersByShortDescription[REGISTRATION.APPROVED_PERSON.fields.JOB_TITLE]
  }

  return [approvedPerson]
}
