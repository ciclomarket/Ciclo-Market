import Marketplace from '../Marketplace'

export default function BicicletasMTB() {
  return (
    <Marketplace
      forcedCat="MTB"
      headingTitle="Bicicletas de Mountain Bike (MTB)"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de Mountain Bike (MTB)' }]}
      seoOverrides={{
        title: 'Bicicletas de Mountain Bike (MTB) usadas',
        description: 'MTB rígidas y dobles suspensión para XC, Trail y Enduro; revisá recorridos, grupos de 12 velocidades y upgrades antes de coordinar una prueba o envío en Ciclo Market.',
        keywords: ['bicicletas de mtb', 'mtb usadas', 'mountain bike'],
        canonicalPath: '/bicicletas-mtb',
      }}
    />
  )
}
