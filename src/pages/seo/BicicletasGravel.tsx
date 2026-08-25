import SeoHybridLanding from './SeoHybridLanding'

export default function BicicletasGravel() {
  return (
    <SeoHybridLanding
      categoryFilter="Gravel"
      title="Bicicletas Gravel usadas en venta | Ciclo Market"
      description="Bicicletas gravel usadas para bikepacking y aventura. Cuadros de carbono, aluminio y acero. Specialized Diverge, Canyon Grail, Trek Checkpoint."
      keywords={[
        'bicicletas gravel usadas',
        'gravel bike segunda mano',
        'diverge usada',
        'bikepacking argentina'
      ]}
      h1="Bicicletas Gravel usadas"
      intro="Las gravel son las bicis más versátiles: rápidas en asfalto, capaces en caminos de tierra, perfectas para bikepacking. Encontrá tu compañera de aventura."
      ctas={[
        { label: 'Ver gravel en venta', href: '/marketplace?cat=Gravel' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas Gravel"
    />
  )
}
