import type { ReactNode } from 'react'

const LAST_UPDATE = '06 de febrero de 2026'

const INDEX = [
  { id: 'objeto-y-aceptacion', label: '1. Objeto y aceptación' },
  { id: 'naturaleza-de-la-plataforma', label: '2. Naturaleza de la Plataforma' },
  { id: 'registro-y-cuentas', label: '3. Registro y cuentas de usuario' },
  { id: 'publicaciones-planes-y-creditos', label: '4. Publicaciones, planes y créditos' },
  { id: 'estados-y-vencimiento', label: '5. Estados y vencimiento de avisos' },
  { id: 'operaciones-entre-usuarios', label: '6. Operaciones entre usuarios' },
  { id: 'contenido-generado', label: '7. Contenido generado por los usuarios' },
  { id: 'preguntas-whatsapp-y-contacto', label: '8. Preguntas, WhatsApp y contacto' },
  { id: 'prohibiciones', label: '9. Prohibiciones' },
  { id: 'resenas-y-reputacion', label: '10. Reseñas y reputación' },
  { id: 'moderacion', label: '11. Herramientas de moderación' },
  { id: 'ciclo-trust', label: '12. Ciclo Trust y Verificación de Identidad' },
  { id: 'tiendas-oficiales', label: '13. Tiendas oficiales' },
  { id: 'analiticas', label: '14. Analíticas y métricas' },
  { id: 'propiedad-intelectual', label: '15. Propiedad intelectual' },
  { id: 'comunicaciones', label: '16. Comunicaciones' },
  { id: 'limitacion-de-responsabilidad', label: '17. Limitación de responsabilidad' },
  { id: 'legislacion-y-jurisdiccion', label: '18. Legislación y jurisdicción aplicable' },
  { id: 'contacto', label: '19. Contacto' },
] as const

