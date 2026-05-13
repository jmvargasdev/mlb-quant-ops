---
version: alpha
name: MLB Quant Ops Cockpit
description: Quantitative operations dashboard for MLB market intelligence, temporal observability, CLV research, and edge validation.
colors:
  background: "#071018"
  surface: "#0B1620"
  surface-strong: "#0E1D29"
  border: "#223241"
  text: "#F2F7FB"
  muted: "#8EA3B3"
  accent: "#71C7FF"
  accent-2: "#8D7BFF"
  positive: "#3DDC97"
  warning: "#F4C95D"
  danger: "#FF6B6B"
  info: "#5ED3FF"
typography:
  h1:
    fontFamily: "Inter"
    fontSize: "2.25rem"
    fontWeight: "600"
    lineHeight: "1.1"
    letterSpacing: "-0.03em"
  h2:
    fontFamily: "Inter"
    fontSize: "1.25rem"
    fontWeight: "600"
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter"
    fontSize: "0.95rem"
    fontWeight: "400"
    lineHeight: "1.55"
  mono:
    fontFamily: "IBM Plex Mono"
    fontSize: "0.72rem"
    fontWeight: "500"
    lineHeight: "1.4"
    letterSpacing: "0.08em"
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  panel-strong:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  border:
    color: "{colors.border}"
  badge-positive:
    backgroundColor: "{colors.positive}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
  badge-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
  badge-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
---

## Overview

This dashboard is a quantitative operations cockpit. It is not a sportsbook UI and it is not a consumer SaaS dashboard.
The interface must support fast scanning, temporal reasoning, and decision-first workflows.

The interface should be allocation-first. The most important frontend output is the executive allocation posture: what capital should be deployed, reduced, delayed, or passed, and why. The dashboard exists to support investors seeking profitable, risk-governed decisions, not to present abstract information as an end in itself.

All analytical workspaces should function as epistemic support for the Executive Allocation Layer. Market structure, replay, CLV research, temporal persistence, and operational health should explain, validate, audit, or challenge the allocation decision rather than compete with it as equal primary destinations.

The primary cognitive unit is the workspace:

- Daily Ops
- Decision Panel / Executive Allocation
- Market Structure
- Replay
- CLV Research
- Ops Health

Each workspace answers one operational question and should preserve a dense, terminal-like feeling.

The first question the application should answer is:

- What should the operator do with capital now?

Supporting questions follow:

- How much exposure is justified?
- Which structures deserve execution, reduction, delay, or pass?
- What evidence supports the allocation?
- What risk conditions would invalidate or downgrade it?

## Colors

The palette is dark, cool, and operational.

- **Background** is near-black blue to reduce glare and support long sessions.
- **Surfaces** use layered slate tones to create depth without bright gradients.
- **Accent** is reserved for live state, refresh, and selected actions.
- **Positive / Warning / Danger** communicate operational status, not decorative flair.
- **Muted** is for metadata, timestamps, and low-priority context.

The palette should always favor contrast and readability over visual novelty.

## Typography

Typography must feel like a trading terminal.

- Headings are compact and confident.
- Body text stays readable at high density.
- Mono text is reserved for timestamps, statuses, schedule labels, and operational metadata.

Avoid oversized typography. The layout must remain information-dense.

## Layout

The layout should prioritize:

1. Executive allocation and capital posture
2. Global operational heartbeat
3. Active decision evidence
4. Workspace navigation
5. Context rail

The main content area should be wider than the rail.
Primary workspaces should use vertical grouping rather than side-by-side fragmentation when the cards contain dense information.

Use progressive disclosure:

- show the most actionable items first
- keep supporting context adjacent, not mixed
- separate process state from snapshot state

## Elevation & Depth

Depth should be subtle and functional.

- Use surface layering to separate shell, panels, and cards.
- Avoid glossy shadows and consumer-style glass effects.
- Use borders and tonal variation instead of dramatic elevation.

Panels should feel like instruments, not marketing cards.

## Shapes

Shapes should be consistent and calm.

- Rounded corners are moderate, not pill-heavy.
- Chips and badges stay compact.
- Cards should have enough internal width for dense market and timing data.

## Components

### Shell

The shell is the top-level cockpit container.
It should frame the workspace, the heartbeat, and the active context without distraction.

### Workspace Header

The header must show:

- process update time
- latest snapshot time
- refresh policy
- selected matchup context

### Operational Cards

Cards must support:

- matchup identification
- edge / market / persistence summaries
- risk flags
- temporal state cues

Cards should be legible at a glance and should not require horizontal compression.

### Status Badges

Badges encode operational state.

- `positive` means stable or healthy
- `warning` means degraded or incomplete
- `danger` means collapsing, unstable, or late-risk
- `info` means contextual or informational

## Do's and Don'ts

### Do

- Keep the dark quant aesthetic.
- Preserve high information density.
- Separate process update from latest snapshot.
- Make temporal state visible.
- Let workspaces answer one question each.
- Favor stable layout behavior during refresh.

### Don't

- Don't use sportsbook styling.
- Don't add consumer SaaS gradients.
- Don't collapse multiple workflows into one surface.
- Don't hide stale snapshot state.
- Don't overuse decorative charts or oversized cards.
- Don't reduce contrast for visual softness.
