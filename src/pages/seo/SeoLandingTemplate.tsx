import Container from '../../components/Container'
import SeoHead from '../../components/SeoHead'
import Button from '../../components/Button'
import Breadcrumbs from '../../components/Breadcrumbs'
import { Link } from 'react-router-dom'
import { Bike, Shield, MessageCircle, MapPin, TrendingUp, Search, CheckCircle } from 'lucide-react'

export interface SeoLandingContent {
  title: string
  description: string
  keywords: string[]
  h1: string
  intro: string
  ctas: Array<{ label: string; href: string }>
  // Nuevos campos para contenido enriquecido
  category: string
  subcategories?: string[]
  faqs?: Array<{ question: string; answer: string }>
  tips?: Array<{ title: string; description: string; icon?: React.ReactNode }>
  popularBrands?: string[]
  priceRange?: { min: number; max: number; currency: string }
  features?: Array<{ title: string; description: string; icon: React.ReactNode }>
  relatedLinks?: Array<{ label: string; href: string; description?: string }>
  buyingGuide?: string
}

interface SeoLandingTemplateProps extends SeoLandingContent {}

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
  tips = [],
  popularBrands = [],
  priceRange,
  features = [],
  relatedLinks = [],
  buyingGuide,
}: SeoLandingTemplateProps) {
  const breadcrumbItems = [
    { label: 'Inicio', to: '/' },
    { label: h1 },
  ]

  // Generar Schema.org FAQPage si hay FAQs
  const faqSchema = faqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  } : null

  return (
    <>
      <SeoHead 
        title={title} 
        description={description} 
        image="/OG-Marketplace.png" 
        keywords={keywords}
        jsonLd={faqSchema}
      />
      
      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] text-white">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        
        <Container>
          <Breadcrumbs items={breadcrumbItems} className="!text-white/70 pt-4" />
          
          <div className="mx-auto max-w-4xl py-12 space-y-4">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              {h1}
            </h1>
            <p className="text-lg text-white/80 max-w-2xl">{intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {ctas.map((c) => (
                <Button key={c.href} to={c.href} className="bg-white text-[#14212e] hover:bg-white/90">
                  {c.label}
                </Button>
              ))}
              <Button to="/marketplace" variant="ghost" className="border-white/40 text-white hover:bg-white/10">
                Ver todo
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* Features Grid */}
      {features.length > 0 && (
        <section className="py-12 bg-gray-50">
          <Container>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Buying Guide */}
      {buyingGuide && (
        <section className="py-12">
          <Container>
            <div className="max-w-3xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Guía de compra: {category}
              </h2>
              <div className="prose prose-blue max-w-none text-gray-600">
                <p>{buyingGuide}</p>
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* Tips Section */}
      {tips.length > 0 && (
        <section className="py-12 bg-white">
          <Container>
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              Consejos para comprar {category.toLowerCase()}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tips.map((tip, index) => (
                <div
                  key={index}
                  className="flex gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                    {tip.icon || <CheckCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">{tip.title}</h3>
                    <p className="text-sm text-gray-600">{tip.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Popular Brands */}
      {popularBrands.length > 0 && (
        <section className="py-12 bg-gray-50">
          <Container>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Marcas populares
            </h2>
            <div className="flex flex-wrap gap-3">
              {popularBrands.map((brand) => (
                <Link
                  key={brand}
                  to={`/marketplace?brand=${encodeURIComponent(brand)}`}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
                >
                  {brand}
                </Link>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Subcategories */}
      {subcategories.length > 0 && (
        <section className="py-12">
          <Container>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Subcategorías
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {subcategories.map((sub) => (
                <Link
                  key={sub}
                  to={`/marketplace?cat=${encodeURIComponent(sub)}`}
                  className="p-4 rounded-xl bg-white border border-gray-200 text-center hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <span className="font-medium text-gray-700">{sub}</span>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Related Links */}
      {relatedLinks.length > 0 && (
        <section className="py-12 bg-gray-50">
          <Container>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              También te puede interesar
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedLinks.map((link, index) => (
                <Link
                  key={index}
                  to={link.href}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{link.label}</h3>
                    {link.description && (
                      <p className="text-sm text-gray-600 mt-1">{link.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* FAQs */}
      {faqs.length > 0 && (
        <section className="py-12">
          <Container>
            <h2 className="text-2xl font-bold text-gray-900 mb-8">
              Preguntas frecuentes
            </h2>
            <div className="max-w-3xl space-y-4">
              {faqs.map((faq, index) => (
                <details
                  key={index}
                  className="group rounded-xl bg-white border border-gray-200 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 p-4">
                    <h3 className="font-medium text-gray-900">{faq.question}</h3>
                    <span className="relative size-5 shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="absolute inset-0 size-5 opacity-100 group-open:opacity-0 transition-opacity"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="absolute inset-0 size-5 opacity-0 group-open:opacity-100 transition-opacity"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </span>
                  </summary>
                  <div className="px-4 pb-4 text-gray-600">
                    <p>{faq.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* CTA Final */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold mb-4">
              ¿Listo para encontrar tu próxima bici?
            </h2>
            <p className="text-lg text-blue-100 mb-8">
              Explorá cientos de {category.toLowerCase()} verificadas y contactá directamente con los vendedores.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button to="/marketplace" className="bg-white text-blue-600 hover:bg-blue-50">
                Ver todas las publicaciones
              </Button>
              <Button to="/publicar" variant="ghost" className="border-white/40 text-white hover:bg-white/10">
                Publicar la mía
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
