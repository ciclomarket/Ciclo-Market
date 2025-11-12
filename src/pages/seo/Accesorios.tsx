import Marketplace from '../Marketplace'

export default function Accesorios() {
  return (
    <Marketplace
      forcedCat="Accesorios"
      headingTitle="Accesorios para tu bicicleta"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Accesorios para tu bicicleta' }]}
      seoOverrides={{
        title: 'Accesorios para tu bicicleta',
        description: 'Componentes, rodillos inteligentes, ciclocomputadoras y repuestos premium con compatibilidades detalladas para que equipes tu bici sin sorpresas ni gastos extra.',
        keywords: ['accesorios bicicleta', 'componentes bicicleta', 'ruedas bicicleta', 'ciclocomputadoras'],
        canonicalPath: '/accesorios',
      }}
    />
  )
}
