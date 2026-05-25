# Technical Documentation: `LA_v5-11 max_size (debug).xlsx`

This document describes the Excel workbook structure, card/combination data sources, core formulas, and data export flow without the user collection (the **LIB** table on the **USER** sheet is not included in this document).

---

## 1. Overall Structure

| Sheet | Purpose |
|------|------------|
| **DATA** | Static Power Query outputs: **CC** table (A1:D279) and **CMB** table (H1:T8825). No formula cells, only loaded values. Empty columns E-G separate the blocks. |
| **USER** | Optimizer UI: **LIB** library, **DECK**, per-card calculated columns (U...), **SUG** hints, lookup tables **LIB_Lookup**, **DECK_Lookup**, **HLRuleset**. About ~160k formulas. |
| **Advanced Controls** | Mode parameters (**AC**, **ACD**), **CC_Total** summary, **Table11** (deck rarity statistics). |
| **Import Controls** | File paths: named cells **CMB_DATA** and **LIB_DATA** (referenced in `workbook.xml` as `'Import Controls'!$D$2` and `...!$D$4`). |
| **Update Log** | Version/planning notes (no formulas). |

Version shown in the **USER** header: `5.10d` (file name is `v5-11`, so naming is inconsistent).

---

## 2. Card and Combination Data Sources

### 2.1. Embedded Power Query (M)

`customXml/item1.xml` contains the **Data Mashup** package; the full M code is in `Formulas/Section1.m` inside that package.

**Primary game-data source:** a JSON file whose path is read from the named cell **`CMB_DATA`**:

```text
CMB_File = Excel.CurrentWorkbook(){[Name="CMB_DATA"]}[Content]{0}[Column1],
Source = Json.Document(File.Contents(CMB_File)),
```

On the **Import Controls** sheet, the default file name is **`AlchemyCardData.json`**; full path = `D2` = `CONCAT(folder from CELL("filename"), filename or C3 override)`.

All downstream queries (**Card Details**, **CMB**, **CC**, helper queries such as **Combo List**, **Combo Index Numbers**, etc.) use the same `Json.Document(File.Contents(CMB_File))`: the object model is `card -> fields`, with filter **`FusionAbility = "Orb"`** (only cards that participate in Orb combinations).

**`CMB` query** (simplified logic):

1. From JSON, keep only Orb cards; fields include **CC_A** (card A DisplayName), **Rarity** for A and B, and expanded pairs `card A + card B -> result` via nested joins with **Combo List** and **Card Details**.
2. Compute **Cmb_Num** and **Cmb_ID** from card indexes and combination ordering (fractional part via `/1000`).
3. **Cmb_Rare** = numeric max of A and B rarities (Common->1, Uncommon->2, Rare->3).
4. Pull **Res**, **BA_0O**, **BD_0O**, **Result.Rarity** from **Card Details** for the result card.
5. **Res_Rare**: Common->1 ... Diamond->4.
6. **BA_1O/BD_1O** = `RoundUp(BA_0O/BD_0O + (4 - Res_Rare) * 2.3, 0)`.
7. **BA_2O/BD_2O** = if Diamond then +3 over BA_1O/BD_1O, otherwise +2.

**`CC` query:** list of Orb-card categories with **Cmb_Cntr** (combination count from the fractional part of **Cmb_Num**), plus duplicated rows for the **`:Onyx`** variant (numbering starts at 10001).

**`CC_Total`:** groups **CMB** by **Res_Rare** with combo-type labels (Common / Uncommon / Rare / Diamond).

**`LIB` (user library):** not sourced from card JSON, but from a **second file**:

```text
LIB_File = Excel.CurrentWorkbook(){[Name="LIB_DATA"]}[Content]{0}[Column1],
Source = Excel.Workbook(File.Contents(LIB_File), null, true),
LIB_Table = Source{[Item="LIB",Kind="Table"]}[Data],
```

