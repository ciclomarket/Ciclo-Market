import Container from '../components/Container'

export default function DataDeletion() {
  return (
    <div className="bg-[#f6f8fb] py-10">
      <Container className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-bold text-[#14212e]">Cómo eliminar tus datos</h1>
          <p className="text-sm text-[#14212e]/70">
            En Ciclo Market podés solicitar la eliminación de tu cuenta y de los datos personales asociados.
          </p>
          <p className="text-xs text-[#14212e]/50">Última actualización: abril 2025</p>
        </header>

        <section className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-[#14212e]">Opción 1: desde tu cuenta</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#14212e]/75">
            <li>Ingresá a tu cuenta y abrí el <strong>Panel del vendedor</strong>.</li>
            <li>Eliminá tus publicaciones y datos opcionales de perfil (foto, redes, WhatsApp) si lo deseás.</li>
            <li>Contactanos a <a className="underline" href="mailto:privacy@ciclomarket.ar">privacy@ciclomarket.ar</a> para completar la eliminación de tu cuenta.
            </li>
          </ol>
          <p className="mt-3 text-xs text-[#14212e]/60">Nota: por normativa antifraude y contable, cierta información mínima puede conservarse por un período limitado.</p>
        </section>

        <section className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-[#14212e]">Opción 2: por correo electrónico</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#14212e]/75">
            Si no podés acceder a tu cuenta, escribinos a <a className="underline" href="mailto:privacy@ciclomarket.ar">privacy@ciclomarket.ar</a> con el asunto “Eliminar datos”. Incluí:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#14212e]/75">
            <li>Tu correo registrado en Ciclo Market.</li>
            <li>Un comprobante de identidad simple (por ejemplo, responder desde el mismo correo).</li>
            <li>Si tu solicitud proviene de Facebook, tu <strong>Facebook User ID</strong> (opcional) para acelerar la verificación.</li>
          </ul>
          <p className="mt-3 text-sm text-[#14212e]/70">Procesamos la eliminación dentro de los 5 a 10 días hábiles, y te confirmamos por correo.</p>
        </section>

        <section className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-[#14212e]">Alcance de la eliminación</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#14212e]/75">
            <li>Cuenta y perfil (nombre, foto, redes, WhatsApp) asociados a tu usuario.</li>
            <li>Publicaciones activas o archivadas y contenido asociado (títulos, descripciones, imágenes).</li>
            <li>Registros de actividad visibles por otros usuarios (por ejemplo, preguntas) serán anonimizados cuando corresponda.</li>
          </ul>
          <p className="mt-3 text-xs text-[#14212e]/60">Podemos retener datos estrictamente necesarios para cumplir obligaciones legales, prevenir fraude o resolver disputas, según nuestra <a className="underline" href="/privacidad">Política de privacidad</a>.</p>
        </section>

        <section className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-[#14212e]">Solicitudes desde Facebook (Meta)</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#14212e]/75">
            Si llegaste a esta página por un requerimiento de Facebook, podés iniciar tu solicitud escribiendo a <a className="underline" href="mailto:privacy@ciclomarket.ar">privacy@ciclomarket.ar</a>. Incluí tu correo de registro y, si es posible, tu Facebook User ID.
          </p>
        </section>
      </Container>
    </div>
  )
}

