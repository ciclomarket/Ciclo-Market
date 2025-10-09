import Container from '../components/Container'

export default function HowToPublish() {
  return (
    <div className="bg-[#14212e] py-12 text-white">
      <Container className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-4 text-center">
          <h1 className="text-3xl font-bold text-white">Cómo publicar tu bicicleta</h1>
          <p className="text-base text-white/80">
            Seguí este recorrido para crear tu aviso, conocer los planes disponibles y gestionar todo desde el dashboard.
          </p>
        </header>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">1. Iniciá sesión</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              Ingresá en la esquina superior derecha y elegí <b>Ingresar</b>. Podés usar tu email y contraseña o acceder con Google.
            </li>
            <li>
              ¿Es tu primera vez? Seleccioná <b>Crear cuenta</b> para registrarte en pocos pasos.
            </li>
            <li>
              Una vez autenticado, vas a ser dirigido al <b>dashboard</b>, donde centralizás tus publicaciones.
            </li>
          </ul>
        </section>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">2. Elegí el plan adecuado</h2>
          <p className="text-sm text-white/80">
            Desde la opción <b>Publicar</b> del menú, vas a poder ver los planes disponibles:
          </p>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              <b>Plan Gratis</b>: ideal para tu primer aviso. Incluye las secciones básicas y un número limitado de fotos.
            </li>
            <li>
              <b>Planes Destacados</b>: ofrecen más fotos, prioridad en el marketplace y extras como botón de WhatsApp o difusión en redes.
            </li>
            <li>
              Podés cambiar de plan en cualquier momento desde el dashboard si necesitás más visibilidad.
            </li>
          </ul>
        </section>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">3. Completá el formulario</h2>
          <p className="text-sm text-white/80">
            El formulario de publicación está dividido en bloques para guiarte paso a paso:
          </p>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              <b>Categoría y datos principales</b>: marca, modelo, material, transmisión y talle. Elegí cada opción para ver cómo se arma la ficha técnica.
            </li>
            <li>
              <b>Ubicación y precio</b>: definí la moneda, el valor y la ubicación exacta en la que está la bicicleta. Si tu plan lo permite, agregá tu WhatsApp.
            </li>
            <li>
              <b>Descripción y extras</b>: contá el estado general, upgrades, mantenimiento y accesorios incluidos.
            </li>
            <li>
              <b>Fotos</b>: subí imágenes claras y bien iluminadas. A medida que cumplís los requisitos mínimos, se habilita la subida de fotos.
            </li>
            <li>
              Mientras completás cada campo, la vista previa te muestra cómo se verá la ficha técnica final para que puedas ajustar detalles al instante.
            </li>
          </ul>
        </section>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">4. Revisá y publicá</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              Antes de confirmar, verificá que las fotos se vean bien y que el precio esté correcto.
            </li>
            <li>
              Guardá el borrador si querés completarlo más tarde o publicá directamente para que aparezca en el marketplace.
            </li>
          </ul>
        </section>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">5. Gestioná todo desde el dashboard</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              <b>Perfil</b>: completá tus datos, provincia, ciudad y redes sociales para generar confianza.
            </li>
            <li>
              <b>Publicaciones</b>: editá precios, archivá avisos, destacá bicicletas y controlá el rendimiento de tus anuncios.
            </li>
            <li>
              <b>Notificaciones y Chat</b>: respondé mensajes, ofertas y recordatorios sin salir de la plataforma.
            </li>
            <li>
              <b>Editar perfil</b>: actualizá tu avatar y preferencias para tener una ficha de vendedor completa.
            </li>
            <li>
              <b>Suscripción</b>: revisá el estado de tu plan, renovaciones automáticas y próximos vencimientos.
            </li>
          </ul>
        </section>

        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Consejos finales</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>Usá fotos horizontales y con buena luz. Mostrá detalles importantes como transmisión o ruedas.</li>
            <li>Mantené tu descripción actualizada con el estado real y las modificaciones más recientes.</li>
            <li>Respondé rápido los mensajes: mejorarás tu reputación y chances de venta.</li>
          </ul>
        </section>
      </Container>
    </div>
  )
}
