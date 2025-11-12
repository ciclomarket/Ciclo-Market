import Marketplace from '../Marketplace'

export default function OfertasDestacadas() {
  return (
    <Marketplace
      forcedDeal
      headingTitle="Ofertas destacadas"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Ofertas destacadas' }]}
      seoOverrides={{
        title: 'Ofertas destacadas',
        description: 'Ofertas verificadas en bicicletas y accesorios con bajas de precio reales, estados detallados y opciones de envío asegurado para aprovechar oportunidades únicas.',
        keywords: ['ofertas bicicletas', 'rebajas bicicletas', 'descuentos bicicletas'],
        canonicalPath: '/ofertas-destacadas',
      }}
    />
  )
}
