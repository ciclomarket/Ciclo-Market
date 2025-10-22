import Container from '../../components/Container'
import SEO from '../../components/SEO'
import Button from '../../components/Button'

export default function SeoLandingTemplate({
  title,
  description,
  keywords,
  h1,
  intro,
  ctas,
}: {
  title: string
  description: string
  keywords: string[]
  h1: string
  intro: string
  ctas: Array<{ label: string; href: string }>
}) {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
        <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
      </div>
      <SEO title={title} description={description} image="/OG-Marketplace.png" keywords={keywords} />
      <Container>
        <div className="mx-auto max-w-4xl py-12 space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{h1}</h1>
          <p className="text-white/80">{intro}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {ctas.map((c) => (
              <Button key={c.href} to={c.href} className="bg-white text-[#14212e] hover:bg-white/90">{c.label}</Button>
            ))}
            <Button to="/marketplace" variant="ghost" className="border-white/40 text-white hover:bg-white/10">Ver todo</Button>
          </div>
        </div>
      </Container>
    </section>
  )
}

