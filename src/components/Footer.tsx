
import { Link } from 'react-router-dom'
import Container from './Container'

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#14212e] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-[-30%] aspect-square w-[65%] rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.12),_transparent_60%)]" />

      <Container>
        <div className="relative py-12 space-y-12">
          <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <div className="max-w-sm">
              <p className="uppercase text-xs tracking-[0.3em] text-amber-400">Ciclo Market ADN</p>
              <h4 className="mt-3 text-xl font-semibold">Movemos la cultura ciclista todos los días.</h4>
              <p className="mt-3 text-sm text-white/75">
                Somos el punto de encuentro para quienes coleccionan kilómetros. Publicá tu bici, encontrá upgrades y
                unite a una comunidad que pedalea con propósito.
              </p>
              <Link
                to="/publicar"
                className="mt-6 inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:bg-white/90"
              >
                Publicar mi bici
              </Link>
              {/* Newsletter destacado vive antes del footer */}
            </div>

            <div className="text-sm text-white/75">
              <h5 className="text-base font-semibold text-white">Explorá</h5>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link to="/marketplace?cat=Ruta" className="transition hover:text-white">
                    Bicis de ruta
                  </Link>
                </li>
                <li>
                  <Link to="/marketplace?cat=MTB" className="transition hover:text-white">
                    Mountain bikes
                  </Link>
                </li>
                <li>
                  <Link to="/marketplace?deal=1" className="transition hover:text-white">
                    Ofertas destacadas
                  </Link>
                </li>
                <li>
                  <Link to="/tienda-oficial" className="transition hover:text-white">
                    Tienda oficial
                  </Link>
                </li>
              </ul>
            </div>

            <div className="text-sm text-white/75">
              <h5 className="text-base font-semibold text-white">Recursos</h5>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link to="/faq" className="transition hover:text-white">
                    Preguntas frecuentes
                  </Link>
                </li>
                <li>
                  <Link to="/como-publicar" className="transition hover:text-white">
                    Cómo publicar tu bici
                  </Link>
                </li>
                <li>
                  <Link to="/ayuda" className="transition hover:text-white">
                    Ayuda
                  </Link>
                </li>
                <li>
                  <Link to="/terminos" className="transition hover:text-white">
                    Términos y condiciones
                  </Link>
                </li>
                <li>
                  <Link to="/privacidad" className="transition hover:text-white">
                    Política de privacidad
                  </Link>
                </li>
              </ul>
            </div>

            <div className="text-sm text-white/75">
              <h5 className="text-base font-semibold text-white">Contacto</h5>
              <ul className="mt-3 space-y-3">
                <li>
                  <a href="mailto:admin@ciclomarket.ar" className="transition hover:text-white">
                    admin@ciclomarket.ar
                  </a>
                </li>
                <li className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-white/50">Soporte en horario hábil</span>
                  <span>Lunes a viernes 9 a 18h (GMT-3)</span>
                </li>
                <li className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-white/50">Seguinos</span>
                  <div className="flex gap-3">
                    <a
                      href="https://instagram.com/ciclomarket.ar"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Instagram Ciclo Market"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white transition hover:border-white/60"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="currentColor"
                      >
                        <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2a2.5 2.5 0 1 0 2.5 2.5A2.5 2.5 0 0 0 12 9.5Zm5.75-3.5a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z" />
                      </svg>
                    </a>
                    <a
                      href="https://www.strava.com/clubs/1770147"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Strava Ciclo Market"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white transition hover:border-white/60"
                    >
                      <img src="/strava.png" alt="" className="h-4 w-4" loading="lazy" decoding="async" aria-hidden />
                    </a>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 text-xs text-white/60 md:flex md:items-center md:justify-between">
            <p>© 2025 Ciclo Market. Todos los derechos reservados.</p>
            <p className="mt-3 md:mt-0 text-white/70">Hecho con cadencia ciclista en Latinoamérica.</p>
          </div>
        </div>
      </Container>
    </footer>
  )
}
