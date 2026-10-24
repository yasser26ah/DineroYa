// ===========================================================================
// DineroYa — Términos y Condiciones de Uso
// ===========================================================================
import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { Btn } from '../components/ui';

type Acc = 'intro' | 'plataforma' | 'credito' | 'prohibido' | 'cambios' | 'contacto';

const LABELS: Record<Acc, string> = {
  intro: 'Acuerdo general',
  plataforma: 'Plataforma',
  credito: 'Crédito',
  prohibido: 'Uso prohibido',
  cambios: 'Cambios',
  contacto: 'Contacto y responsable',
};

const PARA: Record<Acc, string> = {
  intro: 'Introducción y alcance del acuerdo',
  plataforma: 'Uso de la plataforma',
  credito: 'Condiciones relacionadas con crédito',
  prohibido: 'Usos no permitidos',
  cambios: 'Actualización y vigencia',
  contacto: 'Responsable del tratamiento y contacto',
};

export const TermsPage: React.FC = () => {
  const [acc, setAcc] = useState<Acc>('intro');
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 px-6 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-5xl">
        {/* Cabecera */}
        <header className="mb-10">
          <div className="mb-6 flex items-center justify-center gap-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black text-white tracking-tight">DineroYa</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Términos y Condiciones de Uso</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-500 font-medium max-w-3xl mx-auto leading-relaxed">
              Al usar DineroYa, usted declara ser una persona mayor de edad y acepta estos Términos y la
              Política de Privacidad. Léalo antes de continuar. Estos documentos describen cómo funcionamos y
              qué esperar del servicio; no constituyen asesoría legal ni un contrato de crédito en sí mismo.
            </p>
          </div>
          <div className="mt-4 inline-block text-xs font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl">
            Previo al uso, revise los derechos aplicables en su jurisdicción.
          </div>
        </header>

        {/* Tabla de contenidos */}
        <nav className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.keys(LABELS).map((k) => {
            const selected = k as Acc;
            return (
              <button
                key={selected}
                onClick={() => setAcc(selected)}
                className={`text-left rounded-2xl p-4 border transition-colors ${
                  acc === selected
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-black'
                    : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-1">{LABELS[selected]}</p>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{PARA[selected]}</p>
              </button>
            );
          })}
        </nav>

        {/* Contenido */}
        <article className="bg-white rounded-3xl border border-slate-100 p-6 lg:p-10 shadow-sm">
          <div className="flex flex-col gap-8">
            {acc === 'intro' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{PARA[acc]}</h2>
                <p>
                  Estos Términos de Uso y nuestra Política de Privacidad constituyen el acuerdo entre usted y
                  DineroYa (“la plataforma”, “nosotros”, “nuestro”). Al registrarse o acceder al servicio,
                  usted reconoce que ha leído, comprendido y aceptado estos términos, y ser una persona mayor de
                  edad con capacidad para contratar en su jurisdicción.
                </p>
                <p>
                  La plataforma fue diseñada para facilitar el seguimiento y la gestión de solicitudes y créditos
                  personales, con un enfoque en transparencia, control por parte del cliente y registro de
                  movimientos. Nuestro servicio es una herramienta de administración y seguimiento; no es una
                  asesoría financiera, legal, fiscal ni de inversión.
                </p>
                <p>
                  Si no está de acuerdo con alguno de estos términos, no use la plataforma. El acceso y uso
                  continuado implica aceptación. Para personas con edad inferior a la aplicable en su mercado,
                  el acceso y registro están restringidos conforme a la ley local aplicable.
                </p>
                <h3>Información geográfica y alcance</h3>
                <p>
                  La plataforma puede ser usada desde distintos mercados, incluyendo Colombia, la Unión Europea
                  y Estados Unidos, entre otros. Para cada mercado, aplican normas de protección de datos, edad
                  y crédito que pueden diferir de las aquí descritas. Recomendamos que se familiarice con la ley
                  local e interprete estos documentos como bases globales suplementadas por la normativa de su
                  país.
                </p>
                <h3>Definiciones básicas</h3>
                <ul>
                  <li>
                    <strong>Cliente:</strong> persona mayor de edad que solicita, recibe o administra un crédito
                    o solicitud a través de la plataforma.
                  </li>
                  <li>
                    <strong>Usuario representante del equipo:</strong> persona autorizada que gestiona cartera,
                    pagos, asignaciones y configuración en nombre del prestamista o entidad financiera.
                  </li>
                  <li>
                    <strong>Solicitud de crédito:</strong> la información que usted entrega para que el equipo
                    evalúe la posibilidad de otorgar un crédito.
                  </li>
                  <li>
                    <strong>Datos personales:</strong> cualquier información que nos permita identificarle, como
                    nombre, documento, teléfono, correo electrónico y fecha de nacimiento.
                  </li>
                  <li>
                    <strong>Prestamista o entidad financiera:</strong> quien, al final, otorga o no el crédito y
                    cuyos términos contractuales aplican al producto financiero. En algunos casos ese será nosotros;
                    en otros, un tercero asociado. La plataforma es el canal, no necesariamente la fuente del
                    crédito.
                  </li>
                </ul>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Aviso importante</p>
                  <p>
                    Este documento es informativo y refleja nuestras prácticas comunes. No reemplaza la revisión
                    por un abogado o profesional calificado en su país. Los créditos se conceden, si es que se
                    conceden, bajo condiciones que dependen del producto, la evaluación de riesgo, la normativa
                    aplicable y la política interna del prestamista.
                  </p>
                </div>
              </>
            )}

            {acc === 'plataforma' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{PARA[acc]}</h2>
                <p>
                  El acceso a la plataforma requiere crear una cuenta con datos de identificación, un correo
                  electrónico y una contraseña. Usted se responsabiliza de mantener la confidencialidad de sus
                  credenciales y de toda actividad que se realice bajo su cuenta. Le recomendamos usar una
                  contraseña única y no compartirla con terceros.
                </p>
                <p>
                  Sabemos que protegemos datos personales de clientes y usuarios. Por eso, el acceso, la
                  conservación y la eliminación de esos datos siguen principios de necesidad, proporcionalidad y
                  seguridad. Leer y aceptar la Política de Privacidad es parte de crear o usar la cuenta.
                </p>
                <h3>Funciones del cliente</h3>
                <ul>
                  <li>Ver sus solicitudes y créditos activos, sus próximas cuotas y el historial de movimientos.</li>
                  <li>Administre la información de su perfil cliente cuando la plataforma lo permita.</li>
                  <li>Comuníquese con el equipo en los canales indicados cuando necesite soporte, aclaraciones
                    o ejercer sus derechos sobre sus datos.</li>
                </ul>
                <h3>Funciones del equipo representante</h3>
                <p>
                  El equipo o la entidad financiera puede usar la plataforma para evaluar solicitudes, asignar
                  gestores, registrar pagos y abonos, registrar gestiones de cobranza, y mantener la
                  trazabilidad de las operaciones. Los permisos de cada usuario del equipo son gestionados
                  internamente y no necesariamente visibles por el cliente.
                </p>
                <h3>Limitationes y alta disponibilidad</h3>
                <p>
                  Hacemos lo razonable por mantener la plataforma operativa. Sin embargo, no garantizamos
                  disponibilidad ininterrumpida, ni ausencia de errores o interrupciones técnicas. La plataforma
                  puede suspenderse, modificarse o ceased temporalmente por mantenimiento, mejora, incidencia
                  técnica o por motivos legales.
                </p>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">No garantía de obtener crédito</p>
                  <p>
                    El uso de la plataforma no garantiza la aprobación de ninguna solicitud de crédito. La
                    aprobación depende de la evaluación interna, los criterios de riesgo y las condiciones
                    aplicables.
                  </p>
                </div>
              </>
            )}

            {acc === 'credito' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{PARA[acc]}</h2>
                <p>
                  Si usted solicita un crédito, la aprobación corresponde al prestamista o entidad financiera
                  aplicable, según el caso, y se basa en la información proporcionada, los criterios internos de
                  evaluación y la normativa vigente en su mercado. Podemos solicitar documentación adicional
                  antes de una decisión.
                </p>
                <h3>Divulgaciones previas al crédito</h3>
                <p>
                  Antes de que usted firme o acepte el contrato de crédito, le presentaremos las condiciones
                  aplicables de manera clara, conspicua y accesible. Entre los elementos que pueden incluirse,
                  según el producto y el mercado:
                </p>
                <ul>
                  <li>El importe financiado y la forma en que se constituye el crédito.</li>
                  <li>El interés, la tasa y el costo financiero total, cuando aplique.</li>
                  <li>El número y la periodicidad de las cuotas, y la forma de cálculo del calendario de pagos.</li>
                  <li>La forma y los medios de pago aceptados.</li>
                  <li>Las condiciones de mora, penalizaciones, cargos y gastos aplicables.</li>
                  <li>Las consecuencias de un pago tardío o de no pagar, dentro de lo permitido por la ley.</li>
                  <li>Las opciones de reclamo, ajuste o rescisión, cuando existan.</li>
                </ul>
                <h3>Evaluación automatizada</h3>
                <p>
                  En algunos mercados, parte de la evaluación puede involucrar procedimientos automatizados o
                  basados en reglas. Si su solicitud se evalúa de esa forma, le informaremos la existencia de
                  dichos procedimientos, los datos que se consideran, y sus derechos de acceder, rectificar,
                  objetar y solicitar una revisión humana, de acuerdo con la ley aplicable.
                </p>
                <h3>Decisión adversa y avisos</h3>
                <p>
                  Si una solicitud no es aprobada, le comunicaremos la decisión y, cuando la ley lo exija o sea
                  aplicable, las razones esenciales o la información para obtenerlas. En algunos mercados, cuando
                  la decisión se basa en reportes o información crediticia, se aplican avisos específicos que
                  respetamos.
                </p>
                <h3>Pago, abonos y prorrateo</h3>
                <p>
                  Cuando usted paga o hace un abono, el importe se aplica primero a lo vencido o a la cuota más
                  antigua pendiente, de acuerdo con la política del prestamista y la operación interna. Los
                  abonos anticipados no sustituyen la obligación contractual; consultar las condiciones de su
                  producto específico antes de realizar pagos parciales anticipados.
                </p>
                <h3>Mora</h3>
                <p>
                  Si usted retrasa el pago, pueden aplicarse intereses de mora o cargos según el contrato y la
                  ley. El importe exacto y la forma de cálculo dependen del producto, la jurisdicción y los
                  términos contractuales.
                </p>
                <h3>Reporte e información crediticia</h3>
                <p>
                  Cuando la ley y los acuerdos permitan, las operaciones pueden ser reportadas a entidades de
                  información crediticia. Eso puede influir en su historial crediticio. Si su cuenta tiene
                  movimientos negativos que puedan reportarse, le notificaremos según corresponda, con la
                  antelación permitida por la ley si aplica.
                </p>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Para Estados Unidos</p>
                  <p>
                    Si usted se encuentra en Estados Unidos y opera un producto de crédito de consumo cubierto,
                    pueden aplicar las leyes TILA / Regulation Z y ECOA. Las divulgaciones deben cumplirse antes
                    de perfeccionar la operación y, si hay denegación, puede haber avisos obligatorios. La
                    plataforma facilita la presentación y el registro, pero es el prestamista quien responde por
                    las divulgaciones contractuales y legales en su rol aplicable.
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4 mt-4">
                  <p className="font-bold mb-1">Para Colombia</p>
                  <p>
                    En Colombia, el manejo de datos personales de clientes y la posible información crediticia
                    están sujetos a la normativa de protección de datos y a las reglas del sector financiero. Si
                    usted recibe un reporte negativo como consecuencia de una operación con nosotros, se respetarán
                    los derechos de consulta, rectificación y reclamo, y las comunicaciones previas allí establecidas
                    cuando corresponda.
                  </p>
                </div>
              </>
            )}

            {acc === 'prohibido' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{PARA[acc]}</h2>
                <p>Usted no podrá usar la plataforma para:</p>
                <ul>
                  <li>Engañar, ocultar información relevante o proporcionar datos falsos en una solicitud.</li>
                  <li>Usar la cuenta de otra persona, o permitir que terceros accedan a ella sin autorización.</li>
                  <li>Comercializar, redistribuir, automatizar el acceso o extraer datos de la plataforma de forma
                    no autorizada.</li>
                  <li>Burlar los controles de acceso, permisos o seguridad.</li>
                  <li>Usar la plataforma para actividades ilegales, inclusión de contenido ilícito o que infringe
                    los derechos de terceros.</li>
                  <li>Alterar, reenviar o interceptar comunicaciones de la plataforma con finalidades no autorizadas.</li>
                </ul>
                <p>
                  Podemos suspender o restringir el acceso si detectamos uso indebido, actividad sospechosa o
                  incumplimiento de estos términos, conforme a la ley aplicable.
                </p>
              </>
            )}

            {acc === 'cambios' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{PARA[acc]}</h2>
                <p>
                  Nos reservamos el derecho de actualizar estos Términos, la Política de Privacidad y el resto de
                  documentos de la plataforma, con antelación razonable cuando corresponda y conforme a la ley
                  aplicable. Le notificaremos cambios importantes por los medios que tengamos disponibles, como el
                  correo electrónico registrado o un aviso en la plataforma.
                </p>
                <p>
                  El uso continuado después de la publicación de cambios implica aceptación de los mismos. Si
                  considera que un cambio es sustancial y no puede aceptarlo, deberá dejar de usar la plataforma.
                </p>
                <p>
                  Los créditos, pagos, saldos y fechas son registros del sistema y no constituyen por sí mismos
                  una garantía de resultado financiero.
                </p>
              </>
            )}

            {acc === 'contacto' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{PARA[acc]}</h2>
                <p>
                  Si tiene preguntas sobre estos términos, la privacidad, sus datos o un crédito gestionado a
                  través de la plataforma, contáctenos por los canales habilitados en el propio servicio o en la
                  página de contacto.
                </p>
                <h3>Responsable del tratamiento de datos</h3>
                <p>
                  La entidad responsable del tratamiento de sus datos personales es DineroYa, o en su caso la
                  entidad financiera, prestamista o socio al que corresponda según el producto y el país. Será
                  identificada en los avisos que le corresponda recibir, junto con su dirección de contacto, teléfono
                  y método para ejercer sus derechos.
                </p>
                <h3>Derechos sobre sus datos</h3>
                <p>
                  Dependiendo de su país, tendrá derecho a:
                </p>
                <ul>
                  <li>Conocer qué datos personales tratamos y para qué.</li>
                  <li>Acceder, rectificar, actualizar o, cuando corresponda, solicitar la supresión de sus datos.</li>
                  <li>Opositarse a tratamientos no esenciales, como la publicidad directa.</li>
                  <li>Solicitar la portabilidad de sus datos cuando la ley lo permita.</li>
                  <li>Retirar el consentimiento cuando este sea la base jurídica aplicable, sin que ello afecte la
                    legitimidad del tratamiento previo.</li>
                </ul>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Representante de contacto</p>
                  <p>
                    Usted puede contactarnos a través de canales habilitados en la plataforma o en la página de
                    contacto oficial. Si lo considera necesario, también puede quejarse ante la autoridad de
                    protección de datos de su país.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm leading-relaxed rounded-2xl p-4 mt-4">
                  <p className="font-bold mb-1">Bases jurídicas comunes por mercado</p>
                  <ul>
                    <li>
                      <strong>Unión Europea:</strong> el tratamiento puede basarse en el consentimiento, el
                      cumplimiento de un contrato, el interés legítimo o la obligación legal, según la finalidad.
                      Los datos se tratan con medidas de seguridad razonables y mediante los derechos del RGPD
                      cuando proceda.
                    </li>
                    <li>
                      <strong>Colombia:</strong> el tratamiento de datos personales seguirá la Ley 1581 de 2012 y
                      el Decreto 1377 de 2013, con autorización previa, expresa e informada donde aplique, y la
                      atención de derechos y consultas.
                    </li>
                    <li>
                      <strong>Estados Unidos:</strong> el tratamiento puede estar sujeto a normas estatales,
                      sectoriales y federales aplicables. Si la entidad corresponde a un prestamista o intermediario
                      cubierto, puede aplicar la FTC Safeguards Rule y otras reglas del sector.
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </article>

        {/* Aceptación del cliente */}
        <section className="mt-10 bg-white rounded-3xl border border-slate-100 p-6 lg:p-10 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-3">Aceptación para el cliente</h2>
          <p className="text-sm text-slate-600 font-medium mb-5 leading-relaxed">
            Si usted es el cliente afectado por un producto gestionado en DineroYa, use este apartado para
            confirmar que ha leído los Términos de Uso, la Política de Privacidad y las condiciones del producto
            financiero aplicable, y que es una persona mayor de edad en su jurisdicción.
          </p>

          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Declaro ser mayor de edad y haber leído y aceptado los Términos de Uso y la Política de Privacidad.
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Al activar la casilla, usted declara la veracidad de su edad y la aceptación de los documentos
                  de la plataforma. Este control es una medida técnica de recopilación de consentimiento y de
                  verificación de edad; no reemplaza la evaluación legal del producto.
                </p>
              </div>
            </label>

            <Btn
              onClick={() => setAcc('plataforma')}
              disabled={!accepted}
              className="w-full"
            >
              {accepted ? 'Aceptar y continuar' : 'Marque la casilla para continuar'}
            </Btn>
          </div>
        </section>

        <footer className="mt-12 text-center text-xs text-slate-400 font-medium">
          <p>© {new Date().getFullYear()} DineroYa · Términos y Condiciones de Uso</p>
          <p className="mt-1">Documento informativo con alcance global; revise los documentos específicos de su país.</p>
        </footer>
      </div>
    </div>
  );
};
