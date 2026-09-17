---
name: DineFlow AI / DineFlow OS
description: Warm, restrained restaurant operations and ordering interface.
colors:
  accent: "#2F5D50"
  accent-hover: "#24483E"
  accent-subtle: "#EAF1EE"
  surface-base: "#FDFAF3"
  surface-raised: "#FFFEFA"
  surface-sunken: "#F5EFE4"
  surface-inverse: "#1F2A26"
  ink-primary: "#1C2321"
  ink-secondary: "#5A5449"
  ink-tertiary: "#8C8478"
  ink-inverse: "#F5EFE4"
  line-subtle: "rgba(28, 35, 33, 0.08)"
  line-default: "rgba(28, 35, 33, 0.14)"
  success: "#2A7449"
  success-subtle: "#E6F5EA"
  warning: "#96650C"
  warning-subtle: "#FDF3DC"
  danger: "#B32D1E"
  danger-subtle: "#FDE8E4"
  kitchen-base: "#0E1110"
  kitchen-raised: "#191F1D"
  kitchen-ink: "#F7F4ED"
typography:
  display:
    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Karla', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Karla', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Karla', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  figures:
    fontFamily: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.15
rounded:
  card: "10px"
  button: "8px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-8: "32px"
  space-12: "48px"
  space-16: "64px"
  space-24: "96px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.button}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.button}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.card}"
    padding: "24px"
  workflow-field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.button}"
    padding: "10px 12px"
---

# Design System: DineFlow

## Overview

Preserve the warm, restrained restaurant interface established in PRODUCT.md. Serif page titles and food photography give the customer experience its character; quiet forms, tables, and aligned figures support operational work. Reports, table sessions, administration, and billing extend this system inside the existing shell.

This is a source-based record of `src/styles/tokens.css`, `src/index.css`, `src/App.css`, and the workflow panel components and stylesheet. It records implemented values, not browser or print verification. CSS remains the implementation authority; this document is a reusable subset of that system.

## Colors

The primary accent is muted forest green, used for actions, links, and prices. Warm cream surfaces step from the page background to raised panels and inset controls. Dark green charcoal anchors navigation; secondary brown-gray ink supports descriptions and metadata.

**The Meaningful Color Rule.** Success, warning, and danger communicate states. Category, order-type, and role labels stay neutral. Confirmed/preparing states use warning tints; served/ready/completed states use success tints; cancellation and errors use danger.

The kitchen display has its own near-black surface and light ink for operational contrast, with separate brighter timing colors in the token file. QR codes deliberately use black modules on white for scanning. AI panels reuse the warm surface-to-accent-subtle gradient and fine accent border already defined in the application.

## Typography

Playfair Display supplies page titles, dish names, and selected prices. Karla supplies controls, body copy, table cells, and operational headings. IBM Plex Mono distinguishes identifiers, timestamps, and dashboard figures. Use the frontmatter roles and existing token families rather than adding fonts.

The six token sizes pair with line heights: 11/1.4, 13/1.5, 15/1.6, 18/1.4, 24/1.25, and 34/1.15. Weights are regular, medium, and semibold. Page subtitles and table cells use the smaller body size; uppercase table headers and eyebrows use the label role. Workflow metric values currently use inherited Karla at 1.5rem with tabular numerals.

**The Comparable Figures Rule.** Preserve tabular numerals for tables and metrics. The shared table supports right-aligned numeric columns; new report markup currently leaves its cells left-aligned, so right alignment is an available convention rather than a verified property of those reports.

## Layout

The desktop shell places a sticky sidebar (244px) beside a flexible main area. Content is centered within 1240px with top/side/bottom padding of 48/32/64px. Page headers wrap and separate from content by 48px. The sidebar narrows to an icon rail (68px) at 860px; content padding becomes 32/20/48px and card padding becomes 20px.

