# Accreditation to Registration Linking Analysis

**Date:** 2025-12-01
**Source:** CDP Logs from link-submissions process

---

## 1. Executive Summary

### Overall Unlinked Accreditations Count

- **Total organisations with unlinked accreditations:** 42
- **Total unlinked accreditations:** 60

### Key Finding: Duplicate Accreditation Submissions

**Most organisations (30 out of 42, 71%) with "unlinked" accreditations actually DO have matching registrations**, but submitted multiple duplicate accreditations that match the same registration. The system resolved this by picking the latest accreditation by `formSubmissionTime`.

### Breakdown by Category

| Category                                                        | Org Count | Unlinked Acc Count | Description                                                                                                    |
| --------------------------------------------------------------- | --------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Category A: Duplicate Accreditations Matching Registrations** | 30        | 47                 | Multiple accs submitted for same registration(s), system picked latest, others remain "unlinked"               |
| **Category B: No Matching Registration in Logs**                | 7         | 8                  | Accreditations with no matching registration found (note: logs only show unlinked, not successful 1:1 matches) |
| **Category C: Genuine Mismatches**                              | 5         | 5                  | Registration exists but can't be linked due to material/site/type differences                                  |
| **TOTAL**                                                       | **42**    | **60**             |                                                                                                                |

---

## 2. Category Analysis

### Category A: Duplicate Accreditations Matching Registrations (30 organisations, 47 unlinked accreditations)

These organisations submitted 2+ accreditations that match the same registration(s). The system picked the **latest by formSubmissionTime**, leaving the others as "unlinked".

#### Org 500033 - 3 Plastic Exporter Accreditations → 2 Registrations

**Accreditations (all match):**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68dbafc059af7231ada7d256 | exporter | plastic  | Unlinked              |
| 68dbea56a1b11ef518e79e6d | exporter | plastic  | Unlinked              |
| 68dc05b45030f862e1cea281 | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68dc045d92124682f63c54a8 | exporter | plastic  |
| 68dcce5c92124682f63c54b9 | exporter | plastic  |

**Issue:** 3 accreditations for 2 registrations = at least 1 duplicate submission

---

#### Org 500096 - 2 Aluminium Exporter Accreditations → 3 Registrations

**Accreditations:**

| ID                       | Type     | Material  | Status                |
| ------------------------ | -------- | --------- | --------------------- |
| 68dfbf0e03f72cb308097e85 | exporter | aluminium | Unlinked              |
| 68dfcab54c348c1a3a5f7a8e | exporter | aluminium | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material  |
| ------------------------ | -------- | --------- |
| 68dd4c655030f862e1cea29a | exporter | aluminium |
| 68dd51be03f72cb308097e71 | exporter | aluminium |
| 68dd803da6f1a129939a9612 | exporter | aluminium |

**Issue:** 2 accreditations for 3 registrations = duplicate accreditation submission

---

#### Org 500097 - 2 Plastic Exporter Accreditations → 2 Registrations

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68da895e6b210b5f0dc9781d | exporter | plastic  | Unlinked              |
| 68dc0f6c92124682f63c54ae | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68da81fc36df5854a3d8e4ac | exporter | plastic  |
| 68dc0be216174b442b27f638 | exporter | plastic  |

**Issue:** 2 accreditations for 2 registrations = can't determine 1:1 pairing

---

#### Org 500112 - 2 Paper Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68d670356b210b5f0dc977e6 | exporter | paper    | Unlinked              |
| 68da92d1c020f0e3dff14276 | exporter | paper    | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68e69abfa665a7c58c32afed | exporter | paper    |

**Issue:** 2 accreditations for 1 registration = clear duplicate

---

