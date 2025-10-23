import Container from '../components/Container'

export default function HowToPublish() {
  return (
    <div className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] py-12 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
        <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
      </div>
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
          <p className="text-sm text-white/80">Desde <b>Publicar</b> vas a ver los planes vigentes:</p>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              <b>Gratis</b>: para publicar rápido. Avisos vencen a los <b>15 días</b>. Fotos básicas, sin botón de WhatsApp.
            </li>
            <li>
              <b>Básico</b> y <b>Premium</b>: más fotos, prioridad, <b>WhatsApp habilitado</b> y opciones de <b>destaque</b>/difusión en redes.
            </li>
            <li>
              <b>Pro (Tiendas verificadas)</b>: avisos sin vencimiento mientras la tienda esté activa y mayor exposición.
            </li>
            <li>
              Podés cambiar de plan o destacar publicaciones desde el dashboard cuando necesites más visibilidad.
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
              <b>Ubicación y precio</b>: definí la moneda, el valor y la ubicación. Si tu plan lo permite, agregá tu WhatsApp para contacto directo.
            </li>
            <li>
              <b>Descripción y extras</b>: contá el estado general, upgrades, mantenimiento y accesorios incluidos.
            </li>
            <li>
              <b>Fotos</b>: subí imágenes claras y bien iluminadas. A medida que cumplís los requisitos mínimos, se habilita la subida de fotos.
            </li>
            <li>
              <b>Moderación</b>: por seguridad no se permiten teléfonos/links de WhatsApp en descripción o preguntas. Usá el botón de contacto.
            </li>
            <li>
              Mientras completás cada campo, la vista previa te muestra cómo se verá la ficha técnica final para que puedas ajustar detalles al instante.
            </li>
          </ul>
        </section>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">4. Comprá créditos y publicá</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              Podés <b>comprar créditos de publicación</b> para activar planes pagos o destacar tu aviso. El pago se procesa con nuestro proveedor y se asigna a tu cuenta.
            </li>
            <li>
              Verificá fotos y precio y publicá. Si preferís, guardá como borrador para completar más tarde.
            </li>
            <li>Los créditos pueden tener vencimiento; usalos cuando mejor te convenga.</li>
          </ul>
        </section>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">5. Gestioná todo desde el dashboard</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>
              <b>Perfil</b>: completá tus datos, provincia, ciudad y redes sociales para generar confianza.
            </li>
            <li>
              <b>Publicaciones</b>: editá precios, pausá/reactivá avisos, destacá bicicletas y controlá su rendimiento.
            </li>
            <li>
              <b>Preguntas</b>: respondé consultas desde el aviso; evitá compartir teléfonos fuera del botón de WhatsApp.
            </li>
            <li>
              <b>Reseñas</b>: recibí y respondé reseñas de compradores para construir tu reputación.
            </li>
            <li>
              <b>Métricas</b>: consultá vistas y clics en WhatsApp para optimizar tu aviso. Tiendas oficiales ven métricas agregadas por tienda.
            </li>
          </ul>
        </section>

        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-soft backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Consejos finales</h2>
          <ul className="space-y-3 text-sm text-white/80">
            <li>Usá fotos horizontales y con buena luz. Mostrá detalles importantes como transmisión o ruedas.</li>
            <li>Mantené tu descripción actualizada con el estado real y las modificaciones más recientes.</li>
            <li>Respondé rápido las consultas y ofertas: mejorarás tu reputación y chances de venta.</li>
          </ul>
        </section>
      </Container>
    </div>
  )
}
