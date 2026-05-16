import PanelFrame from '../../shared/components/PanelFrame';
import SignalPill from '../../shared/components/SignalPill';
import { useLanguage } from '../../shared/i18n/LanguageProvider';

const CONTENT = {
  en: {
    badges: ['Educational', 'Risk Context', 'Model Literacy'],
    overviewTitle: 'Responsible signal guide',
    overviewSubtitle: 'A plain-language guide to reading MarketSentinel output with context.',
    overview:
      'MarketSentinel organizes market data, model signals, timing context, and risk indicators so users can understand the structure behind each slate.',
    principlesTitle: 'Reading principles',
    principlesSubtitle: 'Use these principles to interpret model output without over-weighting any single metric.',
    principles: [
      {
        title: 'Signals are probabilistic',
        body: 'A signal describes a model view of the market at a point in time. It should be read as probability and structure, not certainty.',
      },
      {
        title: 'Risk comes before edge',
        body: 'A high edge score can still be compressed by timing, volatility, stale data, correlation, lineup uncertainty, or portfolio exposure. The Decision Panel should be read with the risk layer.',
      },
      {
        title: 'Freshness matters',
        body: 'Lineups, prices, weather, and market pressure can change quickly. Snapshot time and schedule window are part of the signal.',
      },
      {
        title: 'Outcomes are uncertain',
        body: 'Baseball markets are probabilistic. Even strong signals can lose, and short samples can look better or worse than the underlying process.',
      },
    ],
    docsTitle: 'Signal interpretation framework',
    docsSubtitle: 'These concepts explain why the same edge can have different operational meaning across the day.',
    docs: [
      ['Model View', 'The model compares team structure, market price, timing, and contextual inputs available at the latest refresh.'],
      ['Market Context', 'A price can be attractive, stale, compressed, or unstable depending on disagreement and movement patterns.'],
      ['Risk Flags', 'Flags explain why an apparent edge may require caution, confirmation, or reduced confidence.'],
      ['Timing Window', 'Early windows can reveal market mispricing; later windows can confirm or invalidate the original read.'],
      ['Persistence', 'Signals that survive multiple snapshots deserve a different reading than signals that appear once.'],
      ['Replay Trail', 'Replay helps audit how the signal evolved instead of judging the output only from the final screen.'],
    ],
    termsTitle: 'Interpretation note',
    terms:
      'MarketSentinel is designed to explain market structure and model behavior. It is most useful when edge, timing, volatility, persistence, and risk flags are read together.',
    educationTitle: 'How to read the system',
    educationSubtitle: 'The goal is to understand the decision stack, not to treat a single number as a command.',
    education: [
      ['Edge', 'Difference between modeled fair probability and current market probability. Positive edge does not remove risk.'],
      ['Persistence', 'Whether a signal survives across snapshots instead of appearing as one noisy moment.'],
      ['Volatility', 'How unstable the price and market state are. High volatility can downgrade otherwise attractive edges.'],
      ['Timing quality', 'Whether the current window is early, confirmed, late, or vulnerable to lineup and closing movement.'],
      ['CLV preparation', 'Whether the signal is structured in a way that can later be judged against the closing market.'],
      ['Replay', 'Audit trail showing how the signal evolved throughout the day.'],
    ],
    checklistTitle: 'Before interpreting a signal',
    checklist: [
      'Check the latest snapshot time and current schedule window.',
      'Read risk flags before focusing on edge size.',
      'Compare quant score with persistence and volatility.',
      'Look for confirmation or decay in replay when available.',
      'Treat early-window signals differently from close-window signals.',
      'Use the Decision Panel as context, not as a single-number ranking.',
    ],
  },
  es: {
    badges: ['Educativo', 'Contexto de Riesgo', 'Lectura del Modelo'],
    overviewTitle: 'Guía de lectura responsable',
    overviewSubtitle: 'Una guía en lenguaje claro para interpretar el output de MarketSentinel con contexto.',
    overview:
      'MarketSentinel organiza datos de mercado, señales del modelo, contexto temporal e indicadores de riesgo para entender la estructura detrás de cada jornada.',
    principlesTitle: 'Principios de lectura',
    principlesSubtitle: 'Usa estos principios para interpretar el output del modelo sin sobreponderar una sola métrica.',
    principles: [
      {
        title: 'Las señales son probabilísticas',
        body: 'Una señal describe una lectura del modelo sobre el mercado en un momento específico. Debe leerse como probabilidad y estructura, no como certeza.',
      },
      {
        title: 'El riesgo va antes que el edge',
        body: 'Un edge alto puede comprimirse por timing, volatilidad, datos vencidos, correlación, incertidumbre de alineaciones o exposición de cartera. El Decision Panel debe leerse junto a la capa de riesgo.',
      },
      {
        title: 'La frescura importa',
        body: 'Alineaciones, precios, clima y presión de mercado pueden cambiar rápido. La hora de captura y la ventana operativa son parte de la señal.',
      },
      {
        title: 'Los resultados son inciertos',
        body: 'Los mercados de baseball son probabilísticos. Incluso señales fuertes pueden perder, y muestras cortas pueden verse mejor o peor que el proceso subyacente.',
      },
    ],
    docsTitle: 'Marco de interpretación de señales',
    docsSubtitle: 'Estos conceptos explican por qué el mismo edge puede tener significado operativo distinto durante el día.',
    docs: [
      ['Lectura del Modelo', 'El modelo compara estructura de equipos, precio de mercado, timing e inputs contextuales disponibles en el último refresh.'],
      ['Contexto de Mercado', 'Un precio puede ser atractivo, vencido, comprimido o inestable según desacuerdo y patrones de movimiento.'],
      ['Flags de Riesgo', 'Los flags explican por qué un edge aparente puede requerir cautela, confirmación o menor confianza.'],
      ['Ventana Temporal', 'Las ventanas tempranas pueden revelar desajuste de mercado; las tardías pueden confirmar o invalidar la lectura original.'],
      ['Persistencia', 'Las señales que sobreviven múltiples capturas se leen distinto a señales que aparecen una sola vez.'],
      ['Rastro de Replay', 'Replay ayuda a auditar cómo evolucionó la señal en vez de juzgar solo la pantalla final.'],
    ],
    termsTitle: 'Nota de interpretación',
    terms:
      'MarketSentinel está diseñado para explicar estructura de mercado y comportamiento del modelo. Es más útil cuando edge, timing, volatilidad, persistencia y flags de riesgo se leen en conjunto.',
    educationTitle: 'Cómo leer el sistema',
    educationSubtitle: 'El objetivo es entender el stack de decisión, no tratar un número aislado como una orden.',
    education: [
      ['Edge', 'Diferencia entre la probabilidad justa modelada y la probabilidad actual del mercado. Edge positivo no elimina riesgo.'],
      ['Persistencia', 'Si una señal sobrevive a través de capturas en vez de aparecer como un momento ruidoso.'],
      ['Volatilidad', 'Qué tan inestable está el precio y el estado del mercado. Alta volatilidad puede degradar edges atractivos.'],
      ['Calidad de timing', 'Si la ventana actual es temprana, confirmada, tardía o vulnerable a alineaciones y movimiento de cierre.'],
      ['Preparación CLV', 'Si la señal está estructurada para evaluarse luego contra el mercado de cierre.'],
      ['Replay', 'Rastro de auditoría que muestra cómo evolucionó la señal durante el día.'],
    ],
    checklistTitle: 'Antes de interpretar una señal',
    checklist: [
      'Revisar la hora de la última captura y la ventana operativa actual.',
      'Leer los flags de riesgo antes del tamaño del edge.',
      'Comparar quant score con persistencia y volatilidad.',
      'Buscar confirmación o deterioro en replay cuando esté disponible.',
      'Leer señales tempranas distinto a señales cercanas al cierre.',
      'Usar el Decision Panel como contexto, no como ranking de un solo número.',
    ],
  },
};

