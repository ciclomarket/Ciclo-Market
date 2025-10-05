import Container from '../components/Container'

const lastUpdate = '1 de marzo de 2024'

export default function Terms() {
  return (
    <Container className="py-10 text-sm leading-relaxed text-white/80">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 text-white">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Ciclo Market</p>
          <h1 className="text-3xl font-semibold">Términos y Condiciones de Uso</h1>
          <p className="text-white/60">Última actualización: {lastUpdate}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Objeto y aceptación</h2>
          <p>
            Estos Términos y Condiciones (los &quot;Términos&quot;) regulan el acceso y uso del sitio web{' '}
            <strong>Ciclo Market</strong> (en adelante, la &quot;Plataforma&quot;), propiedad de{' '}
            <strong>Ciclo Market S.A.S.</strong>, con domicilio en Ciudad Autónoma de Buenos Aires, CUIT 30-00000000-0.
            El uso de la Plataforma implica la aceptación plena de estos Términos. Si no estás de acuerdo,
            no uses el sitio ni los servicios asociados.
          </p>
          <p>
            La empresa se reserva el derecho de modificar los Términos en cualquier momento. Las nuevas
            versiones serán publicadas en esta página e indicarán la fecha de vigencia. El uso posterior a
            la publicación implica la aceptación de los cambios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. Naturaleza de la Plataforma</h2>
          <p>
            Ciclo Market es un marketplace que permite la publicación de bicicletas y productos vinculados
            por parte de vendedores independientes y la interacción con potenciales compradores. La empresa
            no es propietaria de los artículos publicados, no participa de las transacciones entre usuarios y
            no actúa como intermediario financiero.
          </p>
          <p>
            <strong>Los usuarios son los únicos responsables</strong> de la veracidad de la información
            publicada, del estado de los productos ofrecidos, del cumplimiento de sus obligaciones fiscales y
            contractuales, así como de cualquier pago, entrega, pérdida, robo o estafa que pudiese ocurrir
            durante la operación. La empresa no audita los artículos ni garantiza su procedencia, condición o
            disponibilidad.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. Registro y cuentas de usuario</h2>
          <p>
            Podrán registrarse personas humanas mayores de 18 años con capacidad legal o personas jurídicas
            representadas por quien cuente con facultades suficientes. Es obligatorio completar el formulario
            con datos veraces, exactos y actualizados, así como mantener vigente una dirección de correo
            electrónico. Cada cuenta es personal, única e intransferible; queda prohibida la creación de
            múltiples perfiles o el préstamo de credenciales.
          </p>
          <p>
            El usuario es responsable por la confidencialidad de su contraseña y por todas las operaciones
            realizadas desde su cuenta, aun cuando delegue su uso a terceros. Ante un uso no autorizado o
            cualquier incidente de seguridad, deberá notificarlo de inmediato a soporte@ciclomarket.ar.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Publicaciones y planes</h2>
          <p>
            Los vendedores pueden publicar productos respetando las categorías disponibles y los requisitos
            de la Plataforma. Es obligatorio describir el artículo con claridad, incluir fotografías reales y
            consignar precio, moneda y ubicación. La modificación de precios o la cancelación de publicaciones
            es responsabilidad exclusiva del vendedor.
          </p>
          <p>
            Algunos servicios pueden requerir la contratación de planes pagos o destacados. Los precios,
            beneficios y límites de cada plan se informan dentro de la Plataforma. Los importes abonados no
            son reembolsables salvo que la normativa aplicable disponga lo contrario.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. Operaciones entre usuarios</h2>
          <p>
            Toda negociación, pago, entrega, retiro o servicio logístico que derive del uso de la Plataforma
            se realiza directamente entre usuarios. La empresa no interviene en la selección de medios de pago,
            transportistas, condiciones de entrega ni garantías, y no controla el cumplimiento de las partes.
            Cada usuario asume la totalidad de los riesgos asociados a la transacción que decida concretar.
          </p>
          <p>
            En ningún caso la empresa responderá por estafas, robos, daños, pérdidas, incumplimientos o
            cualquier perjuicio económico o material. Los usuarios se comprometen a adoptar prácticas seguras,
            verificar la identidad de la contraparte y documentar la operación según corresponda.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Conducta esperada y contenidos prohibidos</h2>
          <p>
            Está prohibido utilizar la Plataforma para: (i) infringir leyes o derechos de terceros; (ii)
            publicar material falsificado, robado, de procedencia dudosa o que vulnere derechos de propiedad
            intelectual; (iii) difundir contenido ofensivo, discriminatorio o engañoso; (iv) recolectar datos
            personales sin consentimiento; (v) enviar spam o mensajes masivos no solicitados.
          </p>
          <p>
            La empresa podrá suspender o eliminar publicaciones y cuentas que infrinjan estos Términos o
            generen riesgos para la comunidad, sin que ello otorgue derecho a compensaciones.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Comunicaciones y chat interno</h2>
          <p>
            La Plataforma ofrece un sistema de mensajería para que las partes coordinen la compraventa. El
            usuario se compromete a utilizarlo exclusivamente para negociar la operación, absteniéndose de
            compartir datos sensibles o enlaces externos sospechosos. La empresa puede monitorear mensajes para
            responder a denuncias o detectar actividades prohibidas, respetando la normativa de privacidad.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Datos personales y privacidad</h2>
          <p>
            El tratamiento de los datos personales se rige por la Política de Privacidad disponible en la
            Plataforma. El usuario autoriza la utilización de la información proporcionada para la operación y
            el funcionamiento del marketplace. Podrá ejercer los derechos de acceso, rectificación, actualización
            y supresión conforme a la Ley 25.326 enviando un correo a privacidad@ciclomarket.ar.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">9. Herramientas de moderación</h2>
          <p>
            La empresa podrá requerir documentación adicional, suspender temporalmente funcionalidades, retirar
            publicaciones, marcar vendedores verificados o cancelar cuentas cuando detecte incumplimientos,
            sospechas de fraude o incumplimiento legal. Dichas medidas buscan proteger a la comunidad y no generan
            derecho a reclamos o indemnizaciones.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">10. Propiedad intelectual</h2>
          <p>
            Los derechos sobre la marca Ciclo Market, logos, diseño, software, bases de datos y demás elementos
            propios de la Plataforma pertenecen a la empresa o a sus licenciantes. Queda prohibido reproducir,
            distribuir o crear obras derivadas sin autorización expresa. El contenido generado por los usuarios
            seguirá siendo de su propiedad, pero autorizan a la empresa a exhibirlo dentro de la Plataforma.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">11. Limitación de responsabilidad</h2>
          <p>
            La Plataforma se ofrece &quot;tal como está&quot; y &quot;según disponibilidad&quot;. La empresa no garantiza que el
            servicio sea ininterrumpido o libre de errores, ni que los resultados satisfagan expectativas
            particulares. Dentro de los límites legales, no se responde por daños indirectos, lucro cesante,
            pérdida de chance, ni por cualquier perjuicio derivado del uso o imposibilidad de uso del sitio.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">12. Legislación y jurisdicción aplicable</h2>
          <p>
            Estos Términos se rigen por las leyes de la República Argentina. Para cualquier controversia que no
            pueda resolverse de forma directa entre las partes, se establece la jurisdicción de los tribunales
            ordinarios de la Ciudad Autónoma de Buenos Aires, renunciando a cualquier otro fuero o jurisdicción.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">13. Contacto</h2>
          <p>
            Ante dudas, reclamos o solicitudes legales, podés escribir a{' '}
            <a href="mailto:soporte@ciclomarket.ar" className="font-medium text-white hover:underline">
              soporte@ciclomarket.ar
            </a>{' '}
            o a{' '}
            <a href="mailto:privacidad@ciclomarket.ar" className="font-medium text-white hover:underline">
              privacidad@ciclomarket.ar
            </a>. También podés utilizar el formulario de contacto disponible en la Plataforma.
          </p>
        </section>
      </div>
    </Container>
  )
}
