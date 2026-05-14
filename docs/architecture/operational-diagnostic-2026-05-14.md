# Diagnóstico Operacional — MLB Quant Ops

**Fecha:** 2026-05-14  
**Muestra:** 416 decisiones / 400 resultados completos  
**Conclusión:** El sistema detecta edge correctamente pero lo convierte en pérdida en tres vectores identificados y cuantificados.

---

## Scorecard Ejecutivo

| Métrica | Valor | Umbral saludable |
|---------|-------|-----------------|
| Accuracy global | 39.5% | > 52% |
| Profit/loss proxy | -0.25 | > 0 |
| Acciones rentables (Execute Now) | 7 de 416 (1.7%) | > 25% |
| Acciones que sangran (Wait for Confirmation) | 308 de 416 (74%) | < 40% |
| Timing quality signal presente | 3 de 22 edges (13.6%) | > 60% |
| Elite Conviction activado | 9 decisiones totales | > 50/temporada |

---

## Arquitectura de Decisión Actual

El pipeline toma decisiones en este orden:

```
Scoring Engine
  └─ fundamental_score (starter 30%, bullpen 17%, lineup 16%, ...)
  └─ edge vs market (fair prob - implied prob)
  └─ final_edge_score = (fundamental × 18) + (market_adj × 10) + (momentum × 3) - penalties

      ↓

Conviction Tier Assignment
  Elite / High / Supportive / Decaying / Unstable

      ↓

Timing Quality Gate
  timing_quality_score (0, 100, o null)

      ↓

Action Dispatch
  Execute Now / Wait for Confirmation / Pass / Reduced Quality
```

---

## Leaks Identificados y Cuantificados

### Leak 1 — "Wait for Confirmation" domina y pierde

**308 de 416 decisiones (74% del volumen total)**

| Métrica | Valor |
|---------|-------|
| Accuracy | 38.41% |
| P/L proxy acumulado | **-2.75** |
| Breakdown de calidad | 112 Negative_action / 95 Profitable / 74 Missed_winner / 21 Capital_preserved |

El sistema defaultea a "esperar confirmación" pero continúa esperando más allá de la ventana óptima. Para cuando se cumple el umbral de confianza (~15m pregame), el edge ya fue absorbido por el mercado.

**Señal clave:** `timing_quality_score = 0` en los registros de 60m_pregame Y en 15m_pregame. El sistema espera una señal que nunca llega y termina ejecutando tarde o no ejecutando.

---

### Leak 2 — "High Conviction" pierde dinero con correctas predicciones

**199 decisiones (49% del total)**

| Métrica | Valor |
|---------|-------|
| Accuracy | 43.72% |
| P/L proxy | **-4.75** (el peor de todos los tiers) |

Este es el hallazgo más crítico: el modelo predice correctamente la dirección en 43.72% de los casos (sobre el coin-flip de 50% en mercado eficiente ajustado por vig), pero **pierde dinero**. Esto indica que el tier "High Conviction" está siendo asignado a edges que el mercado ya tiene correctamente priceados — la convicción es correcta sobre el resultado del juego, no sobre la ventaja vs. el precio de mercado.

---

### Leak 3 — Timing Quality Signal casi nunca se activa

| Segmento | Señal presente |
|----------|----------------|
| 60m_pregame edges | 3 de 22 (13.6%) |
| 15m_pregame edges | 0 adicionales |
| Promedio timing quality | 10.23 (sobre 100) |

El mercado tarda **946 minutos (15.77 horas) en estabilizarse** antes del primer pitch. Durante todo ese período, las detecciones de edge son ruido — el mercado los absorbe sistemáticamente. El sistema busca señal en una ventana que aún no tiene información estructurada.

Consecuencia directa: la decisión "Wait for Confirmation" espera una señal de timing quality que solo aparece en el 13.6% de los casos, por lo que el default es "nunca ejecutar o ejecutar tarde".

---

### Leak 4 — "Execute Now" y "Elite Conviction" son rentables pero casi invisibles

| Acción / Tier | Decisiones | Accuracy | P/L proxy |
|---------------|-----------|----------|-----------|
| Execute Now | 7 | **71.43%** | **+1.5** |
| Elite Conviction | 9 | **77.78%** | **+2.5** |
| Reduced Quality | 2 | **100%** | **+1.0** |