export default function Terms() {
  return (
    <div className="bg-gray-50">
      <div className="mx-auto max-w-4xl px-6">
        <div className="my-10 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm md:p-12">
          <header>
            <h1 className="text-3xl font-bold text-mb-ink mb-2">Términos y Condiciones de Uso</h1>
            <p className="text-gray-500 mb-8">Última actualización: {LAST_UPDATE}</p>
          </header>

          <div className="mb-10 rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-900">Índice</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INDEX.map((entry) => (
                <a key={entry.id} href={`#${entry.id}`} className="text-sm text-mb-primary hover:underline">
                  {entry.label}
                </a>
              ))}
            </div>
          </div>

          <Section id="objeto-y-aceptacion" title="1. Objeto y aceptación">
            <p>
              Estos Términos y Condiciones (los “Términos”) regulan el acceso y uso del sitio web Ciclo Market (la
              “Plataforma”). El uso de la Plataforma implica la aceptación plena de estos Términos. Si no estás de acuerdo
              con ellos, no utilices el sitio ni los servicios asociados.
            </p>
            <p>
              La empresa se reserva el derecho de modificar estos Términos en cualquier momento. Las nuevas versiones se
              publicarán en esta página e indicarán la fecha de vigencia. El uso posterior a la publicación implica la
              aceptación de los cambios. Consultas formales o notificaciones pueden dirigirse a{' '}
              <a href="mailto:admin@ciclomarket.ar" className="underline">
                admin@ciclomarket.ar
              </a>
              .
            </p>
          </Section>

          <Section id="naturaleza-de-la-plataforma" title="2. Naturaleza de la Plataforma">
            <p>
              Ciclo Market es un marketplace que permite la publicación de bicicletas y productos vinculados por parte de
              vendedores independientes y la interacción con potenciales compradores. La empresa no es propietaria de los
              artículos publicados, no participa de las transacciones entre usuarios y no actúa como intermediario
              financiero.
            </p>
            <p>
              Los usuarios son los únicos responsables de la veracidad de la información publicada, del estado de los
              productos ofrecidos, del cumplimiento de sus obligaciones fiscales y contractuales, así como de cualquier
              pago, entrega, pérdida, robo o estafa que pudiese ocurrir durante la operación.
            </p>
          </Section>

          <Section id="registro-y-cuentas" title="3. Registro y cuentas de usuario">
            <p>
              Podrán registrarse personas mayores de 18 años con capacidad legal o personas jurídicas representadas por
              quien cuente con facultades suficientes. Es obligatorio completar el formulario con datos veraces, exactos y
              actualizados, así como mantener vigente una dirección de correo electrónico. Cada cuenta es personal, única e
              intransferible.
            </p>
            <p>
              El usuario es responsable por la confidencialidad de su contraseña y por todas las operaciones realizadas
              desde su cuenta, aun cuando delegue su uso a terceros. Ante cualquier uso no autorizado o incidente de
              seguridad, deberá notificarlo inmediatamente a admin@ciclomarket.ar.
            </p>
          </Section>

          <Section id="publicaciones-planes-y-creditos" title="4. Publicaciones, planes y créditos">
            <p>
              Los vendedores pueden publicar productos respetando las categorías disponibles y los requisitos de la
              Plataforma. Es obligatorio describir el artículo con claridad, incluir fotografías reales y consignar precio,
              moneda y ubicación. La modificación de precios o la cancelación de publicaciones es responsabilidad exclusiva
              del vendedor.
            </p>
            <p>
              La Plataforma ofrece planes y beneficios diferenciales (Gratis, Básico, Premium, Pro). Para contratar planes
              pagos o publicar con destaque, el usuario puede adquirir créditos de publicación a través de un proveedor de
              pagos. Dichos créditos pueden vencer si no se utilizan dentro del plazo informado. Salvo lo exigido por
              normativa aplicable, los importes pagados no son reembolsables.
            </p>
          </Section>

          <Section id="estados-y-vencimiento" title="5. Estados y vencimiento de avisos">
            <p>
              Los avisos pueden encontrarse en estados como activo, pausado o eliminado/archivado. Las publicaciones del
              plan Gratis vencen automáticamente según lo indicado en la plataforma (ej. 15 días) salvo indicación en
              contrario. Las publicaciones asociadas a tiendas verificadas o planes superiores tienen condiciones de
              duración extendida. La Plataforma puede depurar u ocultar automáticamente avisos vencidos.
            </p>
          </Section>

          <Section id="operaciones-entre-usuarios" title="6. Operaciones entre usuarios">
            <p>
              Toda negociación, pago, entrega, retiro o servicio logístico que derive del uso de la Plataforma se realiza
              directamente entre usuarios. La empresa no interviene en la selección de medios de pago, transportistas,
              condiciones de entrega ni garantías. Recomendamos utilizar medios de pago seguros y acordar entregas en
              lugares públicos.
            </p>
          </Section>

          <Section id="contenido-generado" title="7. Contenido generado por los usuarios">
            <p>
              Todo contenido publicado es responsabilidad del usuario que lo genera. El material no debe infringir
              derechos de terceros, violar leyes vigentes ni contener información falsa. La empresa puede editar o remover
              contenidos que incumplan estas condiciones.
            </p>
          </Section>

          <Section id="preguntas-whatsapp-y-contacto" title="8. Preguntas, WhatsApp y contacto">
            <p>
              La Plataforma ofrece secciones de preguntas y respuestas. El botón de WhatsApp está disponible solo en planes
              habilitados. Está prohibido publicar datos de contacto directo en las preguntas públicas para eludir los
              mecanismos de la plataforma.
            </p>
          </Section>

          <Section id="prohibiciones" title="9. Prohibiciones">
            <p>
              Está prohibido publicar artículos robados, falsificados, armas, sustancias ilegales o cualquier producto cuyo
              comercio esté restringido. Se prohíbe el uso de la Plataforma para realizar spam o ejecutar ataques
              informáticos.
            </p>
          </Section>

          <Section id="resenas-y-reputacion" title="10. Reseñas y reputación">
            <p>
              Los compradores pueden dejar reseñas y calificaciones. Nos reservamos el derecho de moderar reseñas que
              vulneren estos Términos. Los indicadores de reputación son orientativos.
            </p>
          </Section>

          <Section id="moderacion" title="11. Herramientas de moderación">
            <p>
              La empresa podrá requerir documentación adicional, suspender funcionalidades o cancelar cuentas ante sospechas
              de fraude o incumplimiento, sin derecho a indemnización.
            </p>
          </Section>

          <Section id="ciclo-trust" title="12. Ciclo Trust y Verificación de Identidad">
            <p>
              La Plataforma ofrece el programa &quot;Ciclo Trust&quot; mediante el cual ciertos usuarios pueden obtener una
              insignia de verificación tras validar su identidad (ej. mediante validación biométrica o documental).
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Alcance:</strong> La insignia Ciclo Trust indica únicamente que el usuario ha completado un proceso
                de validación de identidad en un momento dado.
              </li>
              <li>
                <strong>No Garantía:</strong> Ciclo Trust <strong>NO constituye una garantía</strong> sobre la honestidad
                del usuario, la calidad del producto, ni el éxito de la transacción. Ciclo Market no se responsabiliza por
                actos fraudulentos realizados por usuarios, cuenten o no con la insignia Ciclo Trust.
              </li>
              <li>
                <strong>Revocación:</strong> Ciclo Market se reserva el derecho de remover la insignia y suspender la cuenta
                si detecta un uso indebido o cambios en la identidad del titular.
              </li>
            </ul>
          </Section>

          <Section id="tiendas-oficiales" title="13. Tiendas oficiales">
            <p>
              Las tiendas verificadas (Plan Pro) acceden a perfiles con identidad visual. La verificación de tienda no
              implica garantía sobre inventario o cumplimiento comercial por parte de Ciclo Market.
            </p>
          </Section>

          <Section id="analiticas" title="14. Analíticas y métricas">
            <p>
              Registramos eventos de uso para mejorar el servicio y brindar métricas a los vendedores. El tratamiento de
              datos se detalla en la Política de Privacidad.
            </p>
          </Section>

          <Section id="propiedad-intelectual" title="15. Propiedad intelectual">
            <p>
              Los derechos sobre la marca Ciclo Market pertenecen a la empresa. Queda prohibido reproducir la plataforma
              sin autorización.
            </p>
          </Section>

          <Section id="comunicaciones" title="16. Comunicaciones">
            <p>Podremos enviarte comunicaciones operativas y novedades. Podés gestionar tus preferencias de contacto.</p>
          </Section>

          <Section id="limitacion-de-responsabilidad" title="17. Limitación de responsabilidad">
            <p>
              La Plataforma se ofrece “tal como está”. La empresa no garantiza que el servicio sea ininterrumpido. No se
              responde por daños indirectos o lucro cesante derivados del uso del sitio.
            </p>
          </Section>

          <Section id="legislacion-y-jurisdiccion" title="18. Legislación y jurisdicción aplicable">
            <p>
              Estos Términos se rigen por las leyes de la República Argentina. Se establece la jurisdicción de los
              tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.
            </p>
          </Section>

          <Section id="contacto" title="19. Contacto">
            <p>Ante dudas o reclamos: admin@ciclomarket.ar.</p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">{title}</h2>
      <div className="space-y-4 text-gray-600 leading-relaxed text-base">{children}</div>
    </section>
  )
}
