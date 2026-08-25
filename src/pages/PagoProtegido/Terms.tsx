export default function PagoProtegidoTerms() {
  return (
    <main className="bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2 text-mb-ink">Pago Protegido — Términos y Condiciones</h1>
        <p className="text-sm text-gray-500 mb-8">Versión preliminar. Se actualizará antes del lanzamiento público.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Qué es Pago Protegido</h2>
            <p>
              Pago Protegido es un servicio opcional de intermediación de pagos ofrecido por Ciclo Market. El comprador
              paga el precio publicado más una comisión de intermediación; el dinero queda retenido por Mercado Pago
              (nunca por Ciclo Market) hasta que el comprador confirma la recepción de la bicicleta en condiciones
              aceptables, o vence el plazo de reclamo sin objeciones.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">2. Rol de Ciclo Market</h2>
            <p>
              Ciclo Market actúa como intermediario tecnológico entre comprador y vendedor. No es parte de la
              compraventa, no garantiza la condición mecánica de la bicicleta más allá de lo declarado en el checklist
              de publicación, y no custodia los fondos en ningún momento: la retención y liberación del pago la
              ejecuta Mercado Pago mediante su producto de Split de Pagos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Comisión</h2>
            <p>
              La comisión de Pago Protegido está a cargo del comprador y se calcula sobre el precio de la
              publicación. Se descuenta automáticamente en la misma transacción y se acredita directo a Ciclo Market.
              El vendedor no paga nada adicional a su plan de publicación vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Plazos de liberación</h2>
            <p>
              Desde la confirmación de entrega, el comprador tiene entre 48 y 72 horas para confirmar la recepción
              conforme o abrir un reclamo con evidencia. Si no hay acción dentro de ese plazo, el pago se libera
              automáticamente al vendedor. Estos plazos son una política operativa del servicio, no reemplazan ni
              acortan el derecho legal de arrepentimiento de 10 días corridos previsto en el artículo 34 de la Ley
              24.240, que sigue vigente como relación directa entre comprador y vendedor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Causales de disputa válidos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>La bicicleta no coincide sustancialmente con la publicación (modelo, año o componentes distintos).</li>
              <li>Daño estructural o de seguridad no declarado (cuadro rajado, frenos inoperativos, etc.).</li>
              <li>No llegó, o llegó incompleta respecto de lo publicado.</li>
              <li>Evidencia de que la bicicleta enviada no es la de las fotos del listing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Causales excluidos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Rayones, desgaste o detalles estéticos ya visibles en las fotos del checklist al momento de publicar.</li>
              <li>Arrepentimiento sin sustento objetivo.</li>
              <li>Diferencias de gusto, color o talle ya especificadas correctamente en la publicación.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Cláusula anti-elusión</h2>
            <p>
              Si una venta se concreta con un contacto generado a través de Ciclo Market dentro de los 30 días
              siguientes, la comisión de Pago Protegido aplica igual aunque las partes acuerden pagar por fuera de la
              plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Requisitos para vendedores y compradores</h2>
            <p>
              Para usar Pago Protegido, tanto el comprador como el vendedor deben tener su identidad verificada en
              Ciclo Market. El vendedor debe además conectar su cuenta de Mercado Pago y completar el checklist de
              condición de la publicación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">9. Tus derechos como consumidor</h2>
            <p>
              Pago Protegido es un beneficio comercial adicional y no reemplaza ni limita los derechos que te
              corresponden bajo la Ley de Defensa del Consumidor. Si no estás conforme con la resolución interna de
              una disputa, podés recurrir a Defensa del Consumidor o COPREC.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