#### Org 500122 - 2 Plastic Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68d546346b210b5f0dc977d0 | exporter | plastic  | Unlinked              |
| 68da45bdc020f0e3dff14262 | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68da471ec020f0e3dff14264 | exporter | plastic  |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500131 - 3 Plastic Exporter Accreditations → 2 Registrations

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68d69fb5c020f0e3dff14253 | exporter | plastic  | Unlinked              |
| 68d954f56b210b5f0dc977fe | exporter | plastic  | Unlinked              |
| 68daaf9a59af7231ada7d243 | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68d69ad3c020f0e3dff14252 | exporter | plastic  |
| 68da9750c020f0e3dff14278 | exporter | plastic  |

**Issue:** 3 accreditations for 2 registrations = at least 1 duplicate

---

#### Org 500153 - 2+ Plastic Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type        | Material | Status                |
| ------------------------ | ----------- | -------- | --------------------- |
| 68dbe255c9947d5a6fd51de5 | reprocessor | plastic  | Unlinked              |
| 68dbef6359af7231ada7d27a | reprocessor | plastic  | Unlinked              |
| 68f6487c46f7e6e8dbddb37e | exporter    | plastic  | Unlinked              |
| 68f788ea86bf5bb42795dade | exporter    | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68dbdcd2c9947d5a6fd51de1 | exporter | plastic  |

**Issue:** 2 reprocessor accs + 2 exporter accs, but only 1 exporter registration = type mismatch + duplicates

---

#### Org 500156 - 2 Steel Exporter Accreditations → 3 Registrations

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68dbfc9ec9947d5a6fd51df6 | exporter | steel    | Unlinked              |
| 68dcfef316174b442b27f64d | exporter | steel    | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68dbef1459af7231ada7d279 | exporter | steel    |
| 68dbf884c9947d5a6fd51df5 | exporter | steel    |
| 68e5224526c95ad560b8cf2a | exporter | steel    |

**Issue:** 2 accreditations for 3 registrations = duplicate accreditation

---

#### Org 500169 - 2 Aluminium Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material  | Status                |
| ------------------------ | -------- | --------- | --------------------- |
| 68dba4acc9947d5a6fd51dc6 | exporter | aluminium | Unlinked              |
| 68dbced5a1b11ef518e79e5c | exporter | aluminium | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material  |
| ------------------------ | -------- | --------- |
| 68dbcd4ea1b11ef518e79e59 | exporter | aluminium |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500175 - 2 Aluminium Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material  | Status                |
| ------------------------ | -------- | --------- | --------------------- |
| 68d42a3f72920609584d43d7 | exporter | aluminium | Unlinked              |
| 68d51d9c72920609584d43df | exporter | aluminium | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material  |
| ------------------------ | -------- | --------- |
| 68d418470020081ebf764a99 | exporter | aluminium |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500212 - 2 Glass Exporter Accreditations → 2-3 Registrations

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68da509cc020f0e3dff14266 | exporter | glass    | Unlinked              |
| 68da54d66b210b5f0dc97808 | exporter | glass    | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68dba70e59af7231ada7d252 | exporter | **wood** |
| 68d9b03e6b210b5f0dc97801 | exporter | glass    |
| 68da535736df5854a3d8e494 | exporter | glass    |

**Issue:** 2 glass accreditations for 2 glass registrations (plus 1 wood registration) = material confusion + duplicates

---

#### Org 500268 - 3 Plastic Exporter Accreditations → 2 Registrations

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68dd4b5f92124682f63c54c9 | exporter | plastic  | Unlinked              |
| 68dfb0824c348c1a3a5f7a8c | exporter | plastic  | Unlinked              |
| 68dfc0bda6f1a129939a9619 | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68da695436df5854a3d8e4a4 | exporter | plastic  |
| 68dd338d5030f862e1cea297 | exporter | plastic  |

**Issue:** 3 accreditations for 2 registrations = at least 1 duplicate

---