Dashboard and POS columns collapse at 1100px. The cart then participates in page scrolling rather than keeping its desktop sticky height limit. Menu cards use an auto-fill grid with a 220px minimum, switch to two columns at 560px, and one column at 380px.

Workflow sections are flat, full-width bands separated by a fine top rule and 24px vertical padding. Controls wrap with 16px gaps and labels above fields. Metrics wrap with 24px vertical and 40px horizontal gaps. Table/session and account rows wrap, space their content apart, and use bottom rules instead of individual cards.

At 600px, workflow labels flex from a 140px basis, direct action buttons fill the controls row, and metric groups use a 40% basis with 20px gaps. Report tables live inside horizontal scroll wrappers and retain a 560px minimum width, overriding the shell's general 720px mobile table minimum. Workflow prose is limited to 72ch; page subtitles retain the 640px prose measure.

## Elevation & Depth

**The Flat Surface Rule.** Static panels use a fine border and no shadow. Menu hover uses the small two-part elevation token; overlays, the dish sheet, receipt, and assistant use the larger elevation token. Keep those existing shadow definitions in `tokens.css`; workflow sections do not introduce elevation.

Feedback is restrained: primary and table buttons press to 0.97 scale over 120ms, color transitions take 150ms, and transform transitions take 200ms. The dish sheet enters over 250ms with the existing ease-out curve. Reduced-motion styles remove transforms and shorten animation while retaining state-color feedback.

## Shapes

Cards and general POS fields use the card radius; action buttons and workflow fields use the button radius. Status tags, category filters, avatars, and compact circular actions use the pill radius. Borders are thin and neutral. Food images use a 4:3 crop with covered content and clipped upper corners.

## Components

- **Actions:** Use the existing filled primary and outlined secondary buttons. Hover darkens the primary or adds a sunken neutral fill to the outline. Disabled workflow buttons have half opacity. Workflow actions and fields have a 44px minimum height.
- **Fields:** Visible labels sit above raised workflow inputs/selects/textareas with an 8px gap and medium secondary ink. Buttons, inputs, and selects have a 2px accent focus outline offset by 3px; textareas inherit the global focus treatment. POS fields retain their inset surface and soft focus ring.
- **Navigation:** Labels and icons sit on the dark sidebar, with a quiet wash and stronger opacity for hover/selection. The narrow layout hides text labels. Preserve the established navigation behavior when adding destinations.
- **Tables:** Reuse collapsed borders, uppercase metadata-sized headers, muted cells, fine row rules, and sunken hover fill. Scroll the report table wrapper horizontally rather than compressing evidence columns into unreadable cells.
- **Reports:** Date filters precede a flat definition-list metric group, narrative sales insight, and item/rule tables. Export and summary actions use outlined buttons. Empty data, errors, changed-date notices, and summary provenance remain visible text in the relevant section.
- **Table sessions:** Each section pairs table name, seats, active-bill text, and a labeled QR image with wrapping secondary controls. Screen QR size is 180px square with a four-module quiet zone; a text link provides another route into the session. Print-specific CSS exists but printed output requires separate verification.
- **Administration:** Restaurant settings reuse the field row, a full-width FAQ textarea, and a primary save action. Account roles use separated rows with a select per person and accessible labels. Feedback is inline, with alert/status semantics.
- **Billing:** A ruled section presents the bill total and payment state before discount and cash forms. Conditional discount fields include an explicit verification checkbox. Errors and saved/payment results remain inline with alert/status semantics.

## Do's and Don'ts

- **Do** extend the existing cream/forest palette, typography, navigation, and button variants.
- **Do** use flat section hierarchy for operational panels and reserve cards for established grouped surfaces.
- **Do** preserve labels, focus visibility, responsive wrapping, table scrolling, and written state feedback.
- **Do** keep data provenance and generated-summary state readable alongside report content.
- **Don't** introduce decorative semantic colors, additional font families, or elevated cards around every control group.
- **Don't** treat source inspection as screenshot, responsive-layout, accessibility, or print signoff.