function BulletList({ items }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
          {item}
        </div>
      ))}
    </div>
  );
}

export default function ResponsibleUseWorkspace() {
  const { language } = useLanguage();
  const copy = CONTENT[language] || CONTENT.en;

  return (
    <div className="grid gap-5">
      <PanelFrame className="border border-sky-300/20 bg-slate-950/55 p-5 lg:p-6">
        <div className="flex flex-wrap gap-2">
          {copy.badges.map((badge) => (
            <SignalPill key={badge} tone="info">{badge}</SignalPill>
          ))}
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">{copy.overviewTitle}</h2>
        <p className="mt-2 text-sm text-slate-400">{copy.overviewSubtitle}</p>
        <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-300">{copy.overview}</p>
      </PanelFrame>

      <PanelFrame title={copy.principlesTitle} subtitle={copy.principlesSubtitle}>
        <div className="grid gap-3 md:grid-cols-2">
          {copy.principles.map((principle) => (
            <div key={principle.title} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-4">
              <div className="text-sm font-semibold text-white">{principle.title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{principle.body}</p>
            </div>
          ))}
        </div>
      </PanelFrame>

      <PanelFrame title={copy.educationTitle} subtitle={copy.educationSubtitle}>
        <div className="grid gap-3 lg:grid-cols-2">
          {copy.education.map(([term, explanation]) => (
            <div key={term} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-sky-200">{term}</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{explanation}</div>
            </div>
          ))}
        </div>
      </PanelFrame>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PanelFrame title={copy.docsTitle} subtitle={copy.docsSubtitle}>
          <div className="grid gap-3">
            {copy.docs.map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-1 text-sm leading-6 text-slate-400">{description}</div>
              </div>
            ))}
          </div>
        </PanelFrame>

        <div className="grid gap-5">
          <PanelFrame title={copy.termsTitle}>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/6 px-4 py-4 text-sm leading-6 text-amber-50">
              {copy.terms}
            </div>
          </PanelFrame>
          <PanelFrame title={copy.checklistTitle}>
            <BulletList items={copy.checklist} />
          </PanelFrame>
        </div>
      </div>
    </div>
  );
}