#### Org 500308 - 2 Plastic Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68dc03c35030f862e1cea27f | exporter | plastic  | Unlinked              |
| 68dd33dd5030f862e1cea298 | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68dbffc1c9947d5a6fd51df8 | exporter | plastic  |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500371 - 2 Plastic Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68de82664c348c1a3a5f7a88 | exporter | plastic  | Unlinked              |
| 68e678f626c95ad560b8cf2d | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68e630052bbd3d6f90449746 | exporter | plastic  |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500398 - 2 Glass Exporter Accreditations → 2 Registrations

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 691de74441543cebb93a108d | exporter | glass    | Unlinked              |
| 691df509533b759ee5e7e2a9 | exporter | glass    | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 691de3c74ba7b34a6b2c7b6f | exporter | glass    |
| 691df45c34ba82d8a2719eda | exporter | glass    |

**Issue:** 2 accreditations for 2 registrations = can't determine 1:1 pairing

---

#### Org 500036 - 2 Plastic Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material | Status                |
| ------------------------ | -------- | -------- | --------------------- |
| 68d99c776b210b5f0dc977ff | exporter | plastic  | Unlinked              |
| 68da5978c020f0e3dff14268 | exporter | plastic  | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68d863d46b210b5f0dc977f9 | exporter | plastic  |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500068 - 2 Aluminium Exporter Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type     | Material  | Status                |
| ------------------------ | -------- | --------- | --------------------- |
| 68daa2c2c9947d5a6fd51db3 | exporter | aluminium | Unlinked              |
| 68ff7f643367f2d4e35991ac | exporter | aluminium | **Selected (latest)** |

**Registrations:**

| ID                       | Type     | Material  |
| ------------------------ | -------- | --------- |
| 6900d580e920a2af323422e2 | exporter | aluminium |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500095 - Multiple Plastic Reprocessor Accreditations (7 unlinked) → Registrations exist

**Accreditations (partial list):**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68d4135e0b2fa615b97c678a | reprocessor | plastic  | line1=f366bb88... | Unlinked     |
| 68d421230020081ebf764a9a | reprocessor | plastic  | line1=f366bb88... | Unlinked     |
| 68d422190b2fa615b97c678d | reprocessor | plastic  | line1=e169fcba... | Unlinked     |
| 68d4ffa50b2fa615b97c6791 | reprocessor | plastic  | line1=f366bb88... | Unlinked     |
| 68d51b5d0020081ebf764aa1 | reprocessor | plastic  | line1=f366bb88... | Unlinked     |
| 68d552dec020f0e3dff14242 | reprocessor | plastic  | line1=f366bb88... | Unlinked     |
| 68d64d736b210b5f0dc977dc | reprocessor | plastic  | line1=f366bb88... | Unlinked     |
| 68d653576b210b5f0dc977e1 | reprocessor | plastic  | line1=f366bb88... | **Selected** |
| 68d64f7636df5854a3d8e474 | reprocessor | plastic  | line1=e169fcba... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68d40ebb0b2fa615b97c6789 | reprocessor | plastic  | line1=f366bb88... |
| 68d41c060b2fa615b97c678b | reprocessor | plastic  | line1=e169fcba... |

**Issue:** 7 accreditations (6 for site f366bb88, 1 for site e169fcba) → 2 registrations = massive duplication

---

#### Org 500145 - 2 Glass Reprocessor Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68dbc992a1b11ef518e79e53 | reprocessor | glass    | line1=6ad93ca1... | Unlinked     |
| 68dbfa5b59af7231ada7d281 | reprocessor | glass    | line1=6ad93ca1... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68dbbfd1a1b11ef518e79e4c | reprocessor | glass    | line1=3de4728d... |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500147 - 2 Plastic Reprocessor Accreditations → 3 Registrations

**Accreditations:**