In other words, it expects a **different Excel file** containing a **LIB** table. The query appends three copies of a compressed **LIB_Length_Setter** template (row placeholders), applies `null`/0/10 replacements, and keeps the **first 300 rows** as the user-collection area.

### 2.2. Connections in `xl/connections.xml`

Defined queries: **Card Details**, **CC**, **CC_Total**, **CMB**, **Combo Cards**, **Combo Index Numbers**, **Combo List**, **Combo List Index**, **LIB**, **LIB_Length_Setter**. All use `Microsoft.Mashup.OleDb.1` with `Data Source=$Workbook$`.

---

## 3. Named Ranges and Tables

- **CMB_DATA** -> path to **AlchemyCardData.json** (combos and card stats).
- **LIB_DATA** -> path to the Excel file containing table **LIB** (collection).
- **CC_NameList** -> `CC[CC_Name]` (for dropdowns).
- **SUG_L** -> `USER!$JS$12:$JS$161` (hints).
- **ExternalData_*** (hidden): sheet fragments used by **Power Query** / filters.

Tables (from `xl/tables/*.xml` and dimensions):

- **CC** - `DATA!A1:D279`: `CC_Num`, `CC_Name`, `CC_Rare`, `Cmb_Cntr`.
- **CMB** - `DATA!H1:T8825`: `Cmb_Num`, `Cmb_ID`, `CC_A`, `CC_B`, `Cmb_Rare`, `Res`, `Res_Rare`, `BA_0O`...`BD_2O`.
- **LIB** - on **USER**, query table; columns **Card**, **Level**, **Fused**, **Quantity**; **ID** is computed as `Card & " (" & Level & ")" & IF(Fused="Yes","ƒ","")`.
- **DECK** - **Card** column; **Name** / **Level** / **Fused** are parsed from card string; **Fused** = last symbol `ƒ`.
- **SUG** - card suggestions from `T` and score matrix `JG:JI`.
- **DECK_Lookup**, **LIB_Lookup** - duplicate ranks, rarity values, and UI counters.

---

## 4. Formula Zones (Without Listing All 160k Cells)

### 4.1. Import Controls

- **B2/B4:** `MID(CELL("filename",A1),1,FIND("[",CELL("filename",A1))-1)` - workbook directory.
- **D2:** `CONCAT(IF(C2="",B2,C2), IF(C3="",B3,C3))` - full path to **CMB** (JSON).
- **B5:** second file name (library sheet) extracted from workbook path.
- **D4:** path to Excel file containing **LIB**.

### 4.2. Advanced Controls (Fragments)

- **B3/B4** etc.: in override mode (`C9="Yes"`), fixed **CHOOSE** values are used; otherwise statistics over **USER!U12:IZ311** (average, MODE.SNGL, thresholds).
- **B6:** formula using **DECK[Fused]** and trigonometry - Fusion bonus based on fused share in deck.
- **B12:** `SUMIF(LIB[Fused],"Yes",LIB[Quantity])` - total fused quantity in library.
- **B19:** `SUBTOTAL(109, CC_Total[Total Combos])`.
- **B22-B25 / D22-D25:** deck rarity counters, linked to **USER!KC** and **Table11**.

### 4.3. USER

- **Row 1 (U1:...):** for each card column, checks `:Onyx` format (`IFERROR(FIND(":",U5)>0,FALSE)`).
- Then follows **one formula template per card column** (Deck00...): a large `IFERROR(SUM(PRODUCT(INDEX(CMB[...], MATCH(...)), ...` expression tied to **CMB**, **AC** (combo mode), row-1 flags, `$P12`, `$S12`, parity, etc. Columns differ only by the reference to "their own" card (AF, AG, AH, ...).

XML table formulas for **DECK_Lookup** / **DECK** repeat the same **CMB** + **AC** logic.

---

## 5. Data Export (Without Collection)

