import Container from '../components/Container'
import Button from '../components/Button'

export default function OfficialStore() {
  return (
    <div className="bg-[#0f1729] text-white min-h-[60vh] flex items-center">
      <Container>
        <div className="py-16 md:py-24 grid md:grid-cols-[3fr,2fr] items-center gap-12">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs uppercase tracking-[0.3em]">
              Tienda oficial
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
              Estamos en la fuga, pero todavía no alcanzamos la meta.
            </h1>
            <p className="text-white/80 text-lg max-w-2xl">
              Estamos afinando hasta el último detalle para lanzar nuestra tienda oficial. Pronto vas a poder comprar bicicletas certificadas con entrega inmediata, accesorios exclusivos y beneficios especiales.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button to="/register" className="bg-white text-mb-ink hover:opacity-90">
                Sumate a la lista de espera
              </Button>
              <Button to="/marketplace" variant="ghost" className="border-white/40 text-white hover:bg-white/10">
                Mientras tanto, explorá el marketplace
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="rounded-3xl border border-white/20 bg-white/5 backdrop-blur p-6 space-y-4 text-white/80">
              <h3 className="text-sm uppercase tracking-[0.3em] text-white/60">Lo que se viene</h3>
              <ul className="space-y-2 text-sm">
                <li>• Bicicletas inspeccionadas listas para entregar al instante.</li>
                <li>• Accesorios y upgrades curados por nuestros expertos.</li>
                <li>• Beneficios exclusivos para los primeros compradores.</li>
                <li>• Lanzamiento con eventos especiales y rides comunitarios.</li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