| ID                       | Type        | Material | Site                                | Status       |
| ------------------------ | ----------- | -------- | ----------------------------------- | ------------ |
| 68db983859af7231ada7d24c | reprocessor | plastic  | line1=733ad137..., postcode=...8f3d | Unlinked     |
| 68db9a5f59af7231ada7d24e | reprocessor | plastic  | line1=733ad137..., postcode=...8f3d | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site                               |
| ------------------------ | ----------- | -------- | ---------------------------------- |
| 68db981dc9947d5a6fd51dc2 | reprocessor | plastic  | line1=2f7061e..., postcode=...8f3d |
| 68db9d5959af7231ada7d24f | reprocessor | plastic  | line1=2f7061e..., postcode=...8f3d |
| 68dba819c9947d5a6fd51dc7 | reprocessor | plastic  | line1=2f7061e..., postcode=...8f3d |

**Issue:** 2 accs with line1=733ad137 but 3 regs with line1=2f7061e (same postcode) = site address mismatch + duplicates

---

#### Org 500173 - 5 Reprocessor Accreditations → 7 Registrations (Mixed materials)

**Accreditations:**

| ID                       | Type        | Material | Site                                 | Status       |
| ------------------------ | ----------- | -------- | ------------------------------------ | ------------ |
| 68dd635da6f1a129939a960d | reprocessor | plastic  | line1=15d2ccf..., postcode=...8a6717 | Unlinked     |
| 68dd6419a6f1a129939a960e | reprocessor | plastic  | line1=15d2ccf..., postcode=...8a6717 | Unlinked     |
| 68dd785d4c348c1a3a5f7a81 | reprocessor | plastic  | line1=15d2ccf..., postcode=...8a6717 | **Selected** |
| 68e3a5eda6f1a129939a961c | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 | Unlinked     |
| 68f24e587c2ed68483b629d9 | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site                                 |
| ------------------------ | ----------- | -------- | ------------------------------------ |
| 68dd45dd16174b442b27f65a | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 |
| 68dd4d5892124682f63c54ca | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 |
| 68dd58114c348c1a3a5f7a7d | reprocessor | plastic  | line1=15d2ccf..., postcode=...8a6717 |
| 68dd585003f72cb308097e74 | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 |
| 68dd67794c348c1a3a5f7a80 | reprocessor | plastic  | line1=15d2ccf..., postcode=...8a6717 |
| 68dd6844a6f1a129939a960f | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 |
| 68e3afe6a6f1a129939a961d | reprocessor | glass    | line1=ff3e112..., postcode=...27ab88 |

**Issue:** Complex - 3 plastic reprocessor accs (2 unlinked) + 2 glass reprocessor accs (1 unlinked) = duplicates across 2 materials

---

#### Org 500192 - 2 Plastic Reprocessor Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68d68d76c020f0e3dff14250 | reprocessor | plastic  | line1=3b004f9a... | Unlinked     |
| 68da622d36df5854a3d8e49d | reprocessor | plastic  | line1=3b004f9a... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68d4037b0b2fa615b97c6787 | reprocessor | plastic  | line1=3b004f9a... |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500216 - 4 Glass Reprocessor Accreditations → 4 Registrations

**Accreditations:**

| ID                       | Type        | Material | Site             | Status       |
| ------------------------ | ----------- | -------- | ---------------- | ------------ |
| 68dbb9f2c9947d5a6fd51dce | reprocessor | glass    | line1=360ca04... | Unlinked     |
| 68dbe00dc9947d5a6fd51de4 | reprocessor | glass    | line1=360ca04... | **Selected** |
| 68dbf20b59af7231ada7d27b | reprocessor | glass    | line1=714518a... | Unlinked     |
| 68dbf8d8a1b11ef518e79e7c | reprocessor | glass    | line1=714518a... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site             |
| ------------------------ | ----------- | -------- | ---------------- |
| 68dbabdda1b11ef518e79e47 | reprocessor | glass    | line1=360ca04... |
| 68dbdcf0a1b11ef518e79e66 | reprocessor | glass    | line1=360ca04... |
| 68dbef73a1b11ef518e79e73 | reprocessor | glass    | line1=45f56bb... |
| 68dbf6a4c9947d5a6fd51df3 | reprocessor | glass    | line1=45f56bb... |

