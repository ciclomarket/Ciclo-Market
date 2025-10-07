import type { ReactNode } from 'react'
import Container from '../components/Container'

const LAST_UPDATE = '1 de marzo de 2024'

export default function Terms() {
  return (
    <div className="bg-[#14212e] py-10 text-white">
      <Container className="text-sm leading-relaxed">
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Ciclo Market</p>
            <h1 className="text-3xl font-semibold">Términos y Condiciones de Uso</h1>
            <p className="text-white/60">Última actualización: {LAST_UPDATE}</p>
          </header>

          <Section title="1. Objeto y aceptación">
            <p>
              Estos Términos y Condiciones (los “Términos”) regulan el acceso y uso del sitio web{' '}
              <strong>Ciclo Market</strong> (la “Plataforma”), propiedad de <strong>Ciclo Market S.A.S.</strong> con
              domicilio en Ciudad Autónoma de Buenos Aires, CUIT 30-00000000-0. El uso de la Plataforma implica la
              aceptación plena de estos Términos. Si no estás de acuerdo con ellos, no utilices el sitio ni los servicios
              asociados.
            </p>
            <p>
              La empresa se reserva el derecho de modificar estos Términos en cualquier momento. Las nuevas versiones se
              publicarán en esta página e indicarán la fecha de vigencia. El uso posterior a la publicación implica la
              aceptación de los cambios.
            </p>
          </Section>

          <Section title="2. Naturaleza de la Plataforma">
            <p>
              Ciclo Market es un marketplace que permite la publicación de bicicletas y productos vinculados por parte de
              vendedores independientes y la interacción con potenciales compradores. La empresa no es propietaria de los
              artículos publicados, no participa de las transacciones entre usuarios y no actúa como intermediario
              financiero.
            </p>
            <p>
              <strong>Los usuarios son los únicos responsables</strong> de la veracidad de la información publicada, del
              estado de los productos ofrecidos, del cumplimiento de sus obligaciones fiscales y contractuales, así como
              de cualquier pago, entrega, pérdida, robo o estafa que pudiese ocurrir durante la operación.
            </p>
          </Section>

          <Section title="3. Registro y cuentas de usuario">
            <p>
              Podrán registrarse personas mayores de 18 años con capacidad legal o personas jurídicas representadas por
              quien cuente con facultades suficientes. Es obligatorio completar el formulario con datos veraces, exactos y
              actualizados, así como mantener vigente una dirección de correo electrónico. Cada cuenta es personal, única
              e intransferible.
            </p>
            <p>
              El usuario es responsable por la confidencialidad de su contraseña y por todas las operaciones realizadas
              desde su cuenta, aun cuando delegue su uso a terceros. Ante cualquier uso no autorizado o incidente de
              seguridad, deberá notificarlo inmediatamente a soporte@ciclomarket.ar.
            </p>
          </Section>

          <Section title="4. Publicaciones y planes">
            <p>
              Los vendedores pueden publicar productos respetando las categorías disponibles y los requisitos de la
              Plataforma. Es obligatorio describir el artículo con claridad, incluir fotografías reales y consignar precio,
              moneda y ubicación. La modificación de precios o la cancelación de publicaciones es responsabilidad exclusiva
              del vendedor.
            </p>
            <p>
              Algunos servicios pueden requerir la contratación de planes pagos o destacados. Los precios, beneficios y
              límites de cada plan se informan dentro de la Plataforma. Los importes abonados no son reembolsables salvo
              que la normativa aplicable disponga lo contrario.
            </p>
          </Section>

          <Section title="5. Operaciones entre usuarios">
            <p>
              Toda negociación, pago, entrega, retiro o servicio logístico que derive del uso de la Plataforma se realiza
              directamente entre usuarios. La empresa no interviene en la selección de medios de pago, transportistas,
              condiciones de entrega ni garantías y no controla el cumplimiento de las partes. Cada usuario asume la
              totalidad de los riesgos asociados a su operación.
            </p>
            <p>
              Recomendamos utilizar medios de pago seguros, conservar comprobantes y acordar entregas en lugares públicos
              o con verificación previa del producto.
            </p>
          </Section>

          <Section title="6. Contenido generado por los usuarios">
            <p>
              Todo contenido publicado (textos, fotos, precios, videos, etc.) es responsabilidad del usuario que lo genera.
              El material no debe infringir derechos de terceros, violar leyes vigentes ni contener información falsa o
              desactualizada. La empresa puede editar o remover contenidos que incumplan estas condiciones.
            </p>
          </Section>

          <Section title="7. Prohibiciones">
            <p>
              Está prohibido publicar artículos robados, falsificados, armas, sustancias ilegales o cualquier producto cuyo
              comercio esté restringido o requiera autorización legal. Asimismo, se prohíbe el uso de la Plataforma para
              realizar spam, captar correos electrónicos, ejecutar ataques informáticos o utilizar la marca Ciclo Market sin
              autorización.
            </p>
          </Section>

          <Section title="8. Sistema de reputación y feedback">
            <p>
              La Plataforma podrá ofrecer herramientas de reputación con el objetivo de destacar perfiles confiables.
              Dichos indicadores se basan en métricas objetivas (por ejemplo, respuesta a mensajes o completitud del
              perfil) y pueden variar en el tiempo. No constituyen publicidad ni aval expreso de la empresa.
            </p>
          </Section>

          <Section title="9. Herramientas de moderación">
            <p>
              La empresa podrá requerir documentación adicional, suspender temporalmente funcionalidades, retirar
              publicaciones, marcar vendedores verificados o cancelar cuentas cuando detecte incumplimientos, sospechas de
              fraude o incumplimiento legal. Estas medidas buscan proteger a la comunidad y no generan derecho a reclamos o
              indemnizaciones.
            </p>
          </Section>

          <Section title="10. Propiedad intelectual">
            <p>
              Los derechos sobre la marca Ciclo Market, logos, diseño, software, bases de datos y demás elementos propios
              de la Plataforma pertenecen a la empresa o a sus licenciantes. Queda prohibido reproducir, distribuir o crear
              obras derivadas sin autorización expresa. El contenido generado por los usuarios sigue siendo de su
              propiedad, pero autorizan a la empresa a exhibirlo dentro de la Plataforma.
            </p>
          </Section>

          <Section title="11. Limitación de responsabilidad">
            <p>
              La Plataforma se ofrece “tal como está” y “según disponibilidad”. La empresa no garantiza que el servicio sea
              ininterrumpido o libre de errores, ni que los resultados satisfagan expectativas particulares. Dentro de los
              límites legales, no se responde por daños indirectos, lucro cesante, pérdida de chance ni por cualquier
              perjuicio derivado del uso o imposibilidad de uso del sitio.
            </p>
          </Section>

          <Section title="12. Legislación y jurisdicción aplicable">
            <p>
              Estos Términos se rigen por las leyes de la República Argentina. Para cualquier controversia que no pueda
              resolverse de forma directa entre las partes, se establece la jurisdicción de los tribunales ordinarios de la
              Ciudad Autónoma de Buenos Aires, renunciando a cualquier otro fuero o jurisdicción.
            </p>
          </Section>

          <Section title="13. Contacto">
            <p>
              Ante dudas, reclamos o solicitudes legales podés escribir a{' '}
              <a href="mailto:soporte@ciclomarket.ar" className="font-medium text-white hover:underline">
                soporte@ciclomarket.ar
              </a>{' '}
              o a{' '}
              <a href="mailto:privacidad@ciclomarket.ar" className="font-medium text-white hover:underline">
                privacidad@ciclomarket.ar
              </a>. También podés utilizar el formulario de contacto disponible en la Plataforma.
            </p>
          </Section>
        </div>
      </Container>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-white/80">{children}</div>
    </section>
  )
}