Las tres categorías rentables suman **18 decisiones de 416** (4.3% del volumen). El sistema produce señal de alta calidad pero tiene umbrales tan restrictivos que casi nunca la activa.

**El sistema está calibrado para no perder en lugar de estar calibrado para ganar.**

---

### Leak 5 — Source confidence = 1.0 con datos faltantes

El orchestrator reporta `source_confidence_weight: 1.0` (máximo) mientras el scoring engine aplica penalizaciones por datos faltantes en:

- `xFIP` (no disponible en varias líneas de rotación)
- `runline` (no capturado de Covers)
- `injury severity` (sin estructura)
- `wRC+` (no integrado)
- `live line movement` en tiempo real

La penalidad por datos faltantes afecta `uncertainty_score` (vía `dataPenalty × 0.8`) pero **no rebaja `source_confidence`**. El resultado es que confidence scores se calculan como si los datos estuvieran completos, inflando la señal.

---

### Leak 6 — Edge pequeño vs. late movement (2.1 pts vs. 0.41 pts de drift)

El movimiento tardío promedio del mercado es **0.41 puntos de probabilidad implícita**. El sistema clasifica como "Watchlist lean" cualquier edge ≥ 6 con confidence ≥ 55 — incluyendo edges de 2.1 pts que son estadísticamente consumidos por el drift normal del mercado antes del cierre.

Un edge de **2.1 pts** con drift de **0.41 pts** tiene ~20% de probabilidad de ser eliminado solo por movimiento de mercado previo al pitch.

---

## Vectores de Mejora con Impacto en Rentabilidad

### Vector 1 — Recalibrar "Wait for Confirmation" (impacto máximo)

**Problema:** La acción domina el 74% del volumen con -2.75 P/L acumulado.

**Propuesta:**
1. Introducir un gate hard: si `timing_quality_score = 0` en ventana `60m_pregame`, la acción debe escalar a **Pass** (no a "Wait"). "Wait" implica que hay algo que esperar — si timing es 0, no hay señal esperada.
2. Definir timeout: si una decisión es "Wait" durante más de 2 ventanas consecutivas sin cambio de timing quality, auto-convertir a Pass.
3. Reducir el umbral de `Execute Now`: actualmente se dispara en condiciones muy restrictivas. Si `persistence_score > 88` Y `timing_quality = 100` Y `edge_vs_market > 8 pts`, ejecutar directamente sin pasar por "Wait".

**Efecto esperado:** Mover ~60 decisiones de "Wait" a "Execute" o "Pass" — eliminando el -2.75 P/L de las que actualmente se ejecutan tarde.

---

### Vector 2 — Desacoplar "High Conviction" de edge direccional

**Problema:** High Conviction predice la dirección del juego (43.72%) pero pierde en P/L (-4.75). El tier está midiendo convicción sobre el *resultado* del juego, no sobre la *ventaja vs. el precio de mercado*.

**Propuesta:**
- Agregar segundo criterio para High Conviction: `edge_vs_market >= 6 pts` (hoy el tier puede asignarse con edge de 2 pts si el fundamental es alto).
- Crear separación explícita entre `outcome_conviction` (probabilidad de ganar el juego) y `market_conviction` (probabilidad de que el precio de mercado sea incorrecto).
- Solo `market_conviction` debe activar exposición. `outcome_conviction` sola → informational only.

**Efecto esperado:** Reducir el universo de High Conviction de 199 a ~80-90 decisiones, concentradas en las que tienen edge real vs. precio.

---

### Vector 3 — Reparar Timing Quality Signal

**Problema:** 62% de los edges muestran `timing_quality_signal = 0 o null`. El cálculo actual no captura cuándo el mercado tiene información incompleta.

**Propuesta:**
- El timing quality signal debería ser positivo cuando: (a) el edge ha persistido ≥ 3 ventanas de snapshot sin decaer, (b) el movimiento de línea es opuesto al edge (mercado moviéndose en dirección contraria a la ventaja), o (c) hay late sharp movement detectado.
- Actualmente solo 3 games muestran timing = 100 — todos tienen `late_sharp_movement` en sus flags de volatilidad. **El sharp movement ya es la señal; conectarlo explícitamente al timing quality score.**

