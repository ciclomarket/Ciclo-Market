import type { SizeChartType } from '../../constants/seoCategoryContent'

interface ChartData {
  title: string
  columns: [string, string, string]
  rows: Array<[string, string, string]>
  note: string
}

const CHARTS: Record<SizeChartType, ChartData> = {
  road: {
    title: 'Tabla de talles de bicicletas de ruta',
    columns: ['Altura del ciclista', 'Talle de cuadro', 'Talle (cm)'],
    rows: [
      ['148 – 158 cm', 'XS', '43 – 47 cm'],
      ['159 – 168 cm', 'S', '48 – 51 cm'],
      ['169 – 178 cm', 'M', '52 – 55 cm'],
      ['179 – 185 cm', 'L', '56 – 58 cm'],
      ['186 – 193 cm', 'XL', '59 – 62 cm'],
      ['195 cm o más', 'XXL', '63 cm o más'],
    ],
    note: 'El talle varía según la marca y el modelo; usalo como punto de partida y verificá el reach y el stack.',
  },
  mtb: {
    title: 'Tabla de talles de bicicletas de montaña',
    columns: ['Altura del ciclista', 'Talle', 'Talle (pulgadas)'],
    rows: [
      ['148 – 158 cm', 'XS', '13" – 14"'],
      ['159 – 168 cm', 'S', '15" – 16"'],
      ['169 – 178 cm', 'M', '17" – 18"'],
      ['179 – 185 cm', 'L', '19" – 20"'],
      ['186 – 193 cm', 'XL', '21" – 22"'],
      ['194 cm o más', 'XXL', '23" o más'],
    ],
    note: 'El talle varía por marca; el reach y el stack importan más que la etiqueta.',
  },
  gravel: {
    title: 'Tabla de talles de bicicletas de gravel',
    columns: ['Altura del ciclista', 'Talle de cuadro', 'Talle (cm)'],
    rows: [
      ['148 – 158 cm', 'XS', '43 – 47 cm'],
      ['159 – 168 cm', 'S', '48 – 51 cm'],
      ['169 – 178 cm', 'M', '52 – 55 cm'],
      ['179 – 185 cm', 'L', '56 – 58 cm'],
      ['186 – 193 cm', 'XL', '59 – 62 cm'],
      ['195 cm o más', 'XXL', '63 cm o más'],
    ],
    note: 'Referencia para gravel y ciclocross. Verificá el talle por marca: las geometrías varían bastante entre modelos.',
  },
  tri: {
    title: 'Tabla de talles de bicicletas de triatlón y contrarreloj',
    columns: ['Altura del ciclista', 'Talle', 'Talle (cm)'],
    rows: [
      ['148 – 160 cm', 'XS', '47 – 50 cm'],
      ['160 – 168 cm', 'S', '51 – 53 cm'],
      ['168 – 175 cm', 'M', '54 – 55 cm'],
      ['175 – 183 cm', 'L', '56 – 58 cm'],
      ['183 – 191 cm', 'XL', '58 – 60 cm'],
      ['191 – 198 cm', 'XXL', '61 – 63 cm'],
    ],
    note: 'Elegir el talle correcto importa: el fit es la diferencia entre "rápido" y "rápido para un Ironman". Ajustá stack, reach y la posición aero.',
  },
  urban: {
    title: 'Tabla de talles de bicicletas urbanas',
    columns: ['Altura del ciclista', 'Talle', 'Talle (cm)'],
    rows: [
      ['145 – 155 cm', 'XS', '44 – 48 cm'],
      ['155 – 165 cm', 'S', '49 – 52 cm'],
      ['165 – 175 cm', 'M', '53 – 56 cm'],
      ['175 – 185 cm', 'L', '57 – 60 cm'],
      ['185 – 195 cm', 'XL', '61 – 63 cm'],
    ],
    note: 'Referencia general para urbanas, playeras y plegables. En ciudad la posición erguida manda: elegí la que te permita apoyar los pies con el asiento bajo.',
  },
  kids: {
    title: 'Rodado ideal según la altura',
    columns: ['Edad aproximada', 'Altura', 'Rodado'],
    rows: [
      ['2 – 4 años', '90 – 105 cm', '12"'],
      ['4 – 6 años', '105 – 120 cm', '16"'],
      ['6 – 8 años', '120 – 135 cm', '20"'],
      ['8 – 11 años', '135 – 150 cm', '24"'],
      ['11 años o más', '150 cm o más', '26"'],
    ],
    note: 'El rodado correcto permite que el niño apoye los pies en el piso con el asiento bajo. Preferí un talle que pueda usar hoy, no "para que crezca".',
  },
}

interface SizeChartTableProps {
  type: SizeChartType
}

export default function SizeChartTable({ type }: SizeChartTableProps) {
  const chart = CHARTS[type]

  return (
    <div className="mt-2">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{chart.title}</h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              {chart.columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-2.5 font-medium text-gray-700 border-b border-gray-200 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row, index) => (
              <tr
                key={index}
                className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-4 py-2.5 border-b border-gray-100 whitespace-nowrap ${
                      cellIndex === 1 ? 'font-medium text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-xs text-gray-500 leading-relaxed">{chart.note}</p>
    </div>
  )
}
