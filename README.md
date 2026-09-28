# Athletic Performance Dashboard

An interactive, mobile-friendly dashboard for exploring athletic performance and training data stored in Google Sheets.

The Google Sheets workbooks are the **source of truth**. This application is a read-only visualisation and analysis layer over those sheets.

## Goals

The dashboard should make it easy to:

- Track sprint, jump and strength performance over time.
- Automatically identify PBs.
- Compare performances under different conditions.
- Explore training history.
- Eventually investigate relationships between training exposure, performance and injury/pain response.
- Support multiple athletes/clients without mixing their datasets.
- Work well on desktop and mobile.
- Update automatically whenever the underlying Google Sheets data changes.

The application must **never write to or modify Google Sheets**.

---

# Technology

Preferred stack:

- React
- TypeScript
- Vite
- Apache ECharts or Plotly for interactive charts
- Google Sheets API
- Google Identity Services / OAuth 2.0
- GitHub Pages for hosting

Avoid introducing a backend unless there is a strong reason for one.

The application should be capable of running entirely as a static site.

---

# Authentication

The Google Sheets are private.

Use Google OAuth in the browser and request **read-only access**.

Initially the application only needs to support the owner of the spreadsheets.

Do not:

- make the source spreadsheets public
- commit OAuth secrets
- include service-account private keys in the frontend
- request write access to Google Sheets

Use the minimum Google permissions required to read the data.

Authentication and data access should be isolated from the dashboard UI so that the data source can be changed later without rewriting the visualisation layer.

---

# Initial data source

Start with the owner's **Athleticism testing** Google Sheet.

Spreadsheet ID:

`1-RT8KGmUdYjU6jjuxKDmfbrA4cWBSeQH8biV6AUSgeM`

Important tabs currently include:

- `Data`
- `Lifting top sets`
- `Full Session tracking`
- `Daily Status`
- `Program`

The schema may evolve, so avoid unnecessarily hard-coding row counts.

---

# Canonical training data

`Full Session tracking` should be treated as the primary record of performed training.

Current columns:

| Column | Field |
|---|---|
| A | Date |
| B | Session |
| C | Category |
| D | Exercise |
| E | Sets |
| F | Amount |
| G | Amount Unit |
| H | Intensity |
| I | Intensity Unit |
| J | Surface |
| K | Footwear |
| L | Extra |
| M | Symptoms |
| N | Notes |

`Extra` can contain JSON-like structured metadata such as:

- pain ratings
- sprint protocol information
- velocity measurements
- weather
- unusual session context

The parser should fail gracefully if `Extra` is empty or contains malformed/non-JSON legacy data.

Missing data must remain missing. Do not silently convert missing pain, RPE or contextual information to zero.

---

# Other datasets

## Data

Contains historical athletic testing data including:

- sprint times
- flying sprint times
- standing jumps
- reactive strength / RSI testing
- CMJ
- drop jumps

Some older observations have contextual information embedded in `Notes` rather than dedicated columns.

Do not invent missing context.

---

## Lifting top sets

Contains historical strength performances.

Exercise names contain some historical inconsistencies, for example:

- `Back squat`
- `Backsquat`

and:

- `BSS`
- `Bulgarian split squat`

Create a non-destructive normalisation/alias layer in the application.

Never modify the source data.

---

## Daily Status

Used for recovery and injury-response observations.

Current columns:

- Date
- Timepoint
- Context
- Extra
- Notes

This should eventually allow analysis such as:

> How does Achilles morning pain change 24–48 hours after sprint sessions?

Do not imply causality from these observational relationships.

---

## Program

Represents intended training.

This is different from actual performed training.

Do not treat planned exercises as completed training.

---

# Data architecture

Keep three layers separate:

## 1. Raw data

The values exactly as returned by Google Sheets.

## 2. Normalised data

Convert raw rows into typed application objects.

Examples:

```ts
SprintPerformance
JumpPerformance
StrengthPerformance
TrainingSession
DailyStatus
```

Normalisation should handle:

- exercise aliases
- dates
- numbers stored as strings
- blank cells
- JSON-like `Extra` metadata
- legacy naming

Never overwrite the raw representation.

## 3. Derived metrics

Calculate things such as:

