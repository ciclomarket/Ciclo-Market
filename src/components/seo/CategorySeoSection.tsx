import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { CategorySeoRichContent, SeoLink } from '../../constants/seoCategoryContent'
import SizeChartTable from './SizeChartTable'

interface CategorySeoSectionProps {
  content: CategorySeoRichContent
}

function LinkList({ items, separator }: { items: SeoLink[]; separator?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center">
          <Link
            to={item.href}
            className="text-gray-700 hover:text-blue-600 underline underline-offset-2"
          >
            {item.label}
          </Link>
          {separator && index < items.length - 1 && (
            <span className="text-gray-300 mx-1">{separator}</span>
          )}
        </span>
      ))}
    </div>
  )
}

export default function CategorySeoSection({ content }: CategorySeoSectionProps) {
  const hasSections = content.sections && content.sections.length > 0
  const hasFaqs = content.faqs && content.faqs.length > 0

  return (
    <section className="mt-14 pt-10 border-t border-gray-200" aria-label={content.title}>
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight mb-4">
          {content.title}
        </h2>

        {content.intro && (
          <p className="text-gray-600 leading-relaxed mb-8">{content.intro}</p>
        )}

        {hasSections &&
          content.sections!.map((section) => (
            <div key={section.heading} className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {section.heading}
              </h3>
              {section.paragraphs?.map((paragraph, index) => (
                <p
                  key={index}
                  className="text-gray-600 leading-relaxed mb-3 last:mb-0"
                >
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 space-y-1.5">
                  {section.list.map((item, index) => (
                    <li key={index} className="flex gap-2.5 text-gray-600 leading-relaxed">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

        {content.sizeChart && (
          <div className="mb-8">
            <SizeChartTable type={content.sizeChart} />
          </div>
        )}

        {content.subcategories && content.subcategories.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Tipos</h3>
            <LinkList items={content.subcategories} separator="·" />
          </div>
        )}

        {content.popularBrands && content.popularBrands.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Marcas populares</h3>
            <LinkList items={content.popularBrands} separator="·" />
          </div>
        )}

        {content.blogArticles && content.blogArticles.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Leé más</h3>
            <LinkList items={content.blogArticles} />
          </div>
        )}

        {hasFaqs && (
          <div className="mt-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Preguntas frecuentes</h3>
            <div className="space-y-1">
              {content.faqs!.map((faq, index) => (
                <details
                  key={index}
                  className="group border-b border-gray-100 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between py-3 text-sm font-medium text-gray-700 hover:text-gray-900">
                    {faq.question}
                    <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="pb-3 text-sm text-gray-600 leading-relaxed">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        )}

        {content.similarSearches && content.similarSearches.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Búsquedas similares
            </h3>
            <LinkList items={content.similarSearches} separator="·" />
          </div>
        )}
      </div>
    </section>
  )
}