For a reference dataset without **LIB**/**DECK**, export only **DATA** tables:

- File: `assets/excel_export_cc_cmb.json` (~1.8 MB)
- Contents: **278** rows of **CC** and **8824** rows of **CMB** (matching workbook state at export time).

Raw source game JSON: `assets/AlchemyCardData.json`. Excel **CMB/CC** is the **post-Power Query** output (joins, indexes, deduplication, numeric rarities, and derived BA/BD).

---

## 6. Practical Takeaway

- **Card/combination data** in this workbook is produced by loading **`AlchemyCardData.json`** from **Import Controls** and processing it with M script in **Section1.m**.
- **Collection data** lives in a **separate Excel file** via **LIB_DATA** and is loaded into **LIB** on **USER**; it can be excluded when documenting game-content datasets.

---

## 7. Internal Paths in Workbook Metadata

`workbook.xml` may contain an `absPath` (for example, a directory from the workbook author's machine). This does not affect formula logic inside the file; active JSON/library paths are defined through **Import Controls** and named ranges **CMB_DATA** / **LIB_DATA**.

---

## 8. Combo fusion: result level and A/D scaling (game rules vs app)

This section describes how **combo results** (Orb fusion) get their **level** and **attack/defense** after combining two combo cards. It aligns the in-game / wiki model with the Flutter implementation in [`lib/models/combo_battle_stats.dart`](../lib/models/combo_battle_stats.dart) and related UI/optimizer paths.

**Terminology (wiki):** BCC = bronze combo card, SCC = silver, GCC = gold, OCC = onyx combo card. The app maps catalog rarities to [`ComboTier`](../lib/models/combo_tier.dart): Common→bronze, Uncommon→silver, Rare→gold, Diamond→diamond, Onyx→onyx.

### 8.1. What forms a combo

Two **combo cards** that can be played together produce a new card (another combo card or a final form). The result’s **rarity** and **base stats** come from game data (JSON / catalog); the **variable** part depends on the **levels** and **tiers** of the two materials and on **onyx** usage (see below).

### 8.2. Result level

Let \(L_A, L_B\) be material levels (clamped to 1…5 in code), \(\mathrm{avg} = (L_A + L_B) / 2\), \(\mathrm{ceil\_avg} = \lceil \mathrm{avg} \rceil\).

| Result rarity (combo result) | Result level formula | Max level |
|-----------------------------|----------------------|-----------|
| Bronze or silver | \(\mathrm{ceil\_avg}\) | 5 |
| Gold, diamond, half-onyx, or full-onyx | \(\mathrm{ceil\_avg} + 1\) | 6 |

**Example:** levels 2 and 3 → \(\mathrm{ceil\_avg} = 3\). Silver result → level **3**; gold (or higher-tier) result → level **4**.

Implementation: [`ComboBattleStats.resultLevel`](../lib/models/combo_battle_stats.dart). For **half/full onyx**, the UI may pass [`ComboResultOnyxShape`](../lib/models/combo_battle_stats.dart) so that the “+1 tier” rule still applies when the catalog tier alone would not encode onyx shape (see `combo_lab_screen.dart`).

### 8.3. Which result rarity can appear (material rules)

Summary from wiki (enforced by game data, not recomputed in app):

- Only **bronze and/or silver** materials → result can be bronze, silver, or gold.
- **Gold** + any bronze/silver/gold → result can be bronze through **diamond**.
- **Onyx** + any non-onyx bronze/silver/gold → **half-onyx** result (visually like diamond).
- **Two onyx** materials → **full-onyx** result.

The app does not derive result identity from these rules; it uses [`ComboGraphLookup.fusionResultCardId`](../lib/services/combo_graph_lookup.dart) on the catalog.

### 8.4. Per-level A/D growth (Table 1)

For the **highest** combo-card rarity among the two materials, add **per result level above 1**:

| Highest material | Bonus per level above 1 (attack / defense) |
|------------------|--------------------------------------------|
| BCC | +1 / +1 |
| SCC | +2 / +2 |
| GCC | +3 / +3 |
| OCC | +4 / +4 |

The wiki “matrix” for Table 1 is equivalent to using only this **maximum** tier (same as the row for that tier). Implementation: [`ComboBattleStats.perLevelBonus`](../lib/models/combo_battle_stats.dart) and [`scaledResultStats`](../lib/models/combo_battle_stats.dart) (base + bonus × \((\min(\text{result level}, 5) - 1)\) because level **6** does not add extra A/D over level **5** — [`maxStatScalingLevel`](../lib/models/combo_battle_stats.dart) = 5).

### 8.5. Maximum stat boosts (Table 2)

Wiki Table 2 lists the maximum **total** per-level bonus for each (highest material × **result** rarity). In this project, that growth is implemented only via §8.4; there is **no** separate `min(table2_cap, computed)` clamp.

**Important caveat:** [`ComboBattleStats.maxStatScalingLevel`](../lib/models/combo_battle_stats.dart) is **5**. Result **level 6** (fused / upper cap for high-tier results) does **not** add a fifth A/D step over level 5 — so the maximum number of per-level steps is **four** (same as result level 5). Some wiki Table 2 cells (e.g. BCC × gold result **+5/+5**) assume **five** steps above level 1 for a maxed gold result; this app tops out at **four** steps for A/D scaling, matching the unit test “level 6 = level 5 for stats”. Remastered or in-game behaviour may differ.

Onyx-only cells in Table 2 point to Table 3 (one-time boosts), not separate non-onyx caps.

### 8.6. Half / full onyx one-time boosts (Table 3)

If **at least one** material is onyx, apply a **one-time** attack/defense boost from the **original** (pre-onyx) combo result tier. If **two** onyx materials are used, apply the **extra** (full) row.

| Original result tier | Half-onyx | Full-onyx |
|---------------------|-----------|-----------|
| Bronze | +27 / +27 | +29 / +29 |
| Silver | +25 / +25 | +27 / +27 |
| Gold | +23 / +23 | +25 / +25 |
| Diamond | +20 / +20 | +23 / +23 |

Implementation: [`ComboBattleStats.onyxTable3Bonus`](../lib/models/combo_battle_stats.dart). In **Combo Lab**, these bonuses are added on the non-sheet path when the preview reaches fused-style level **6** with half/full onyx shape (`combo_lab_screen.dart`). The **deck optimizer** path prefers precomputed triples from [`FusionOnyxSheet`](../lib/data/fusion_onyx_sheet.dart) (`assets/fusion_onyx_stats.json`) when available, then applies the same per-level scaling as in [`deck_optimizer.dart`](../lib/services/deck_optimizer.dart).

### 8.7. Example (wiki): Club — silver combo result, base 13 / 0

| Materials | Highest tier | Per-level | Max total bonus (levels) | Max stats |
|-----------|--------------|-----------|----------------------------|-----------|
| BCC + BCC | BCC | +1 | +4 at level 5 | **17 / 4** |
| BCC + SCC | SCC | +2 | +8 | **21 / 8** |
| SCC + GCC | GCC | +3 | +12 | **25 / 12** |
| OCC + B/S/G | OCC | +4 / Table 3 | — | **38 / 25** (wiki: 13/0 + half-onyx **silver** Table 3 +25/+25) |
| OCC + OCC | OCC | +4 / Table 3 | — | **40 / 27** (wiki: 13/0 + full-onyx **silver** +27/+27) |

Concrete preview values for a given pair may follow [`FusionOnyxSheet`](../lib/data/fusion_onyx_sheet.dart) (`assets/fusion_onyx_stats.json`) when loaded; the optimizer uses that path first, then per-level scaling.

### 8.8. References

- In-code pointer: [Card Mechanics (Fandom)](https://lil-alchemist.fandom.com/wiki/Card_Mechanics) — `ComboBattleStats` notes classic vs Remastered differences where relevant.