- PBs
- PB progression
- percentage improvement
- estimated 1RM
- session volume
- velocity summaries
- pain-response timelines

Derived metrics should be generated from the normalised data rather than stored manually.

---

# Sprint data

Sprint performances should not automatically be treated as equivalent merely because the distance is the same.

Relevant context can include:

- distance
- standing / 2-point / 3-point start
- lead-in distance
- flying start
- surface
- footwear
- timing method

Examples of distinct tests:

- 10 m 3-point start — 1 m lead-in
- 10 m fly — 20 m lead-in
- 40 yd — 1 m lead-in
- 100 m — 2-point start

For sprinting:

**lower time = better**

Allow filtering by:

- test
- surface
- footwear
- start type
- lead-in

Where context is unknown, display it as unknown rather than inferring it.

---

# Jump data

Examples include:

- Standing broad jump
- Standing triple jump
- Triple broad jump
- CMJ
- Pogo
- Drop jump

For distance/height tests:

**higher = better**

For RSI:

**higher = better**

Surface and footwear may materially affect comparisons and should be retained where available.

---

# Strength data

Strength visualisations should support:

- exercise selection
- load over time
- reps over time
- RPE where available
- pain where available
- velocity where available
- rep-specific PBs
- estimated 1RM

Actual demonstrated performances should be clearly distinguished from estimated strength.

Do not label an estimated 1RM as an actual PB.

---

# PB logic

PB calculations should respect test identity and relevant context.

For sprinting:

`MIN(time)`

For jump distance/height:

`MAX(result)`

For lifting, support a non-dominated load/repetition frontier.

Example:

If the athlete has:

- 5 kg × 10
- 8 kg × 15

then `5 × 10` is no longer interesting as a PB because `8 × 15` dominates it.

But:

- 5 kg × 20
- 8 kg × 15

are both valid PB performances because neither dominates the other.

---

# Dashboard

Start with the owner's athletic dashboard.

## Overview

Create headline cards for major current PBs such as:

- 10 m start
- flying 10 m
- 20 m
- 40 yd
- 100 m
- standing broad jump
- standing triple jump
- triple broad jump

Cards should show:

- current PB
- date
- relevant conditions
- previous PB / improvement where available

Do not hard-code the PB values into the UI.

Calculate them from the source data.

---

# Sprint page

Create interactive progression charts.

Possible views:

### 10 m start progression

Plot time against date.

Controls:

- Track / Grass / All
- Spikes / Trainers / All
- start type
- lead-in

Hovering/tapping a point should display all known context.

### Flying sprint progression

Support different lead-ins without silently combining them.

### Longer sprint progression

Support:

- 40 yd
- 100 m
- 200 m

where data exists.

---

# Jump page

Create progression charts for:

- standing broad
- standing triple
- triple broad
- CMJ
- RSI / reactive tests

Allow individual tests to be selected.

---

# Strength page

Provide an exercise selector.

For the selected exercise display:

- historical performances
- PB frontier
- estimated 1RM trend
- RPE
- velocity if present

The interface should remain understandable even when only a small amount of data exists.

---

# Training page

Provide a chronological training view derived primarily from `Full Session tracking`.

Potential visualisations:

- sessions per week
- sprint exposures
- strength sessions
- training categories
- recent exercises
- volume trends

Avoid creating arbitrary "training load" scores without a clear definition.

---

# Injury / recovery page

This is experimental.

Combine `Full Session tracking` with `Daily Status`.

Allow exploration of:

- Achilles pain
- patellar tendon pain
- anterior knee pain
- other symptoms

Potential analyses:

- pain before training
- pain during training
- same-day response
- next-morning response
- 48-hour response

Eventually allow training sessions to be overlaid with pain observations.

This is observational data and the UI should avoid causal language.

---

# UX requirements

The application should feel like a modern sports-performance dashboard rather than a spreadsheet viewer.

Priorities:

1. Mobile-first
2. Fast
3. Clear
4. Interactive
5. Minimal visual clutter

Use responsive layouts.

On mobile, charts should support touch interaction.

Avoid giant tables as the primary interface.

Use tables primarily for drill-down and raw-data inspection.

---

# Multi-athlete architecture

The application should eventually support:

