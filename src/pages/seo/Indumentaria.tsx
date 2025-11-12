import Marketplace from '../Marketplace'

export default function Indumentaria() {
  return (
    <Marketplace
      forcedCat="Indumentaria"
      headingTitle="Indumentaria de ciclismo"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Indumentaria de ciclismo' }]}
      seoOverrides={{
        title: 'Indumentaria de ciclismo',
        description: 'Indumentaria ciclista con talles exactos, tecnologías de ventilación y accesorios completos; encontrá jerseys, cascos y calzado listos para tu próxima salida.',
        keywords: ['indumentaria ciclismo', 'maillot', 'culotte', 'cascos ciclismo', 'zapatillas ciclismo'],
        canonicalPath: '/indumentaria',
      }}
    />
  )
}
