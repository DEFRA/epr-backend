# 2025 Registration & Accreditation applications: Low Level Design

For 2025 pEPR registration & accreditation applications, we will be using Defra Forms created and managed by the EA.

Please see the [High Level Design](./2025-reg-acc-hld.md) for an overview.

## Project scope

We need to deliver an API Service hosted on CDP (Core Delivery Platform) providing multiple endpoints that each:

### Functional requirements

1. Accept form submission data in JSON from an associated Defra Form(s)
2. Minimally map the submitted data to the relevant entity schema
3. Store the submitted data in a schema versioned and minimally validated collection
4. Optionally send an email via Gov Notify to the nominated email address in the form data with further information, e.g. `orgId` & `orgName`

> [!NOTE]
> The Defra forms will call the API Service endpoints be the `onSave` page event, [see docs](https://defra.github.io/forms-engine-plugin/features/configuration-based/PAGE_EVENTS.html).

### Non-functional requirements

1. Open source codebase, secured with security and dependency scanning
2. Is secured by the CDP protected zone, including egress proxy setup
3. Handle secrets in a secure manner
4. Handle PII (Personally Identifiable Information) in a GDPR-compliant manner
5. Leverages observability instrumentation:
   1. Metrics, including a "single-pane of glass" dashboard
   2. Logging, including a "single-pane of glass" dashboard
   3. Alerting, including an out of hours support structure
6. Auditing for any events that mutate data stored in the system
7. Playbook(s) for resolving common issues in support

## Technical approach

### Endpoint: `POST` `/v1/apply/organisation`

```mermaid
flowchart TD;

%% Styles
classDef user fill:#FF8870,stroke:#5E342B,stroke-width:2px
classDef service fill:#6B72FF,stroke:#27295E,stroke-width:2px

%% Entities
operator[Operator or Consultant]
regulator[Regulator]
form[Organisation Defra form]
endpoint([POST apply/organisation])
idGenerator[[orgId generator]]
database((Collection: \n Organisation))
govNotify{{GovNotify}}

%% Flow
operator:::user --submits-->form
form-.calls.->endpoint:::service
form--sends email with: form data-->regulator
endpoint:::service <-.calls.->idGenerator:::service
endpoint:::service -.stores.->database:::service
endpoint-.calls.->govNotify
govNotify--sends email with: orgId & orgName-->operator

%% Legend
subgraph legend [Legend]
  User:::user
  apiService[API Service]:::service
end
```

#### Success case

```mermaid
sequenceDiagram
  participant Operator
  participant Defra Forms
  participant API Service
  participant Regulator
  Operator->>Defra Forms: submits organisation form
  Defra Forms->>Regulator: sends email containing form data
  Defra Forms->>API Service: sends JSON form data
  API Service->>API Service: generates orgId
  API Service->>Defra Forms: responds with orgId & orgName
  API Service->>Operator: sends email with orgId & orgName
  Defra Forms->>Operator: renders success page with orgId & orgName
```

#### Error case

This case should only happen if there are technical issues with the API Service or Gov Notify

> [!WARNING]
> This results in the Regulator receiving the form submission data, but that data may not be stored in the database of the API Service

```mermaid
sequenceDiagram
  participant Operator
  participant Defra Forms
  participant API Service
  participant Regulator
  Operator->>Defra Forms: submits organisation form
  Defra Forms->>Regulator: sends email containing form data
  Defra Forms->>API Service: sends JSON form data
  API Service->>Defra Forms: responds with error
  Defra Forms->>Operator: renders error message
```

### Endpoint: `POST` `/v1/apply/registration`

```mermaid
flowchart TD;

%% Styles
classDef user fill:#FF8870,stroke:#5E342B,stroke-width:2px
classDef service fill:#6B72FF,stroke:#27295E,stroke-width:2px

%% Entities
operator[Operator or Consultant]
regulator[Regulator]
form[Registration Defra form]
endpoint([POST apply/registration])
database((Collection: \n Registration))

%% Flow
operator:::user --submits-->form
form-.calls.->endpoint:::service
form--sends email with: form data-->regulator
endpoint:::service -.stores.->database:::service

%% Legend
subgraph legend [Legend]
  User:::user
  apiService[API Service]:::service
end
```

#### Success case

```mermaid
sequenceDiagram
  participant Operator
  participant Defra Forms
  participant API Service
  participant Regulator
  Operator->>Defra Forms: submits registration form with orgId
  Defra Forms->>Regulator: sends email containing form data
  Defra Forms->>API Service: sends JSON form data
  API Service->>Defra Forms: responds with success
  Defra Forms->>Operator: renders success page
```

#### Error case

This case should only happen if there are technical issues with the API Service or Gov Notify

> [!WARNING]
> This results in the Regulator receiving the form submission data, but that data may not be stored in the database of the API Service

```mermaid
sequenceDiagram
  participant Operator
  participant Defra Forms
  participant API Service
  participant Regulator
  Operator->>Defra Forms: submits registration form with orgId
  Defra Forms->>Regulator: sends email containing form data
  Defra Forms->>API Service: sends JSON form data
  API Service->>Defra Forms: responds with error
  Defra Forms->>Operator: renders error message
```

### Endpoint: `POST` `/v1/apply/accreditation`

```mermaid
flowchart TD;

%% Styles
classDef user fill:#FF8870,stroke:#5E342B,stroke-width:2px
classDef service fill:#6B72FF,stroke:#27295E,stroke-width:2px

%% Entities
operator[Operator or Consultant]
regulator[Regulator]
form[Accreditation Defra form]
endpoint([POST apply/accreditation])
database((Collection: \n Accreditation))

%% Flow
operator:::user --submits-->form
form-.calls.->endpoint:::service
form--sends email with: form data-->regulator
endpoint:::service -.stores.->database:::service

%% Legend
subgraph legend [Legend]
  User:::user
  apiService[API Service]:::service
end
```

#### Success case

```mermaid
sequenceDiagram
  participant Operator
  participant Defra Forms
  participant API Service
  participant Regulator
  Operator->>Defra Forms: submits accreditation form with orgId
  Defra Forms->>Regulator: sends email containing form data
  Defra Forms->>API Service: sends JSON form data
  API Service->>Defra Forms: responds with success
  Defra Forms->>Operator: renders success page
```

#### Error case

This case should only happen if there are technical issues with the API Service or Gov Notify

> [!WARNING]
> This results in the Regulator receiving the form submission data, but that data may not be stored in the database of the API Service

```mermaid
sequenceDiagram
  participant Operator
  participant Defra Forms
  participant API Service
  participant Regulator
  Operator->>Defra Forms: submits accreditation form with orgId
  Defra Forms->>Regulator: sends email containing form data
  Defra Forms->>API Service: sends JSON form data
  API Service->>Defra Forms: responds with error
  Defra Forms->>Operator: renders error message
```

### Database mappings

The API Service database collections will be mapped to one another via a foreign key on the `REGISTRATION` and `ACCREDITATION` entities which correspond to the primary key on the `ORGANISATION` entity.

> [!IMPORTANT]
> All Defra forms field values will be stored in the `rawSubmissionData` database field.
>
> Fields that are not schema-validated are mapped as cloned values for debugging convenience.
> This process will be undertaken on a "best-efforts" basis and depending on the data quality these non-validated fields may be empty if they can't be mapped

All entities will contain embedded entities for `ADDRESS`

```mermaid
erDiagram

%% Entities
ORGANISATION
REGISTRATION["REGISTRATION: one per activity/site"]
ACCREDITATION["ACCREDITATION: one per activity/site/material"]
ADDRESS

%% Structure
ORGANISATION {
  primaryKey _id PK "schema validated"
  int schema_version "schema validated"
  enum region "nullable"
  string orgName "nullable"
  ADDRESS address "nullable"
  json rawSubmissionData "schema validated"
}

REGISTRATION {
  primaryKey _id PK "schema validated"
  foreignKey orgId FK "schema validated"
  int schema_version "schema validated"
  enum region "nullable"
  enum activity "nullable"
  ADDRESS site "nullable"
  enum materials "nullable"
  json rawSubmissionData "schema validated"
}

ACCREDITATION {
  primaryKey _id PK "schema validated"
  foreignKey orgId FK "schema validated"
  int schema_version "schema validated"
  enum region "nullable"
  enum activity "nullable"
  ADDRESS site "nullable"
  enum material "nullable"
  enum tonnageBand "nullable"
  json rawSubmissionData "schema validated"
}

ADDRESS {
  string lineOne "nullable"
  string lineTwo "nullable"
  string townCity "nullable"
  string county "nullable"
  string postcode "nullable"
  string gridRef "nullable"
}

%% Relationships
ORGANISATION ||--|| ADDRESS : contains
REGISTRATION ||--|| ADDRESS : contains
ACCREDITATION ||--|| ADDRESS : contains
ORGANISATION ||--|{ REGISTRATION : "relates to"
ORGANISATION ||--|{ ACCREDITATION : "relates to"
```