- Owner / Athleticism testing
- Beazie
- Georgia
- additional clients

Do not mix datasets.

Create an athlete configuration abstraction rather than scattering spreadsheet IDs throughout components.

For example:

```ts
interface AthleteConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  enabledModules: {
    sprint: boolean;
    jumps: boolean;
    strength: boolean;
    recovery: boolean;
  };
}
```

Different athletes may have different amounts and types of data.

The application should gracefully hide sections with no data.

---

# Privacy

Client data must be treated as private.

Do not expose raw spreadsheets publicly merely to simplify development.

Do not log spreadsheet contents to third-party analytics services.

Do not place Google access tokens into URLs.

Do not persist Google access tokens unnecessarily.

The dashboard should request read-only access.

---

# Development priorities

Implement incrementally.

## Phase 1

- Vite + React + TypeScript project
- GitHub Pages deployment
- Google OAuth
- Google Sheets read-only connection
- Fetch Athleticism testing workbook
- typed data-access layer
- loading/error/auth states

## Phase 2

- Overview
- Sprint page
- Jump page
- PB calculations
- filters
- responsive charts

## Phase 3

- Strength page
- PB frontier
- estimated 1RM
- velocity visualisation

## Phase 4

- Training history
- Daily Status
- injury/recovery visualisations

## Phase 5

- multi-athlete/client support

---

# Testing

Add tests for data transformations and PB logic.

Important cases include:

- missing values
- malformed `Extra`
- exercise aliases
- same exercise with different sprint protocols
- same sprint distance on different surfaces
- same sprint distance with different footwear
- PB ties
- lifting PB frontier
- chronological PB progression

The visualisation layer should not contain core PB-calculation logic.

---

# Important development principle

**Do not optimise the source spreadsheet around the dashboard.**

The spreadsheet exists primarily as a simple, flexible training log.

The dashboard should adapt to the data model rather than forcing logging to become burdensome.

The intended workflow is:

`Athlete trains → training is logged into Google Sheets → dashboard reads Sheet → derived metrics and visualisations update automatically`

The logging process should remain low-friction.

---

# Current implementation

The first working foundation includes:

- a React, TypeScript and Vite single-page application
- in-memory Google Identity Services OAuth using only the Sheets read-only scope
- direct browser access to the Google Sheets API for the five initial tabs
- separate raw, normalised and derived-data modules
- typed initial normalisers for testing, lifting, performed training and daily status data
- sprint/jump PB, chronological progression and lifting-frontier utilities with unit tests
- a generic exploratory Analysis page with data-derived exercise/metric selectors, same-day or nearest-observation pairing, interactive scatter plots, Pearson correlation, Spearman rank correlation and visible sample sizes
- a framework-independent analysis engine with one-to-one temporal pairing and regression/statistics utilities covered by unit tests
- a responsive application shell and authenticated import/debug overview

The testing-data normaliser is intentionally conservative because historical sheet headers may vary. Use the raw-data inspector to validate the live schema before expanding analysis views. `Program` is fetched for inspection but is never included in performed training.

## Local development

Requirements: a current Node.js LTS release and a Google Cloud OAuth 2.0 Web application client.

1. Copy `.env.example` to `.env` and set:

   ```dotenv
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

2. Add `http://localhost:5173` to the OAuth client's **Authorized JavaScript origins** in Google Cloud Console. Enable the Google Sheets API for the same project. No client secret belongs in this application.
3. Install and run:

   ```sh
   npm install
   npm run dev
   ```

4. Open `http://localhost:5173`, sign in with an account that can read the configured private spreadsheet, and inspect the import summary and raw rows.

Other useful commands:

```sh
npm test
npm run typecheck
npm run build
```

Access tokens are retained only in React state for the current page lifetime. They are not persisted or placed in URLs.

The Analysis page derives selectable numeric series from performed-training fields and numeric `Extra` metadata. Its nearest-observation mode uses each observation at most once and always reports the date separation. Missing measurements are omitted, never converted to zero. Correlations describe associations in the recorded observations and should not be interpreted as causal evidence.

