import { FORM_PAGES } from '#formsubmission/parsing-common/form-field-constants.js'

export function getSubmitterDetails(answersByShortDescription) {
  return {
    fullName:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.SUBMITTER_DETAILS.fields.NAME
      ],
    email:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.SUBMITTER_DETAILS.fields.EMAIL
      ],
    phone:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.SUBMITTER_DETAILS.fields.TELEPHONE_NUMBER
      ],
    title:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.SUBMITTER_DETAILS.fields.JOB_TITLE
      ]
  }
}

export function getApprovedPersons(answersByShortDescription) {
  const approvedPerson = {
    fullName:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.APPROVED_PERSON.fields.NAME
      ],
    email:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.APPROVED_PERSON.fields.EMAIL
      ],
    phone:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.APPROVED_PERSON.fields.TELEPHONE_NUMBER
      ],
    title:
      answersByShortDescription[
        FORM_PAGES.REGISTRATION.APPROVED_PERSON.fields.JOB_TITLE
      ]
  }

  return [approvedPerson]
}
