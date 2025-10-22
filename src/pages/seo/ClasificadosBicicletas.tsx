import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function ClasificadosBicicletas() {
  return (
    <>
      <SEO
        title="Clasificados de bicicletas"
        description="Clasificados ciclistas en Argentina: bicicletas usadas y nuevas con contacto directo."
        keywords={['clasificados de bicicletas','venta de bicicletas usadas','bicicletas usadas']}
      />
      <Marketplace />
    </>
  )
}