Analysis has two complementary modes. **Explore** provides explicit X/Y selection, same-day, nearest-within-window, or forward-outcome pairing, raw paired observations, Pearson and Spearman correlations, a two-sided Pearson p-value, and an interactive scatter plot. **Discover** defaults to deterministic one-to-one nearest pairing within ±7 days, uses forward-only 0–3 day lags for training/performance relationships with symptom or recovery outcomes, requires at least six pairs, and applies Benjamini–Hochberg false-discovery-rate correction across the screened set. Selecting a discovery opens its raw observations in Explore. Discovery is exploratory: shared time trends are not yet removed, and neither raw nor adjusted statistics imply causation.

The numeric-series registry is generated once per normalized workbook. It keeps units and explicitly recorded measurement protocols in series identity, marks performance direction without altering raw values, retains source row references, and excludes sparse arbitrary metadata fields. Unknown protocol remains unknown. Current nearest matching is deterministic and greedy in chronological X order: each X receives the closest unused Y within the selected window, with earlier date/reference used to break ties. This prevents inflated sample sizes from repeatedly reusing a single observation.

Automatic discovery applies semantic candidate filtering before statistics. Each series declares a domain (`PERFORMANCE`, `TRAINING_LOAD`, `EFFORT`, `SYMPTOM`, `RECOVERY`, `BODY_METRIC`, or `CONTEXT`), athletic quality where applicable, structural-variable status, direct dependencies, source-observation identities, and a relationship concept. Direct dependencies, same-concept performance/load variants, structural-to-structural programming fields, static profiles, incompatible protocols, duplicates, and high same-source leakage are excluded from Discover but remain selectable in Explore. Cross-domain relationships receive a transparent interest weight. Daily Status series retain their timepoint, and numeric body metrics are combined into dated longitudinal series rather than applying a current value historically.

The Strength page uses canonical performed-training rows with positive integer reps and positive kg load. Raw Epley estimates are limited to 1–12 reps. Estimated current strength is the mean of up to the two best qualifying estimates in a configurable recent window (45 days by default), so ordinary lighter work does not imply an immediate strength collapse. Raw estimates, modelled state, actual rep-specific PB progression, the generic non-dominated load–rep curve, and weekly exposure remain visually and conceptually separate. Weighted bodyweight exercises are excluded from e1RM modelling until dated bodyweight can be paired correctly.

## GitHub Pages preparation

This repository defaults to the GitHub Pages project path `/TrainingDash/`, matching `https://bobgsmith.github.io/TrainingDash/`. Override it for another deployment with `VITE_BASE_PATH=/another-path/ npm run build`.

The Pages workflow builds and publishes `dist` on pushes to `main`. Configure a GitHub Actions repository variable named `VITE_GOOGLE_CLIENT_ID` under **Settings → Secrets and variables → Actions → Variables**. In **Settings → Pages**, select **GitHub Actions** as the source. Add `https://bobgsmith.github.io` (without the repository path) to the OAuth client's Authorized JavaScript origins.

## Verified live workbook model (September 2026)

The current workbook was inspected read-only through the connected Google Drive account. Its live tabs are `Full Session tracking`, `Sprinting PBs`, `Jumping PBs`, `Lifting PBs`, `Daily Status`, and `Program`.

`Full Session tracking` is the canonical observation table and currently includes both migrated historical observations and recent performed sessions. Sprint, jump, and strength application records are derived from its `Category`, `Exercise`, `Amount`, `Amount Unit`, `Intensity`, and `Intensity Unit` fields. The four protocol columns after `Notes`—`Timing start`, `Lead-in (m)`, `Stance`, and `Effort (%)`—are also retained.

The three PB tabs explicitly identify themselves as automatically derived from `Full Session tracking`; the app therefore uses them only for validation and calculates its own PBs from canonical observations. `Program` remains intended work and is excluded from performed-training and PB calculations.

The live data contains several intentional mixed-schema patterns:

- `Sets` may be numeric, blank, or qualitative (for example `Few`).
- `Extra` may be JSON, free text, an RPE value, velocity text, or a qualitative protocol label.
- timed warm-ups and submaximal efforts coexist with maximal performances
- jump tests can use metres, centimetres, or RSI, and test name plus unit defines the measurement identity
- missing surface, footwear, pain, RPE, velocity, and protocol remain unknown
