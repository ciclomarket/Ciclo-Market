import Marketplace from '../Marketplace'

export default function ClasificadosBicicletas() {
  return (
    <Marketplace
      headingTitle="Clasificados de bicicletas"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Clasificados de bicicletas' }]}
      seoOverrides={{
        title: 'Clasificados de bicicletas',
        description: 'Explorá clasificados ciclistas en Argentina con publicaciones verificadas, precios en tiempo real y contacto directo con vendedores para coordinar prueba y envío.',
        keywords: ['clasificados de bicicletas', 'venta de bicicletas usadas', 'bicicletas usadas'],
        canonicalPath: '/clasificados-bicicletas',
      }}
    />
  )
}