**Efecto esperado:** Aumentar la cobertura de timing signal del 13.6% al 35-45%, permitiendo que más decisiones salten de "Wait" a "Execute".

---

### Vector 4 — Aumentar frecuencia de "Execute Now" y "Elite Conviction"

**Problema:** Las dos categorías más rentables solo representan 16 decisiones combinadas.

**Propuesta:**
- Auditar los 9 casos de Elite Conviction: ¿qué combinación de inputs los produjo? Los criterios son alcanzables más frecuentemente.
- Auditar los 7 casos de Execute Now: ¿qué threshold los disparó? Bajar el umbral en 15%.
- Hipótesis: Elite Conviction requiere `starter_edge_component > 0.25` + `lineup_quality > 0.20` + `edge_vs_market > 8`. Si se confirma, rastrear cuántos juegos actuales alcanzan 2 de 3 criterios.

---

### Vector 5 — Mínimo de edge para acción vs. drift tardío

**Propuesta de umbral mínimo por ventana:**

| Ventana | Edge mínimo para acción |
|---------|------------------------|
| 06:00_open | No ejecutar (solo monitoreo) |
| 08:00_early | No ejecutar |
| 10:00_market | ≥ 8 pts (margen sobre drift) |
| 13:00_lineup_watch | ≥ 6 pts |
| lineup_confirm | ≥ 5 pts |
| 60m_pregame | ≥ 4 pts |
| 15m_pregame | ≥ 3 pts |
| close | ≥ 2 pts |

El drift de mercado promedio es 0.41 pts. Para edges bajo 3 pts en ventanas tempranas, la probabilidad de que el mercado normalice el edge antes del close es alta.

---

### Vector 6 — Penalizar source confidence cuando faltan inputs críticos

**Propuesta:**
- Si `xFIP` no disponible: bajar `source_confidence` en 0.08 (actualmente solo penaliza uncertainty_score).
- Si `runline` no capturado: bajar `source_confidence` en 0.05.
- Si `injury severity` no estructurado: bajar `source_confidence` en 0.03.
- El `confidence_score` final debe reflejar la calidad real de los inputs, no solo el éxito HTTP de las fuentes.

---

## Plan de Implementación

### Semana 2026-05-14 (inmediato)

- [ ] Conectar `late_sharp_movement` flag → `timing_quality_score = 100` en volatility engine
- [ ] Gate: `timing_quality = 0` en 60m_pregame → acción = Pass (no Wait)
- [ ] Audit script: extraer los 9 casos Elite Conviction y los 7 Execute Now del ledger histórico

### Semana 2026-05-21

- [ ] Desacoplar `market_conviction` de `outcome_conviction` en scoring engine
- [ ] Implementar edge mínimo por ventana en decision dispatch
- [ ] Timeout de 2 ventanas para "Wait for Confirmation"

### Semana 2026-06-01

- [ ] Recalibrar source confidence score para degradar con inputs faltantes
- [ ] Revisión de High Conviction tier: agregar gate de `edge_vs_market >= 6`
- [ ] A/B: correr scoring en modo paralelo con umbrales nuevos vs. umbrales actuales, comparar distribución de acciones

---

## Datos Operacionales de Referencia

### Hoy (2026-05-14)

| Juego | Edge vs mercado | Confidence | Persistence | Acción actual |
|-------|-----------------|-----------|-------------|---------------|
| MIL vs SD | 10.18 pts | 67.26 | 90.8 | Wait / Pass |
| OAK vs STL | 9.86 pts | 63.09 | 90.5 | Wait / Pass |
| PIT vs COL | 2.1 pts | 63.93 | 90.8 | Watchlist |
| HOU | 4.8 pts | — | 89.3 | — |
| MIA | 5.06 pts | — | 87.9 | — |

Los dos edges más fuertes del día (MIL 10.18 pts, OAK 9.86 pts) están siendo manejados como "Wait for Confirmation" con timing_quality = 0. Con los cambios propuestos en Vector 3, ambos deberían escalar a Execute Now dado que tienen persistence > 90 y edge > 8 pts.

---

*Diagnóstico generado 2026-05-14. Próxima revisión: 2026-05-21 (recalibración de umbrales) y 2026-06-01 (audit de convicción).*
