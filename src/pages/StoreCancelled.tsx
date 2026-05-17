// src/pages/StoreCancelled.tsx
import { Link } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import Container from '../components/Container'
import Button from '../components/Button'

export default function StoreCancelled() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f4f6f8] py-12">
      <Container>
        <div className="mx-auto max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <XCircle className="h-10 w-10 text-red-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Pago cancelado</h1>
          <p className="mt-2 text-gray-500">
            No se realizó ningún cobro. Podés intentarlo de nuevo cuando quieras.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button to="/tienda/nueva" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
              Intentar de nuevo
            </Button>
            <a
              href="https://wa.me/5493764748459?text=Hola%2C+tuve+un+problema+al+activar+mi+tienda+en+Ciclo+Market"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            >
              Contactar soporte
            </a>
          </div>
        </div>
      </Container>
    </div>
  )
}
