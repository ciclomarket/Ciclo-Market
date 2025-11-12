import Marketplace from '../Marketplace'

export default function BicicletasTriatlon() {
  return (
    <Marketplace
      forcedCat="Triatlón"
      headingTitle="Bicicletas de triatlón"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de triatlón' }]}
      seoOverrides={{
        title: 'Bicicletas de triatlón (TT)',
        description: 'Bicicletas de triatlón y contrarreloj con datos de fitting, soporte para hidratación y grupos electrónicos, listas para competir y coordinar entrega segura.',
        keywords: ['bicicletas de triatlón', 'bicicletas tt', 'triathlon bikes', 'contrarreloj'],
        canonicalPath: '/bicicletas-triatlon',
      }}
    />
  )
}