**Issue:** 2 sites, each with 2 accs and 2 regs = can't determine 1:1 pairing for each site

---

#### Org 500240 - 2 Plastic Reprocessor Accreditations → 2 Registrations

**Accreditations:**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68da9a45c020f0e3dff1427a | reprocessor | plastic  | line1=cc97623b... | Unlinked     |
| 68dbbf5859af7231ada7d25c | reprocessor | plastic  | line1=cc97623b... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site             |
| ------------------------ | ----------- | -------- | ---------------- |
| 68da638336df5854a3d8e49f | reprocessor | plastic  | line1=9fa6478... |
| 68dbbb24a1b11ef518e79e49 | reprocessor | plastic  | line1=9fa6478... |

**Issue:** 2 accs with line1=cc97623b, 2 regs with line1=9fa6478 (same postcode) = site address mismatch

---

#### Org 500253 - 3 Glass Reprocessor Accreditations → 3 Registrations

**Accreditations:**

| ID                       | Type        | Material | Site                                       | Status       |
| ------------------------ | ----------- | -------- | ------------------------------------------ | ------------ |
| 68d54dee6b210b5f0dc977d2 | reprocessor | glass    | line1=36caf8be..., postcode=25eb1e4b...601 | Unlinked     |
| 68dbe71959af7231ada7d272 | reprocessor | glass    | line1=36caf8be..., postcode=25eb1e4b...601 | Unlinked     |
| 68fa1b8d24ea107cc265d634 | reprocessor | glass    | line1=36caf8be..., postcode=25eb1e4b...601 | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site                                       |
| ------------------------ | ----------- | -------- | ------------------------------------------ |
| 68d5595dc020f0e3dff14244 | reprocessor | glass    | line1=36caf8be..., postcode=25eb1e4b...601 |
| 68dbe69e59af7231ada7d271 | reprocessor | glass    | line1=36caf8be..., postcode=25eb1e4b...601 |
| 68dbe79559af7231ada7d273 | reprocessor | glass    | line1=36caf8be..., postcode=25eb1e4b...601 |

**Issue:** 3 accs with same site + 3 regs with same site = can't determine 1:1 pairing

---

#### Org 500293 - 2 Plastic Reprocessor Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68da3b6636df5854a3d8e48d | reprocessor | plastic  | line1=c660fb86... | Unlinked     |
| 68db89ffc9947d5a6fd51dbe | reprocessor | plastic  | line1=c660fb86... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68da3198c020f0e3dff1425f | reprocessor | plastic  | line1=c660fb86... |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500296 - 2 Paper Reprocessor Accreditations → 1 Fibre Registration

**Accreditations:**

| ID                       | Type        | Material  | Site              | Status       |
| ------------------------ | ----------- | --------- | ----------------- | ------------ |
| 68f9dbc5745ea703b2ba0378 | reprocessor | **paper** | line1=0b681030... | Unlinked     |
| 690cca592fa0483b1a1eec89 | reprocessor | **paper** | line1=cb7ce63b... | **Selected** |

**Registrations:**

| ID                       | Type        | Material  | Site              |
| ------------------------ | ----------- | --------- | ----------------- |
| 68d67cc6c020f0e3dff1424f | reprocessor | **paper** | line1=023c4271... |
| 68d675f66b210b5f0dc977e8 | reprocessor | **fibre** | line1=023c4271... |

**Issue:** Material mismatch (paper vs fibre) + duplicate accreditations

---

#### Org 500331 - 2 Plastic Reprocessor Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68db9f58c9947d5a6fd51dc3 | reprocessor | plastic  | line1=4f223b12... | Unlinked     |
| 6908d485b41a572eeaf49be6 | reprocessor | plastic  | line1=4f223b12... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 6908cb7142639c7f37306a85 | reprocessor | plastic  | line1=4f223b12... |

