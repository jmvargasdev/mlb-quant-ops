# System Overview

## Purpose

MLB Quant Ops is a multi-layer market intelligence system that governs exposure rather than chasing isolated predictions.

## System Layers

### 1. Sabermetrics Layer

This layer forms the structural baseball view. It evaluates matchup quality, pitching, bullpen context, lineup dynamics, and related baseball inputs to create hypotheses about where the market may be mispricing a game.

### 2. Market Pricing Layer

This layer compares internal structural views against market prices and implied probabilities. Its role is to identify whether a structural view translates into a meaningful edge at the current line.

### 3. Temporal Intelligence Layer

This layer studies what happens to an edge over time. It evaluates persistence, timing quality, market correction behavior, stabilization patterns, and volatility regimes to determine whether an edge survives market interaction.

### 4. Portfolio Governance Layer

This layer moves from single-structure evaluation to slate-level risk control. It detects concentration, clustering, correlation, overlap, and aggregate timing or volatility risk. It is responsible for exposure compression and aggression control.

### 5. Executive CIO Layer

This layer makes the final deployment decision. It converts governed exposure, operational posture, and portfolio risk into actions such as execute now, wait for confirmation, reduced quality, or pass. It also generates the executive decision memo used by the Decision Panel.

## Governing Principle

The system does not assume that a strong edge automatically deserves capital. It assumes that capital should be deployed only after structural quality, market behavior, temporal confirmation, and portfolio context are aligned.

