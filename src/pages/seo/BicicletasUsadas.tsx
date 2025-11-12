import Marketplace from '../Marketplace'
import type { Cat } from '../Marketplace'

export default function BicicletasUsadas() {
  return (
    <Marketplace
      allowedCats={[
        'Ruta',
        'MTB',
        'Gravel',
        'Urbana',
        'Fixie',
        'E-Bike',
        'Niños',
        'Pista',
        'Triatlón',
      ] as Cat[]}
      headingTitle="Bicicletas usadas"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas usadas' }]}
      seoOverrides={{
        title: 'Bicicletas en venta',
        description: 'Bicicletas usadas verificadas listas para rodar con mantenimiento declarado, talles claros y contacto directo para coordinar pruebas, envíos y asesoramiento experto.',
        keywords: ['venta de bicicletas usadas', 'bicicletas usadas', 'clasificados de bicicletas'],
        canonicalPath: '/bicicletas-usadas',
      }}
    />
  )
}
