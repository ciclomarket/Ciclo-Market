import SeoHybridLanding from './SeoHybridLanding'

export default function BicicletasMTB() {
  return (
    <SeoHybridLanding
      categoryFilter="MTB"
      title="Bicicletas MTB usadas en venta | Ciclo Market"
      description="Mountain bikes usadas para XC, Trail y Enduro. Rígidas y doble suspensión. Specialized, Trek, Santa Cruz, Scott y más."
      keywords={[
        'bicicletas mtb usadas',
        'mountain bike usada',
        'bicicleta mtb segunda mano',
        'doble suspension usada'
      ]}
      h1="Bicicletas MTB usadas"
      intro="Mountain bikes para todo tipo de terreno: XC para competir, trail para diversión, enduro para descensos técnicos. Rígidas y dobles con los mejores grupos y suspensiones."
      ctas={[
        { label: 'Ver MTB en venta', href: '/marketplace?cat=MTB' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas MTB"
    />
  )
}
