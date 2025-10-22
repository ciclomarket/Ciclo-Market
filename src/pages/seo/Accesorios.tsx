import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function Accesorios() {
  return (
    <>
      <SEO
        title="Accesorios para tu bicicleta"
        description="Componentes, ruedas, electrónicos y más. Encontrá accesorios para ruta, MTB y gravel."
        keywords={['accesorios bicicleta','componentes bicicleta','ruedas bicicleta','ciclocomputadoras']}
      />
      <Marketplace forcedCat="Accesorios" headingTitle="Accesorios para tu bicicleta" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Accesorios para tu bicicleta' }]} />
    </>
  )
}
