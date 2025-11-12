import Marketplace from '../Marketplace'

export default function Fixie() {
  return (
    <Marketplace
      forcedCat="Fixie"
      headingTitle="Fixie y single speed"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Fixie y single speed' }]}
      seoOverrides={{
        title: 'Fixie y single speed usadas',
        description: 'Fixies y single speed urbanas listas para rodar, con cuadros livianos, componentes personalizables y asesoramiento para elegir relación y frenos adecuados.',
        keywords: ['fixie', 'single speed', 'bicicletas urbanas'],
        canonicalPath: '/fixie',
      }}
    />
  )
}