**Issue:** 2 accreditations for 1 registration = duplicate

---

#### Org 500341 - 2 Plastic Reprocessor Accreditations → 1 Registration

**Accreditations:**

| ID                       | Type        | Material | Site              | Status       |
| ------------------------ | ----------- | -------- | ----------------- | ------------ |
| 68e42181a6f1a129939a9620 | reprocessor | plastic  | line1=f5923e6d... | Unlinked     |
| 68e4cf7ea6f1a129939a9621 | reprocessor | plastic  | line1=f5923e6d... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68e3e182a6f1a129939a961f | reprocessor | plastic  | line1=ac6b1e17... |

**Issue:** 2 accs with line1=f5923e6d, 1 reg with line1=ac6b1e17 (same postcode partial) = site mismatch + duplicate

---

#### Org 500367 - 4 Plastic Reprocessor Accreditations → 2 Registrations

**Accreditations:**

| ID                       | Type        | Material | Site                | Status       |
| ------------------------ | ----------- | -------- | ------------------- | ------------ |
| 68e7a3d226c95ad560b8cf31 | reprocessor | plastic  | line1=c8c2431846... | Unlinked     |
| 68f898e10e70dc26ede14a25 | reprocessor | plastic  | line1=c8c2431846... | Unlinked     |
| 690c799933b1bc210f581df5 | reprocessor | plastic  | line1=c8c2431846... | Unlinked     |
| 690c82d333b1bc210f581df6 | reprocessor | plastic  | line1=c8c2431846... | **Selected** |

**Registrations:**

| ID                       | Type        | Material | Site             |
| ------------------------ | ----------- | -------- | ---------------- |
| 68dfe62a03f72cb308097e88 | reprocessor | plastic  | line1=550f31b... |
| 68dffbb903f72cb308097e89 | reprocessor | plastic  | line1=550f31b... |

**Issue:** 4 accs with line1=c8c2431846, 2 regs with line1=550f31b (same postcode) = site mismatch + duplicates

---

### Category B: No Matching Registration in Logs (7 organisations, 8 accreditations)

These accreditations have no matching registration found in the logs. **Note:** The logs only capture unlinked accreditations - organisations with successful 1:1 matches do not appear in these logs at all.

#### Org 500328

**Unlinked Accreditations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 69036401f7b7facb235f66cb | exporter | steel    |

**Available Registrations:** None

---

#### Org 500354

**Unlinked Accreditations:**

| ID                       | Type     | Material |
| ------------------------ | -------- | -------- |
| 68dd063116174b442b27f64f | exporter | plastic  |

**Available Registrations:** None

---

#### Org 500349

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68dbd352c9947d5a6fd51dda | reprocessor | plastic  | line1=8371ff36... |

**Available Registrations:** None

---

#### Org 500029

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site                                    |
| ------------------------ | ----------- | -------- | --------------------------------------- |
| 68beacef8b01e2c72732cb20 | reprocessor | fibre    | line1=69a62bcd..., postcode=11a0b51f... |

**Available Registrations:** None

---

#### Org 500059

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 68d6b52cc020f0e3dff14257 | reprocessor | paper    | line1=eedf3a31... |

**Available Registrations:** None

---

#### Org 500394

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site              |
| ------------------------ | ----------- | -------- | ----------------- |
| 6908ce36476b4da7301beb20 | reprocessor | plastic  | line1=e33cd81b... |

**Available Registrations:** None

---

#### Org 500155 - 2 Accreditations

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site                                        |
| ------------------------ | ----------- | -------- | ------------------------------------------- |
| 68d9d63a36df5854a3d8e48c | reprocessor | plastic  | line1=76755d48..., postcode=51dcb18e...489b |
| 68dc21615030f862e1cea287 | reprocessor | plastic  | line1=76755d48..., postcode=51dcb18e...489b |

