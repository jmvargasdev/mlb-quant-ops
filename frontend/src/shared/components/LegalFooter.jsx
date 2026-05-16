import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageProvider';

const POLICIES = {
  en: {
    footerNote: 'MarketSentinel provides analytical market intelligence for informational use.',
    close: 'Close',
    links: [
      ['terms', 'Terms'],
      ['privacy', 'Privacy'],
      ['disclaimer', 'Disclaimer'],
      ['responsible', 'Responsible Use'],
    ],
    docs: {
      terms: {
        title: 'Terms of Use',
        updated: 'Last updated: May 16, 2026',
        sections: [
          ['Use of the platform', 'MarketSentinel is provided as an analytical and informational tool. Users should not misuse the service, attempt unauthorized access, redistribute protected content, or interfere with platform operation.'],
          ['User responsibility', 'Users are responsible for how they interpret and use the information presented. MarketSentinel does not place wagers, accept deposits, custody funds, or execute transactions for users.'],
          ['Availability and accuracy', 'The service may depend on third-party data, scheduled jobs, network availability, and model outputs. Data may be delayed, incomplete, stale, or inaccurate.'],
          ['Intellectual property', 'The MarketSentinel interface, analysis structure, reports, and generated presentation are protected content unless otherwise stated.'],
          ['Changes', 'MarketSentinel may update features, content, data sources, and these terms as the product evolves.'],
        ],
      },
      privacy: {
        title: 'Privacy Policy',
        updated: 'Last updated: May 16, 2026',
        sections: [
          ['Information handled', 'MarketSentinel may process technical information such as request metadata, device/browser context, diagnostics, and operational logs needed to keep the service reliable.'],
          ['Contact and account data', 'If email capture, accounts, payments, or support forms are added, the information provided by users should be used to operate the service, provide support, and communicate product updates.'],
          ['Analytics', 'The site may use privacy-conscious analytics to understand usage patterns, errors, and product performance.'],
          ['Data sharing', 'MarketSentinel should not sell personal information. Limited data may be processed by hosting, analytics, payment, support, or infrastructure providers when needed to operate the service.'],
          ['User requests', 'Users may contact the operator to request access, correction, or deletion of personal information where applicable.'],
        ],
      },
      disclaimer: {
        title: 'Disclaimer',
        updated: 'Last updated: May 16, 2026',
        sections: [
          ['Informational purpose', 'MarketSentinel provides market analysis, model output, and decision-support context. It is not financial, legal, tax, gambling, or professional advice.'],
          ['No guarantees', 'No model, signal, report, or dashboard view guarantees a result, profit, market movement, or betting outcome. Sports and markets remain uncertain.'],
          ['Independent judgment', 'Users should apply independent judgment, verify information, and consider their own circumstances before making any decision.'],
          ['Third-party data', 'MarketSentinel may rely on external data sources. Third-party data can be delayed, revised, missing, or incorrect.'],
          ['Local rules', 'Users are responsible for understanding and following laws, rules, and platform terms that apply in their location.'],
        ],
      },
      responsible: {
        title: 'Responsible Use',
        updated: 'Last updated: May 16, 2026',
        sections: [
          ['Read signals as probabilities', 'A signal is a structured model view, not a certainty. Edge, timing, volatility, persistence, and risk flags should be read together.'],
          ['Respect uncertainty', 'Even strong signals can fail. Short-term outcomes may not reflect the quality of the process.'],
          ['Use limits', 'Users who apply the information to personal decisions should set limits, avoid impulsive behavior, and avoid decisions that create financial or emotional pressure.'],
          ['Check freshness', 'Always review the latest snapshot time, schedule window, and data quality indicators before relying on a view.'],
          ['Seek help if needed', 'Anyone experiencing loss of control, distress, or harmful behavior related to wagering or financial risk should stop and seek qualified support.'],
        ],
      },
    },
  },
  es: {
    footerNote: 'MarketSentinel provee inteligencia de mercado analítica para uso informativo.',
    close: 'Cerrar',
    links: [
      ['terms', 'Términos'],
      ['privacy', 'Privacidad'],
      ['disclaimer', 'Disclaimer'],
      ['responsible', 'Uso Responsable'],
    ],
    docs: {
      terms: {
        title: 'Términos de Uso',
        updated: 'Actualizado: 16 de mayo de 2026',
        sections: [
          ['Uso de la plataforma', 'MarketSentinel se ofrece como una herramienta analítica e informativa. Los usuarios no deben usar indebidamente el servicio, intentar acceso no autorizado, redistribuir contenido protegido ni interferir con la operación.'],
          ['Responsabilidad del usuario', 'Los usuarios son responsables de cómo interpretan y usan la información presentada. MarketSentinel no coloca apuestas, acepta depósitos, custodia fondos ni ejecuta transacciones por usuarios.'],
          ['Disponibilidad y precisión', 'El servicio puede depender de datos de terceros, procesos programados, disponibilidad de red y outputs de modelos. Los datos pueden estar retrasados, incompletos, vencidos o incorrectos.'],
          ['Propiedad intelectual', 'La interfaz, estructura de análisis, reportes y presentación generada por MarketSentinel son contenido protegido salvo que se indique lo contrario.'],
          ['Cambios', 'MarketSentinel puede actualizar funciones, contenido, fuentes de datos y estos términos a medida que evoluciona el producto.'],
        ],
      },
      privacy: {
        title: 'Política de Privacidad',
        updated: 'Actualizado: 16 de mayo de 2026',
        sections: [
          ['Información procesada', 'MarketSentinel puede procesar información técnica como metadata de requests, contexto de dispositivo/navegador, diagnósticos y logs operativos necesarios para mantener la confiabilidad del servicio.'],
          ['Contacto y cuentas', 'Si se agregan captura de email, cuentas, pagos o formularios de soporte, la información provista por usuarios debe usarse para operar el servicio, dar soporte y comunicar actualizaciones del producto.'],
          ['Analítica', 'El sitio puede usar analítica respetuosa de privacidad para entender patrones de uso, errores y rendimiento del producto.'],
          ['Compartición de datos', 'MarketSentinel no debe vender información personal. Datos limitados pueden ser procesados por proveedores de hosting, analítica, pagos, soporte o infraestructura cuando sea necesario para operar el servicio.'],
          ['Solicitudes del usuario', 'Los usuarios pueden contactar al operador para solicitar acceso, corrección o eliminación de información personal cuando aplique.'],
        ],
      },
      disclaimer: {
        title: 'Disclaimer',
        updated: 'Actualizado: 16 de mayo de 2026',
        sections: [
          ['Propósito informativo', 'MarketSentinel provee análisis de mercado, output de modelos y contexto de soporte para decisiones. No es asesoría financiera, legal, fiscal, de apuestas ni profesional.'],
          ['Sin garantías', 'Ningún modelo, señal, reporte o vista del dashboard garantiza un resultado, ganancia, movimiento de mercado o outcome deportivo. Los deportes y mercados siguen siendo inciertos.'],
          ['Juicio independiente', 'Los usuarios deben aplicar juicio independiente, verificar información y considerar sus propias circunstancias antes de tomar cualquier decisión.'],
          ['Datos de terceros', 'MarketSentinel puede depender de fuentes externas. Los datos de terceros pueden estar retrasados, revisados, ausentes o incorrectos.'],
          ['Reglas locales', 'Los usuarios son responsables de entender y seguir leyes, reglas y términos de plataformas aplicables en su ubicación.'],
        ],
      },
      responsible: {
        title: 'Uso Responsable',
        updated: 'Actualizado: 16 de mayo de 2026',
        sections: [
          ['Leer señales como probabilidades', 'Una señal es una lectura estructurada del modelo, no una certeza. Edge, timing, volatilidad, persistencia y flags de riesgo deben leerse juntos.'],
          ['Respetar la incertidumbre', 'Incluso señales fuertes pueden fallar. Los resultados de corto plazo pueden no reflejar la calidad del proceso.'],
          ['Usar límites', 'Usuarios que apliquen la información a decisiones personales deben definir límites, evitar conducta impulsiva y evitar decisiones que generen presión financiera o emocional.'],
          ['Revisar frescura', 'Revisa siempre la hora de la última captura, la ventana operativa y los indicadores de calidad de datos antes de apoyarte en una vista.'],
          ['Buscar ayuda si hace falta', 'Cualquier persona que experimente pérdida de control, estrés o conducta dañina relacionada con apuestas o riesgo financiero debe detenerse y buscar apoyo calificado.'],
        ],
      },
    },
  },
};

export default function LegalFooter() {
  const { language } = useLanguage();
  const copy = POLICIES[language] || POLICIES.en;
  const [activeDoc, setActiveDoc] = useState(null);
  const doc = activeDoc ? copy.docs[activeDoc] : null;

  return (
    <>
      <footer className="mx-auto mt-6 max-w-[2000px] border-t border-slate-700/30 py-5">
        <div className="flex flex-col gap-3 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>{copy.footerNote}</div>
          <div className="flex flex-wrap gap-3">
            {copy.links.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveDoc(key)}
                className="text-slate-400 transition hover:text-sky-200"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {doc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-3 py-4 backdrop-blur-sm sm:items-center">
          <section className="panel panel-strong max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700/40 pb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{doc.title}</h2>
                <div className="mt-1 mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{doc.updated}</div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDoc(null)}
                className="rounded-xl border border-slate-700/45 px-3 py-2 text-xs text-slate-300 transition hover:border-sky-300/40 hover:text-sky-100"
              >
                {copy.close}
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {doc.sections.map(([title, body]) => (
                <div key={title} className="rounded-2xl border border-slate-700/35 bg-slate-950/35 px-4 py-3">
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">{body}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
