import Marketplace from '../Marketplace'

export default function BicicletasGravel() {
  return (
    <Marketplace
      forcedCat="Gravel"
      headingTitle="Bicicletas de gravel"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de gravel' }]}
      seoOverrides={{
        title: 'Bicicletas de gravel usadas',
        description: 'Descubrí bicicletas de gravel para aventura y ciudad, con espacio para bikepacking, transmisiones modernas y talles revisados. Coordiná prueba y entrega segura.',
        keywords: ['bicicletas de gravel', 'gravel bike', 'gravel usadas'],
        canonicalPath: '/bicicletas-gravel',
      }}
    />
  )
}
