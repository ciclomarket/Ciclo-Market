import Container from '../../components/Container'
import SeoHead from '../../components/SeoHead'
import Button from '../../components/Button'
import Breadcrumbs from '../../components/Breadcrumbs'
import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'

export interface SeoLandingContent {
  title: string
  description: string
  keywords: string[]
  h1: string
  intro: string
  ctas: Array<{ label: string; href: string }>
  category: string
  subcategories?: string[]
  faqs?: Array<{ question: string; answer: string }>
  tips?: Array<{ title: string; description: string }>
  popularBrands?: string[]
  buyingGuide?: string
  /** Contenido SEO largo en texto corrido */
  longContent?: string
}

interface SeoLandingTemplateProps extends SeoLandingContent {
  mode?: 'full' | 'hero' | 'content'
  /** Contador de productos para mostrar en el hero */
  productCount?: number | null
}

export default function SeoLandingTemplate({
  title,
  description,
  keywords,
  h1,
  intro,
  ctas,
  category,
  subcategories = [],
  faqs = [],
  popularBrands = [],
  buyingGuide,
  longContent,
  mode = 'full',
  productCount,
}: SeoLandingTemplateProps) {
  const showHero = mode === 'full' || mode === 'hero'
  const showContent = mode === 'full' || mode === 'content'
  const showFaqs = showContent && faqs.length > 0

  return (
    <>
      {mode === 'full' && (
        <SeoHead 
          title={title} 
          description={description} 
          image="/OG-Marketplace.png" 
          keywords={keywords}
        />
      )}
      
      {/* Hero limpio y minimal */}
      {showHero && (
        <section className="bg-[#f5f5f3] border-b border-gray-200">
          <Container>
            <div className="py-8 md:py-12">
              <Breadcrumbs 
                items={[{ label: 'Inicio', to: '/' }, { label: h1 }]} 
                className="mb-4 text-sm text-gray-500"
              />
              
              <div className="max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight mb-3">
                  {h1}
                </h1>
                <p className="text-lg text-gray-600 leading-relaxed mb-6">
                  {intro}
                </p>
                
                {/* Trust badges en línea, sin cajas */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-6">
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-600" />
                    Publicaciones verificadas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-green-600" />
                    Contacto directo
                  </span>
                  {productCount !== null && productCount !== undefined && (
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-green-600" />
                      {productCount} {productCount === 1 ? 'bici disponible' : 'bicis disponibles'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  {ctas.map((cta) => (
                    <Button key={cta.href} to={cta.href}>
                      {cta.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* Contenido SEO - Texto corrido sin cajas */}
      {showContent && (buyingGuide || longContent) && (
        <section className="py-8 border-b border-gray-100">
          <Container>
            <div className="max-w-3xl prose prose-gray">
              {buyingGuide && (
                <p className="text-gray-600 leading-relaxed text-lg">
                  {buyingGuide}
                </p>
              )}
              {longContent && (
                <div className="mt-4 text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: longContent }} />
              )}
            </div>
          </Container>
        </section>
      )}

      {/* Marcas populares - Links inline, sin cajas */}
      {showContent && popularBrands.length > 0 && (
        <section className="py-6 border-b border-gray-100">
          <Container>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-gray-500">Marcas:</span>
              {popularBrands.map((brand, index) => (
                <span key={brand} className="flex items-center">
                  <Link
                    to={`/marketplace?brand=${encodeURIComponent(brand)}`}
                    className="text-gray-700 hover:text-blue-600 underline underline-offset-2"
                  >
                    {brand}
                  </Link>
                  {index < popularBrands.length - 1 && (
                    <span className="text-gray-300 mx-1">·</span>
                  )}
                </span>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Subcategorías - Links simples */}
      {showContent && subcategories.length > 0 && (
        <section className="py-6 border-b border-gray-100">
          <Container>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-gray-500">Tipos:</span>
              {subcategories.map((sub, index) => (
                <span key={sub} className="flex items-center">
                  <Link
                    to={`/marketplace?cat=${encodeURIComponent(sub)}`}
                    className="text-gray-700 hover:text-blue-600 underline underline-offset-2"
                  >
                    {sub}
                  </Link>
                  {index < subcategories.length - 1 && (
                    <span className="text-gray-300 mx-1">·</span>
                  )}
                </span>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* FAQs colapsables al final */}
      {showFaqs && (
        <section className="py-8">
          <Container>
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Preguntas frecuentes
            </h2>
            <div className="max-w-3xl space-y-2">
              {faqs.map((faq, index) => (
                <details
                  key={index}
                  className="group border-b border-gray-100 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between py-3 text-sm font-medium text-gray-700 hover:text-gray-900">
                    {faq.question}
                    <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="pb-3 text-sm text-gray-600 leading-relaxed">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  )
}
