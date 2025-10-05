
import Container from '../components/Container'
export default function Profile(){
  return (
    <Container>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="card p-6">
          <div className="size-20 rounded-full bg-white/10" />
          <h2 className="text-xl font-semibold mt-3">Vendedor</h2>
          <p className="text-white/60 text-sm">Ubicación, bio, links…</p>
        </div>
        <div className="md:col-span-2 card p-6">
          <h3 className="font-semibold mb-2">Publicaciones</h3>
          <p className="text-white/60 text-sm">Próximamente…</p>
        </div>
      </div>
    </Container>
  )
}
