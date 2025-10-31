import Button from './Button'

type Props = {
  onClose?: () => void
}

export default function InAppBrowserWarning({ onClose }: Props) {
  const locationHref = typeof window !== 'undefined' ? window.location.href : ''
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(locationHref) } catch {}
    alert('Link copiado. Abrilo en Chrome o Safari para continuar con el login.')
  }
  const openExternal = () => {
    // En la mayoría de in-app browsers no abre Safari/Chrome directamente.
    // Igual intentamos _blank y dejamos instrucción.
    try { window.open(locationHref, '_blank') } catch {}
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-[#14212e] shadow-xl">
        <h3 className="text-lg font-semibold">Abrí este link en tu navegador</h3>
        <p className="mt-2 text-sm text-[#14212e]/80">
          Para continuar con Google/Facebook, abrí este enlace en <b>Chrome</b> o <b>Safari</b>. Los navegadores internos de apps (Instagram, Facebook, Messenger) no permiten iniciar sesión con Google por seguridad.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={copyLink} className="rounded-xl bg-[#14212e] text-white hover:bg-[#14212e]/90">Copiar link</Button>
          <Button onClick={openExternal} className="rounded-xl border border-[#14212e]/20 bg-white text-[#14212e] hover:bg-[#14212e]/5">Abrir en navegador</Button>
          {onClose && (
            <button type="button" onClick={onClose} className="ml-auto text-sm text-[#14212e]/70 hover:text-[#14212e]">Cerrar</button>
          )}
        </div>
        <div className="mt-3 text-xs text-[#14212e]/60">
          Tip: tocá el menú “•••” en la esquina y elegí “Abrir en navegador”.
        </div>
      </div>
    </div>
  )
}