**Available Registrations:** None

**Note:** 2 duplicate accreditations with same site, both unlinked, no registrations

---

### Category C: Genuine Mismatches (5 organisations, 5 accreditations)

These organisations have registrations BUT cannot be linked due to material/site/type differences.

#### Org 500038 - Material Mismatch (Paper vs Fibre)

**Unlinked Accreditations:**

| ID                       | Type     | Material  |
| ------------------------ | -------- | --------- |
| 68cc1eb172466d35dea8c4f5 | exporter | **paper** |

**Registrations:**

| ID                       | Type     | Material  |
| ------------------------ | -------- | --------- |
| 68cc150c03f3b8ccb2b528b1 | exporter | **fibre** |

**Issue:** Material mismatch - paper accreditation vs fibre registration

---

#### Org 500054 - Site Mismatch (Different Postcode)

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site                                           |
| ------------------------ | ----------- | -------- | ---------------------------------------------- |
| 68c7e69f72466d35dea8c4e1 | reprocessor | glass    | line1=eaa1136b..., **postcode=...adc5a585...** |

**Registrations:**

| ID                       | Type        | Material | Site                                           |
| ------------------------ | ----------- | -------- | ---------------------------------------------- |
| 68c7e4f0b317e054d84fda46 | reprocessor | glass    | line1=eaa1136b..., **postcode=...eed4cb9e...** |

**Issue:** Same material, type, line1 prefix, but different postcode

---

#### Org 500039 - Site Mismatch (Different Postcode)

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site                                           |
| ------------------------ | ----------- | -------- | ---------------------------------------------- |
| 68b6b8ad3ef5214486dbaa81 | reprocessor | plastic  | line1=aa19d73e..., **postcode=99cde7a4...777** |

**Registrations:**

| ID                       | Type        | Material | Site                                            |
| ------------------------ | ----------- | -------- | ----------------------------------------------- |
| 68b5bca4dc72adf117875595 | reprocessor | plastic  | line1=aa19d73e..., **postcode=...eafca4a...d7** |

**Issue:** Same material, type, line1 prefix, but different postcode

---

#### Org 500319 - Site Mismatch (Different Postcode)

**Unlinked Accreditations:**

| ID                       | Type        | Material | Site                                           |
| ------------------------ | ----------- | -------- | ---------------------------------------------- |
| 68dbda7ac9947d5a6fd51ddf | reprocessor | plastic  | line1=fb287d47..., **postcode=...df86bc6f...** |

**Registrations:**

| ID                       | Type        | Material | Site                                           |
| ------------------------ | ----------- | -------- | ---------------------------------------------- |
| 68da811936df5854a3d8e4ab | reprocessor | plastic  | line1=fb287d47..., **postcode=...babeb1e0...** |

**Issue:** Same material, type, line1 prefix, but different postcode

---

#### Org 500322 - Type Mismatch (Reprocessor vs Exporters)

**Unlinked Accreditations:**

| ID                       | Type            | Material  | Site                                       |
| ------------------------ | --------------- | --------- | ------------------------------------------ |
| 68efc5c42bbd3d6f90449749 | **reprocessor** | aluminium | line1=9e174ec1..., postcode=...b4858d76... |

**Registrations:**

| ID                       | Type         | Material  |
| ------------------------ | ------------ | --------- |
| 68dcec935030f862e1cea28e | **exporter** | aluminium |
| 68dd01d516174b442b27f64e | **exporter** | steel     |
| 68dd05e992124682f63c54c0 | **exporter** | steel     |
| 68dd06f016174b442b27f650 | **exporter** | aluminium |
| 68dd07af92124682f63c54c1 | **exporter** | aluminium |

[ACCREDITATION_LINKING_CORRECTED.md](ACCREDITATION_LINKING_CORRECTED.md)
**Issue:** Reprocessor accreditation vs 5 exporter registrations (type mismatch)

---
