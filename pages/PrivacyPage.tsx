// ===========================================================================
// DineroYa — Política de Privacidad y Protección de Datos
// ===========================================================================
import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Btn } from '../components/ui';

type Sec = 'intro' | 'datos' | 'finalidad' | 'base' | 'derechos' | 'seguridad' | 'cookies' | 'contacto';

const LABELS: Record<Sec, string> = {
  intro: 'Resumen',
  datos: 'Datos que recogemos',
  finalidad: 'Para qué',
  base: 'Base jurídica',
  derechos: 'Sus derechos',
  seguridad: 'Seguridad',
  cookies: 'Cookies',
  contacto: 'Responsable y contacto',
};

const RESUMEN: Record<Sec, string> = {
  intro: 'Síntesis rápida del documento.',
  datos: 'Qué recogemos y cuándo.',
  finalidad: 'Usos específicos.',
  base: 'Por qué podemos tratarlos.',
  derechos: 'Qué puede pedir.',
  seguridad: 'Cómo nos cuidamos.',
  cookies: 'Qué sabemos de cookies.',
  contacto: 'Quién es el responsable.',
};

export const PrivacyPage: React.FC = () => {
  const [sec, setSec] = useState<Sec>('intro');
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 px-6 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-5xl">
        {/* Cabecera */}
        <header className="mb-10">
          <div className="mb-6 flex items-center justify-center gap-4">
            <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black text-white tracking-tight">DineroYa</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Política de Privacidad y Protección de Datos</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-500 font-medium max-w-3xl mx-auto leading-relaxed">
              DineroYa tratará sus datos personales con transparencia y seguridad. Esta política explica qué
              recogemos, con qué finalidad, bajo qué base jurídica y qué derechos tiene. Si los Términos y
              Condiciones son el “cómo usamos la plataforma”, esta es la “cómo protegemos su información”.
            </p>
          </div>
          <div className="mt-4 inline-block text-xs font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl">
            Previo a registrarse, revise su información de privacidad y datos.
          </div>
        </header>

        {/* Tabla de contenidos */}
        <nav className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.keys(LABELS).map((k) => {
            const selected = k as Sec;
            return (
              <button
                key={selected}
                onClick={() => setSec(selected)}
                className={`text-left rounded-2xl p-4 border transition-colors ${
                  sec === selected
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-black'
                    : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-1">{LABELS[selected]}</p>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{RESUMEN[selected]}</p>
              </button>
            );
          })}
        </nav>

        {/* Contenido */}
        <article className="bg-white rounded-3xl border border-slate-100 p-6 lg:p-10 shadow-sm">
          <div className="flex flex-col gap-8">
            {sec === 'intro' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  DineroYa (“la plataforma”, “nosotros”, “nuestro”) recoge y usa datos personales de clientes y
                  usuarios para que el servicio funcione, para gestionar solicitudes y créditos, para comunicarnos
                  contigo, y para cumplir con lo que la ley permite. Lo que aquí describimos es la información
                  estándar de la plataforma. Dependiendo de tu país y tu producto, pueden aplicar normas específicas.
                </p>
                <h3>Escopes del tratamiento</h3>
                <ul>
                  <li>Identificación y gestión de la cuenta de cliente o usuario representante.</li>
                  <li>Solicitudes de crédito y evaluación de riesgo, dentro de lo permitido.</li>
                  <li>Gestión de pagos, abonos, calendarios, saldos y movimientos.</li>
                  <li>Comunicaciones relacionadas con el servicio, incluyendo avisos de mora, promesas de pago,
                    recordatorios y, donde corresponda, notificaciones de informes crediticios.</li>
                  <li>Cumplimiento legal, seguridad y respuesta a solicitudes de derechos.</li>
                </ul>
                <h3>Mercados cubiertos</h3>
                <p>
                  Esta política aplica globalmente, pero los derechos, la base jurídica y los plazos pueden variar
                  según si te encuentras en Colombia, en la Unión Europea o en un Estado de Estados Unidos. La ley
                  local prevalece en lo que sea más beneficioso para tus derechos, dentro de lo que aplique.
                </p>
                <ul>
                  <li>
                    <strong>Unión Europea:</strong> Tratamiento conforme al Reglamento General de Protección de
                    Datos (RGPD). La información se ofrece en lenguaje claro, conciso y accesible, y los derechos
                    se ejercen sin coste desproporcionado.
                  </li>
                  <li>
                    <strong>Colombia:</strong> Tratamiento conforme a la Ley 1581 de 2012 y el Decreto 1377 de
                    2013, con autorización previa, expresa e informada donde la ley lo requiere, y conservación de
                    evidencia del consentimiento y de las consultas recibidas.
                  </li>
                  <li>
                    <strong>Estados Unidos:</strong> Tratamiento conforme a la normativa aplicable, incluyendo
                    reglas estatales y federales, y cuando corresponda, reglas del sector financiero.
                  </li>
                </ul>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Aviso importante</p>
                  <p>
                    Esta es una política informativa y no constituye asesoría legal ni una declaración legal
                    definitiva. La entidad responsable puede ser DineroYa, el prestamista o un socio, según el
                    producto y tu país; en ese caso, el aviso de contacto correspondiente te lo indicará.
                  </p>
                </div>
              </>
            )}

            {sec === 'datos' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  Recogemos los datos que son necesarios para que la plataforma funcione y para gestionar el
                  servicio y el crédito, con un principio de mínimo necesario.
                </p>
                <h3>Los que nos proporcionas directamente</h3>
                <ul>
                  <li>Nombre completo.</li>
                  <li>Correo electrónico.</li>
                  <li>Número de teléfono o celular.</li>
                  <li>Fecha de nacimiento y/o edad, para comprobar que eres mayor de edad donde aplique.</li>
                  <li>Documento de identidad, cuando sea necesario para identificación o cumplimiento legal.</li>
                  <li>Dirección y datos de contacto adicionales.</li>
                  <li>Información de la solicitud de crédito —por ejemplo, importe, condiciones, uso previsto,
                    ingresos o documentación de respaldo— según el producto.</li>
                  <li>Foto, solo en los casos en que sea necesaria para identificación o verificación.</li>
                </ul>
                <h3>Los que el sistema genera o deriva</h3>
                <ul>
                  <li>Registros de pagos, abonos y saldos pendientes.</li>
                  <li>Calendario de cuotas, fechas de vencimiento y movimientos entre fechas.</li>
                  <li>Historial de actividades, gestiones y comunicaciones en la plataforma.</li>
                  <li>Datos de auditoría interna para trazabilidad y seguridad.</li>
                  <li>Análisis y evaluación interna de riesgo, dentro del proceso de decisión.</li>
                </ul>
                <h3>Los que obtenemos de terceros autorizados</h3>
                <ul>
                  <li>Datos de autenticación en sistemas de login (cuando usas login con terceros).</li>
                  <li>Información de verificación o reportes, siempre que exista autorización previa o sea
                    exigible por ley.</li>
                  <li>Datos de los canales de contacto y operaciones, según tu configuración.</li>
                </ul>
                <h3>Datos sensibles</h3>
                <p>
                  Evitamos recoger datos sensibles cuando no son estrictamente necesarios. En los casos en que los
                  tratemos, lo haremos con base jurídica aplicable y medidas de protección adicionales. No
                  recopilamos datos biométricos ni de salud para la operación normal del servicio.
                </p>
              </>
            )}

            {sec === 'finalidad' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  Los datos sirven, en cada caso, para una o más finalidades concretas. No los usamos para fines
                  distintos sin informarte y, cuando corresponda, sin obtener tu consentimiento.
                </p>
                <ul>
                  <li>
                    <strong>Identificación y acceso:</strong> crear y validar tu cuenta, dar acceso a tu perfil y
                    a tus productos, y autenticar tu sesión.
                  </li>
                  <li>
                    <strong>Gestión del crédito y del pago:</strong> registrar la solicitud, calcular y mostrar el
                    calendario, guardar los pagos y abonos, y actualizar saldos y estado.
                  </li>
                  <li>
                    <strong>Comunicaciones del servicio:</strong> notificar movimientos, vencimientos, recordatorios
                    y avisos de operaciones asociadas a tu cuenta.
                  </li>
                  <li>
                    <strong>Atención al cliente y soporte:</strong> responder preguntas, gestionar incidencias y,
                    en su caso, promover o coordinar gestiones.
                  </li>
                  <li>
                    <strong>Evaluación y decisión de crédito:</strong> analizar la información necesaria y, donde
                    proceda, soportar la decisión del prestamista o evaluador.
                  </li>
                  <li>
                    <strong>Cumplimiento y seguridad:</strong> cumplir obligaciones legales, administrativas y de
                    seguridad, e investigar posibles incidencias o infracciones.
                  </li>
                  <li>
                    <strong>Mejora del servicio:</strong> analizar el uso para mejorar la plataforma, siempre dentro
                    del scope autorizado y sin fines de perfilado no consentido.
                  </li>
                </ul>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Comunicaciones comerciales</p>
                  <p>
                    Las comunicaciones comerciales se envían solo cuando tenemos una base jurídica o consentimiento
                    aplicable. Podrás darte de baja o retirar el consentimiento para marketing en la medida que la
                    ley lo permita. Las comunicaciones estrictamente necesarias para tu cuenta o tu crédito no
                    dependen de este consentimiento.
                  </p>
                </div>
              </>
            )}

            {sec === 'base' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  Dependiendo del país y de la finalidad, usamos una o más bases jurídicas. No asumimos que el
                  consentimiento sea siempre la única base, ni la más conveniente para cada caso.
                </p>
                <h3>Bases jurídicas por mercado</h3>
                <ul>
                  <li>
                    <strong>Unión Europea:</strong> puede basarse en el cumplimiento de un contrato, el consentimiento,
                    el interés legítimo o el cumplimiento de una obligación legal, según la finalidad. Cuando se usa
                    el consentimiento, éste es libre, específico, informado y revocable.
                  </li>
                  <li>
                    <strong>Colombia:</strong> la autorización previa, expresa e informada es la base común para datos
                    personales cuando la ley lo exige; para otras finalidades puede aplicarse el cumplimiento de un
                    contrato o la obligación legal. Conservamos evidencia de la autorización cuando proceda.
                  </li>
                  <li>
                    <strong>Estados Unidos:</strong> según el caso, puede aplicar consentimiento, cumplimiento de
                    contrato, interés legítimo o obligación legal, y la normativa del sector financiero cuando
                    corresponda.
                  </li>
                </ul>
                <h3>Conservación y portabilidad</h3>
                <p>
                  Conservamos los datos solo el tiempo necesario para la finalidad y para lo que la ley exija, con
                  la eliminación o anonimización posterior cuando proceda. Cuando sea aplicable y proceda, te facilitaremos
                  tus datos en un formato estructurado y de uso común.
                </p>
                <h3>Destinatarios y terceros</h3>
                <p>
                  No vendemos tus datos personales. Compartimos los datos con los terceros necesarios y comprometidos
                  a tratarlos bajo nuestras instrucciones y medidas de seguridad, como proveedores de infraestructura,
                  procesamiento y comunicación, y, cuando aplique y con la base jurídica adecuada, con entidades de
                  información crediticia, el prestamista, socios de verificación y, en caso de obligación legal, con
                  autoridades competentes.
                </p>
                <h3>Transferencias internacionales</h3>
                <p>
                  Puede que los datos viajen a países fuera de tu territorio. Si correspondiera, aplicamos los
                  mecanismos y garantías que la ley exija, incluido, cuando es necesario, cláusulas contractuales
                  tipo o mecanismos equivalentes.
                </p>
              </>
            )}

            {sec === 'derechos' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  Según tu país y la base jurídica aplicable, tendrás derecho a:
                </p>
                <ul>
                  <li>Saber si tratamos tus datos, para qué y con qué derechos tienes.</li>
                  <li>Acceder a los datos que te conciernen, cuando proceda.</li>
                  <li>Rectificar o actualizar datos inexactos.</li>
                  <li>Solicitar la supresión cuando corresponda, salvo que haya una obligación legal de conservarlos
                    o necesidad para reclamaciones, cumplimiento legal o seguridad.</li>
                  <li>Limitar el tratamiento en los casos que la ley reconozca.</li>
                  <li>Oponerse al tratamiento basado en intereses legítimos o a comunicaciones comerciales.</li>
                  <li>Solicitar la portabilidad, cuando proceda.</li>
                  <li>Retirar el consentimiento cuando éste sea la base jurídica, sin perjuicio de la legitimidad
                    del tratamiento previo.</li>
                </ul>
                <h3>Cómo se ejercen</h3>
                <p>
                  Puedes ejercer tus derechos por los canales habilitados en la plataforma o en el contacto oficial.
                  Te responderemos en los plazos aplicables y te notificaremos lo que corresponda. Si la respuesta no
                  satisface tu petición, también tendrás vía de reclamo ante la autoridad competente de tu país.
                </p>
                <h3>Reportes crediticios y derechos especiales</h3>
                <p>
                  Cuando la información de tu cuenta pueda ser reportada o influir en un informe crediticio, respetamos
                  las obligaciones de notificación previa y los avisos requeridos por la ley, cuando aplique, con la
                  antelación que corresponda.
                </p>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Información crediticia (Colombia)</p>
                  <p>
                    En caso de reporte negativo como consecuencia de una operación en DineroYa, se respetarán tus
                    derechos de consulta, rectificación, habeas data y reclamo, con los plazos y avisos previstos
                    cuando la ley lo requiera.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm leading-relaxed rounded-2xl p-4 mt-4">
                  <p className="font-bold mb-1">Decisión adversa (Estados Unidos)</p>
                  <p>
                    En Estados Unidos, si tu solicitud no es aprobada y se basa en un informe crediticio, pueden
                    aplicarse avisos obligatorios de decisión adversa. Te facilitaremos la información de cómo obtener
                    esas razones y de las fuentes utilizadas cuando corresponda.
                  </p>
                </div>
              </>
            )}

            {sec === 'seguridad' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  Implementamos medidas de seguridad razonables y proporcionales al riesgo, entre las que pueden
                  incluirse controles de acceso, cifrado de datos en tránsito y en reposo cuando corresponda,
                  gestión de claves, registro de accesos, copia de seguridad y monitorización de la plataforma.
                </p>
                <p>
                  En la Unión Europea, la seguridad se trata desde el principio de protección desde el diseño y por
                  defecto. Cuando detectamos una brecha que pueda representar un riesgo para los intereses de una
                  persona, actuamos sin demora indebida y notificamos a la autoridad competente en el plazo aplicable,
                  avisando a las personas afectadas cuando el riesgo sea alto.
                </p>
                <p>
                  En Estados Unidos, si nos aplicara la FTC Safeguards Rule, tomamos las medidas que exija.
                </p>
                <h3>Tu parte en la seguridad</h3>
                <ul>
                  <li>Usa una contraseña fuerte y no la compartas.</li>
                  <li>Mantén actualizado el dispositivo y el navegador.</li>
                  <li>No compartas credenciales ni copies enlaces sospechosos.</li>
                  <li>Notifícanos si ves actividad inusual en tu cuenta.</li>
                </ul>
              </>
            )}

            {sec === 'cookies' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  Usamos cookies o mecanismos equivalentes solo cuando son necesarios para que el servicio funcione,
                  como sesión y seguridad, o cuando hemos obtenido tu consentimiento donde la ley lo exija.
                </p>
                <h3>Tipos de cookies</h3>
                <ul>
                  <li>
                    <strong>Necesarias:</strong> necesarias para la sesión, la autenticación y el funcionamiento de
                    la plataforma. Pueden estar exentas de consentimiento cuando la ley lo permita.
                  </li>
                  <li>
                    <strong>Analíticas y de rendimiento:</strong> se usan solo con tu consentimiento cuando sea
                    necesario y siempre para mejorar el servicio.
                  </li>
                  <li>
                    <strong>De marketing/segmentación:</strong> requieren consentimiento previo. No usamos cookies
                    de rastreo para publicidad sin tu consentimiento donde la ley lo exija.
                  </li>
                </ul>
                <h3>Control y revocación</h3>
                <p>
                  Puedes configurar tu navegador para rechazar cookies, pero si lo haces, algunas funciones de la
                  plataforma pueden no funcionar correctamente. Puedes retirar el consentimiento en cualquier momento
                  con la misma facilidad con la que lo diste.
                </p>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">Para la Unión Europea</p>
                  <p>
                    Las cookies estrictamente necesarias para un servicio que has solicitado pueden estar exentas de
                    consentimiento. Las cookies de seguimiento, publicidad o analítica no exenta requieren tu consentimiento
                    previo y pueden retirarse cuando quieras.
                  </p>
                </div>
              </>
            )}

            {sec === 'contacto' && (
              <>
                <h2 className="text-lg font-black text-slate-900">{RESUMEN[sec]}</h2>
                <p>
                  La entidad responsable de tus datos personales es DineroYa, o en su caso el prestamista, la entidad
                  financiera o el socio al que corresponda según tu producto y tu país. El aviso de contacto oficial te
                  indicará la entidad responsable en tu caso, su dirección, teléfono y el método para ejercer tus derechos.
                </p>
                <h3>Quién es responsable en cada caso</h3>
                <ul>
                  <li>
                    <strong>DineroYa:</strong> cuando actuamos como responsable del tratamiento. En ese caso, nos
                    identificamos en los avisos y comunicados aplicables.
                  </li>
                  <li>
                    <strong>Prestamista o entidad financiera:</strong> cuando él es quien otorga el crédito o tiene la
                    obligación legal de proporcionar avisos de crédito o informes. En ese caso, él es el responsable
                    aplicable para ese producto.
                  </li>
                  <li>
                    <strong>Socio de verificación o reporte:</strong> cuando existe una base jurídica o autorización
                    que lo permita y aplica.
                  </li>
                </ul>
                <h3>Derechos de menores y edad</h3>
                <p>
                  La plataforma está dirigida a personas mayores de edad. No dirigimos el servicio a menores y bloqueamos
                  el registro si detectamos edad inferior a la aplicable. Para niños de 13 años o menos en Estados Unidos,
                  respetamos el marco COPPA, incluyendo la necesidad de consentimiento parental verificable; no
                  dirigimos el servicio a ese público y no obtenemos datos de menores de esa edad.
                </p>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm leading-relaxed rounded-2xl p-4">
                  <p className="font-bold mb-1">COPPA (Estados Unidos)</p>
                  <p>
                    Si la plataforma se dirigiera a niños de 13 años o menos, o supiéramos que recogemos datos de esa
                    edad, necesitaríamos consentimiento parental verificable. Como política de diseño, no dirigimos el
                    servicio a ese público y no recogemos intencionalmente datos de menores de 13.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm leading-relaxed rounded-2xl p-4 mt-4">
                  <p className="font-bold mb-1">Contacto</p>
                  <p>
                    Usa los canales habilitados en la plataforma o en la página de contacto oficial para preguntas sobre
                    privacidad, datos, créditos o reclamos. Si quieres presentar una reclamación, también puedes acudir
                    a la autoridad competente de tu país, como la autoridad de protección de datos o el organismo
                    financiero correspondiente.
                  </p>
                </div>
              </>
            )}
          </div>
        </article>

        {/* Aceptación del cliente */}
        <section className="mt-10 bg-white rounded-3xl border border-slate-100 p-6 lg:p-10 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-3">Aceptación para el cliente</h2>
          <p className="text-sm text-slate-600 font-medium mb-5 leading-relaxed">
            Como cliente, usted accede al servicio bajo estas condiciones de privacidad. Marque la casilla para
            confirmar que ha leído esta política y que acepta el tratamiento de sus datos personales para las
            finalidades descritas, incluyendo los usos de comunicación necesarios para su cuenta y crédito.
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
                  Declaro haber leído y aceptado la Política de Privacidad y el tratamiento de mis datos personales.
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Esta aceptación no es un contrato de crédito, pero sí la base para que podamos tratar tus datos según
                  estos términos. Puedes ejercer tus derechos en cualquier momento por los canales oficiales.
                </p>
              </div>
            </label>

            <Btn
              onClick={() => setSec('intro')}
              disabled={!accepted}
              className="w-full"
            >
              {accepted ? 'Aceptar y continuar' : 'Marque la casilla para continuar'}
            </Btn>
          </div>
        </section>

        <footer className="mt-12 text-center text-xs text-slate-400 font-medium">
          <p>© {new Date().getFullYear()} DineroYa · Política de Privacidad y Protección de Datos</p>
          <p className="mt-1">Documento global; revise la normativa local aplicable.</p>
        </footer>
      </div>
    </div>
  );
};
