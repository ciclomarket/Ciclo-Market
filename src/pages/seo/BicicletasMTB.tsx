import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function BicicletasMTB() {
  return (
    <>
      <SEO
        title="Bicicletas de Mountain Bike (MTB) usadas"
        description="MTB XC, Trail y Enduro: rígidas y dobles, 12v. Encontrá la tuya por talle y presupuesto."
        keywords={['bicicletas de mtb','mtb usadas','mountain bike']}
      />
      <Marketplace forcedCat="MTB" headingTitle="Bicicletas de Mountain Bike (MTB)" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de Mountain Bike (MTB)' }]} />
    </>
  )
}
