# 2025 Registration & Accreditation applications: High Level Design

For 2025 pEPR registration & accreditation applications, we will be using Defra Forms created and managed by the EA.

The diagram below describes a high-level view of how we understand the integration points between those forms
and a pEPR backend service. This is subject to further negotiation and change as the project evolves.

```mermaid
C4Component

Person(operator, "Operator")
Person_Ext(regulator, "Regulator")

Container_Boundary(defraForms, "Defra Forms: varies by region") {
    Component(organisationForm, "Organisation Form", "Sent once")
    Component(reExRegForm, "Registration Forms", "Sent for: activity, site")
    Component(reExAccForm, "Accreditation Forms", "Sent for: activity, site & material")
}

Container_Boundary(regAccFormsAPI, "Exporter Accreditation API") {
    Component(organisationFormEndpoint, "Organisation Form Endpoint", "Receives organisation data")
    Component(reExRegFormEndpoint, "Registration Form Endpoint", "Reprocessor or exporter")
    Component(reExAccFormEndpoint, "Accreditation Form Endpoint", "Reprocessor or exporter")
    Component(organisationIdGenerator, "Organisation ID generator", "Generates Organisation ID")
    SystemDb(docDb, "Document Database")
}

BiRel(operator, organisationForm, "Uses")
BiRel(operator, reExRegForm, "Uses")
BiRel(operator, reExAccForm, "Uses")
Rel(organisationForm, organisationFormEndpoint, "Posts to")
BiRel(organisationFormEndpoint, organisationIdGenerator, "Calls")
Rel(reExRegForm, reExRegFormEndpoint, "Posts to")
Rel(reExAccForm, reExAccFormEndpoint, "Posts to")
Rel(organisationFormEndpoint, docDb, "Updates")
Rel(reExRegFormEndpoint, docDb, "Updates")
Rel(reExAccFormEndpoint, docDb, "Updates")
Rel(organisationFormEndpoint, operator, "Sends email via Gov Notify", "Organisation ID, Organisation Name, Reference Number")
Rel(organisationFormEndpoint, regulator, "Sends email via Gov Notify", "Organisation ID, Organisation Name, Reference Number")
Rel(organisationForm, regulator, "Sends email via Gov Notify", "data")
Rel(reExRegForm, regulator, "Sends email via Gov Notify", "data & attachments")
Rel(reExAccForm, regulator, "Sends email via Gov Notify", "data & attachments")

%% Styles
UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
UpdateElementStyle(regulator, $bgColor="grey")
UpdateRelStyle(organisationFormEndpoint, operator, "red", "red", "-220", "-215")
UpdateRelStyle(organisationFormEndpoint, regulator, "red", "red", "-50", "115")
UpdateRelStyle(organisationForm, regulator, "red", "red", "0", "-50")
UpdateRelStyle(reExRegForm, regulator, "red", "red", "0", "-50")
UpdateRelStyle(reExAccForm, regulator, "red", "red", "0", "-50")
UpdateRelStyle(operator, organisationForm, $offsetX="0", $offsetY="-50")
UpdateRelStyle(operator, reExRegForm, $offsetX="-70", $offsetY="-50")
UpdateRelStyle(operator, reExAccForm, $offsetX="-130", $offsetY="-50")
```
