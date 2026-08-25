/**
 * Contenido SEO por categoría (estilo The Pro's Closet).
 *
 * Cada categoría del marketplace tiene un bloque rico debajo del catálogo:
 * intro, guía de compra, tabla de talles, subcategorías, marcas, artículos del
 * blog, preguntas frecuentes y búsquedas similares. Texto en español (rioplatense).
 */

export type SizeChartType = 'road' | 'mtb' | 'gravel' | 'tri' | 'urban' | 'kids'

export interface SeoLink {
  label: string
  href: string
}

export interface SeoSection {
  heading: string
  paragraphs?: string[]
  list?: string[]
}

export interface CategorySeoRichContent {
  /** Título de la sección (H2) */
  title: string
  /** Párrafo de apertura */
  intro: string
  /** Secciones de guía informativa */
  sections?: SeoSection[]
  /** Tabla de talles */
  sizeChart?: SizeChartType
  /** Links a subcategorías / tipos */
  subcategories?: SeoLink[]
  /** Marcas populares */
  popularBrands?: SeoLink[]
  /** Artículos y guías del blog */
  blogArticles?: SeoLink[]
  /** Preguntas frecuentes */
  faqs?: Array<{ question: string; answer: string }>
  /** Búsquedas similares */
  similarSearches?: SeoLink[]
}

const blog = { label: 'Guías y artículos del blog', href: '/blog' }

export const CATEGORY_SEO_RICH_CONTENT: Record<string, CategorySeoRichContent> = {
  Todos: {
    title: 'Sobre el marketplace de bicicletas',
    intro:
      'El marketplace de Ciclo Market se actualiza todos los días con bicicletas nuevas, usadas y reacondicionadas de todas las disciplinas: ruta, MTB, gravel, triatlón, urbanas, fixies, eléctricas y más. Acá vas a encontrar las herramientas para comprar y vender con confianza, con contacto directo entre partes y sin comisiones ocultas.',
    sections: [
      {
        heading: '¿Cómo comprar una bici usada?',
        paragraphs: [
          'Cada publicación muestra fotos reales, estado declarado, talle, rodado y datos del vendedor. Para no llevarte sorpresas, usá los filtros por categoría, marca, rango de precio, talle o ubicación y guardá tus búsquedas para recibir avisos cuando ingrese una bici similar.',
        ],
        list: [
          'Revisá el estado del cuadro (golpes, óxido, fisuras) y los componentes (grupo, frenos, transmisión).',
          'Pedí fotos detalladas y, si podés, coordiná una prueba en un lugar seguro.',
          'Compará precios con otros anuncios activos y con el valor de lista del modelo.',
          'Preferí vendedores con señales de confianza: tiendas oficiales, planes vigentes y métricas de interacción.',
        ],
      },
      {
        heading: '¿Cómo publicar tu bici?',
        paragraphs: [
          'Publicar es simple: en minutos cargás tu bici, sumás fotos, aclarás estado y upgrades, y elegís un plan que te ayude a vender más rápido. Marcá el precio anterior si aplicaste una rebaja y contá la historia de mantenimiento para generar confianza.',
        ],
      },
      {
        heading: 'Tiendas oficiales y vendedores verificados',
        paragraphs: [
          'Activá el filtro de tiendas oficiales para ver catálogos completos de bicicleterías con servicio y garantía. Los ciclistas privados, en cambio, suelen ofrecer mejores precios y negociación directa. Ambos perfiles conviven en el mismo marketplace.',
        ],
      },
    ],
    subcategories: [
      { label: 'Ruta', href: '/marketplace?cat=Ruta' },
      { label: 'MTB', href: '/marketplace?cat=MTB' },
      { label: 'Gravel', href: '/marketplace?cat=Gravel' },
      { label: 'Triatlón', href: '/marketplace?cat=Triatl%C3%B3n' },
      { label: 'Urbana', href: '/marketplace?cat=Urbana' },
      { label: 'Fixie', href: '/marketplace?cat=Fixie' },
      { label: 'E-Bike', href: '/marketplace?cat=E-Bike' },
      { label: 'Niños', href: '/marketplace?cat=Ni%C3%B1os' },
      { label: 'Pista', href: '/marketplace?cat=Pista' },
    ],
    popularBrands: [
      { label: 'Trek', href: '/marketplace?brand=Trek' },
      { label: 'Specialized', href: '/marketplace?brand=Specialized' },
      { label: 'Cannondale', href: '/marketplace?brand=Cannondale' },
      { label: 'Giant', href: '/marketplace?brand=Giant' },
      { label: 'Bianchi', href: '/marketplace?brand=Bianchi' },
      { label: 'Cervélo', href: '/marketplace?brand=Cerv%C3%A9lo' },
      { label: 'Scott', href: '/marketplace?brand=Scott' },
      { label: 'Canyon', href: '/marketplace?brand=Canyon' },
    ],
    faqs: [
      {
        question: '¿Es seguro comprar una bici usada por internet?',
        answer:
          'Sí, si seguís algunas reglas: pedí fotos reales, hablá con el vendedor, coordiná una prueba cuando sea posible y usá medios de contacto dentro de la plataforma. Las tiendas oficiales suman garantía y servicio.',
      },
      {
        question: '¿Cómo sé que el precio es justo?',
        answer:
          'Compará modelos similares dentro del marketplace y mirá el precio de lista original. La condición, el grupo y los upgrades justifican diferencias de precio entre un anuncio y otro.',
      },
      {
        question: '¿Puedo vender sin pagar comisiones?',
        answer:
          'Publicar es gratis. Podés sumar un plan destacado para aparecer en portada y vender más rápido, pero no hay comisiones ocultas por la venta.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas usadas', href: '/marketplace?bikes=1' },
      { label: 'bici de ruta usada', href: '/marketplace?cat=Ruta' },
      { label: 'mountain bike usada', href: '/marketplace?cat=MTB' },
      { label: 'gravel usada', href: '/marketplace?cat=Gravel' },
      { label: 'bici urbana usada', href: '/marketplace?cat=Urbana' },
      { label: 'ofertas de bicicletas', href: '/marketplace?deal=1' },
    ],
  },

  Ruta: {
    title: 'Bicicletas de ruta usadas',
    intro:
      'Las bicicletas de ruta son la opción clásica para rodar en asfalto a velocidad, tanto en entrenamientos como en competencias. En Ciclo Market vas a encontrar modelos aero, endurance y escaladores, usados y nuevos, con fotos reales, estado declarado y contacto directo con el vendedor.',
    sections: [
      {
        heading: '¿Por qué comprar una bicicleta de ruta usada?',
        paragraphs: [
          'El mercado usado te permite acceder a cuadros de carbono y grupos de gama alta por una fracción del precio de lista. Muchas bicis se venden con pocos kilómetros y mantenimiento al día, así que podés conseguir una gran bici sin estrenar.',
          'En cada aviso revisamos que se detallen medidas claras, fotos nítidas y componentes. Usá los filtros para ajustar por talle, material del cuadro, grupo o ciudad y así llegar a una prueba segura.',
        ],
      },
      {
        heading: '¿Cuánto cuesta una buena bici de ruta?',
        paragraphs: [
          'El precio depende del material del cuadro, el grupo, las ruedas y la marca. Como referencia general:',
        ],
        list: [
          'Gama entrada: aluminio o carbono de generaciones anteriores. Ideal para empezar o para uso recreativo.',
          'Gama media: cuadro de carbono moderno con grupo como Shimano 105 o SRAM Rival. El equilibrio clásico entre precio y rendimiento.',
          'Gama alta: carbono liviano, grupos electrónicos (Ultegra Di2, Dura-Ace, Force AXS), ruedas de carbono y cuadros de gama pro.',
        ],
      },
      {
        heading: 'Tipos de bicicletas de ruta',
        paragraphs: [
          'Entender el tipo de bici te ayuda a elegir mejor:',
        ],
        list: [
          'Aero: tubos perfilados y geometría agresiva para máxima velocidad en llano.',
          'Endurance: geometría más relajada y espacio para cubiertas más anchas. Confort para largas distancias.',
          'Escaladora: cuadros ultralivianos pensados para subidas y puertos de montaña.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Estado del cuadro: golpes, fisuras en carbono u óxido en aluminio y acero.',
          'Grupo: desgaste de platos, cassette y cadena.',
          'Ruedas: alineación, frenos (de disco o caliper) y estado de las cubiertas.',
          'Historial: kilometraje estimado y service recientes.',
        ],
      },
    ],
    sizeChart: 'road',
    subcategories: [
      { label: 'Aero', href: '/marketplace?cat=Ruta&q=aero' },
      { label: 'Endurance', href: '/marketplace?cat=Ruta&q=endurance' },
      { label: 'Escaladora', href: '/marketplace?cat=Ruta&q=escaladora' },
    ],
    popularBrands: [
      { label: 'Specialized', href: '/marketplace?cat=Ruta&brand=Specialized' },
      { label: 'Trek', href: '/marketplace?cat=Ruta&brand=Trek' },
      { label: 'Cannondale', href: '/marketplace?cat=Ruta&brand=Cannondale' },
      { label: 'Cervélo', href: '/marketplace?cat=Ruta&brand=Cerv%C3%A9lo' },
      { label: 'Bianchi', href: '/marketplace?cat=Ruta&brand=Bianchi' },
      { label: 'Pinarello', href: '/marketplace?cat=Ruta&brand=Pinarello' },
      { label: 'Canyon', href: '/marketplace?cat=Ruta&brand=Canyon' },
      { label: 'Giant', href: '/marketplace?cat=Ruta&brand=Giant' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Qué diferencia hay entre una bici aero y una endurance?',
        answer:
          'Las aero priorizan la velocidad con tubos perfilados y una posición más agresiva. Las endurance son más cómodas, con geometría relajada y espacio para cubiertas más anchas; ideales para salidas largas.',
      },
      {
        question: '¿Qué grupo de transmisión me conviene?',
        answer:
          'Shimano 105 y SRAM Rival son la mejor relación precio/rendimiento. Ultegra y Force son más livianos y en versiones electrónicas mejoran el cambio. Dura-Ace y Red son gama alta de competencia.',
      },
      {
        question: '¿Conviene comprar una bici de ruta usada de carbono?',
        answer:
          'Sí, si verificás el estado del cuadro. Revisá que no haya fisuras, golpes profundos o zonas despintadas con sospecha de impacto. Pedí fotos del cuadro con buena luz y, de ser posible, una revisión en un taller.',
      },
      {
        question: '¿Qué rodado usan las bicis de ruta?',
        answer:
          'La mayoría usa ruedas 700c. Cada vez son más comunes los frenos de disco y las cubiertas de hasta 28-32 mm, que suman confort sin perder mucho rendimiento.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas de ruta usadas', href: '/marketplace?cat=Ruta' },
      { label: 'bici de ruta aero', href: '/marketplace?cat=Ruta&q=aero' },
      { label: 'bici de ruta endurance', href: '/marketplace?cat=Ruta&q=endurance' },
      { label: 'cuadro de ruta carbono', href: '/marketplace?cat=Accesorios&q=cuadro' },
      { label: 'gravel usada', href: '/marketplace?cat=Gravel' },
      { label: 'bici de ruta nueva', href: '/marketplace?cat=Ruta' },
    ],
  },

  MTB: {
    title: 'Bicicletas de montaña (MTB) usadas',
    intro:
      'La categoría MTB reúne rígidas y dobles suspensión listas para XC, trail, enduro o descenso. Cada publicación aclara recorrido, seteo del amortiguador y upgrades como ruedas tubeless, transmisiones 12v o frenos de cuatro pistones, así que encontrás la bici justa para tu terreno.',
    sections: [
      {
        heading: '¿Por qué comprar una MTB usada?',
        paragraphs: [
          'Las mountain bikes usadas ofrecen una oportunidad enorme: suspensiones y grupos de gama alta bajan mucho de precio. Además, las dobles suspensión suelen tener menos uso del que parece si su dueño mantenía el service al día.',
          'En cada publicación revisamos que se detallen el recorrido, el tipo de suspensión y el estado general. Filtrá por recorrido, tamaño de rueda, grupo, material o condición para encontrar la bici que se adapte a tu terreno.',
        ],
      },
      {
        heading: '¿Rígida o doble suspensión?',
        list: [
          'Rígida (hardtail): más liviana y simple, eficiente para subir y con menos mantenimiento. Perfecta para XC, senderos prolijos y presupuestos ajustados.',
          'Doble suspensión (full): más comodidad, tracción y control en terrenos rotos y descensos rápidos. Ideal para trail, enduro y días largos en la montaña.',
        ],
        paragraphs: [
          'Regla simple: menos recorrido trepa mejor y se siente más ágil en senderos suaves; más recorrido está pensado para descensos, roca suelta y golpes grandes.',
        ],
      },
      {
        heading: 'Tipos de MTB',
        list: [
          'XC: rígidas o dobles de poco recorrido, eficientes para competir y cubrir kilómetros.',
          'Trail: doble suspensión de recorrido medio, la más versátil para la mayoría.',
          'Enduro: mucho recorrido y geometría agresiva para bajar rápido sin renunciar a pedalear para arriba.',
          'Descenso (DH): máximo recorrido, solo para bajar. Por eso también hay muchas rígidas y dobles de trail en el mercado usado.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Suspensión: que el amortiguador y la horquilla no pierdan aceite y mantengan presión.',
          'Cuadro: golpes, fisuras y el estado de los pivotes en dobles suspensión.',
          'Rodado: 29", 27.5" o 26"; y si las ruedas son tubeless ready.',
          'Transmisión: desgaste de cassette, plato y cadena (especialmente en 12v).',
        ],
      },
    ],
    sizeChart: 'mtb',
    subcategories: [
      { label: 'XC', href: '/marketplace?cat=MTB&q=xc' },
      { label: 'Trail', href: '/marketplace?cat=MTB&q=trail' },
      { label: 'Enduro', href: '/marketplace?cat=MTB&q=enduro' },
      { label: 'Rígida', href: '/marketplace?cat=MTB&q=rigida' },
    ],
    popularBrands: [
      { label: 'Trek', href: '/marketplace?cat=MTB&brand=Trek' },
      { label: 'Specialized', href: '/marketplace?cat=MTB&brand=Specialized' },
      { label: 'Santa Cruz', href: '/marketplace?cat=MTB&brand=Santa%20Cruz' },
      { label: 'Giant', href: '/marketplace?cat=MTB&brand=Giant' },
      { label: 'Yeti', href: '/marketplace?cat=MTB&brand=Yeti' },
      { label: 'Canyon', href: '/marketplace?cat=MTB&brand=Canyon' },
      { label: 'Scott', href: '/marketplace?cat=MTB&brand=Scott' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿29" o 27.5"?',
        answer:
          'Las 29" ruedan mejor sobre obstáculos y son más estables a velocidad; las 27.5" son más ágiles y maniobrables. Para la mayoría, 29" es la opción más polivalente, pero el talle del cuadro importa más que el rodado.',
      },
      {
        question: '¿Cuánto recorrido necesito?',
        answer:
          'XC: 100-120 mm. Trail: 120-140 mm. Enduro: 150-170 mm. Descenso: 180-200 mm. Pensá dónde vas a andar el 90% del tiempo y elegí en base a eso.',
      },
      {
        question: '¿Qué reviso en la suspensión usada?',
        answer:
          'Que la horquilla y el amortiguador mantengan presión sin pérdidas visibles de aceite, que no golpeen al comprimir y que el service esté al día. Un service de suspensión puede costar; tenelo en cuenta en la negociación.',
      },
      {
        question: '¿Conviene una doble suspensión para empezar?',
        answer:
          'Si vas a andar senderos rotos o con raíces, sí: suma control y confort. Para senderos suaves y presupuesto ajustado, una rígida bien elegida es más simple y eficiente.',
      },
    ],
    similarSearches: [
      { label: 'mountain bikes usadas', href: '/marketplace?cat=MTB' },
      { label: 'doble suspensión usada', href: '/marketplace?cat=MTB&q=suspension' },
      { label: 'MTB rígida usada', href: '/marketplace?cat=MTB&q=rigida' },
      { label: 'e-MTB usada', href: '/marketplace?cat=E-Bike' },
      { label: 'bici de trail usada', href: '/marketplace?cat=MTB&q=trail' },
      { label: 'cuadro de MTB', href: '/marketplace?cat=Accesorios&q=cuadro' },
    ],
  },

  Gravel: {
    title: 'Bicicletas de gravel usadas',
    intro:
      'Las bicicletas de gravel expanden la ruta: combinan la velocidad de una bici de ruta con la capacidad de rodar por tierra, ripio y caminos de montaña. En Ciclo Market vas a encontrar cuadros de carbono, aluminio, acero y titanio, con espacio real para cubiertas anchas y monturas para bikepacking.',
    sections: [
      {
        heading: '¿Qué es una bicicleta de gravel?',
        paragraphs: [
          'Las gravel bikes nacieron para cubrir los millones de kilómetros de caminos sin pavimentar. Combinan la agilidad de una ruta con la estabilidad de una MTB: geometría más relajada, cubiertas anchas y (en general) frenos de disco.',
          'Suelen parecerse a las de ciclocross, pero son más estables, cómodas y admiten cubiertas más grandes. El rodado 700c es el dominante, aunque el 650b tiene un lugar real para quien quiere rodar más ancho y rodar lejos.',
        ],
      },
      {
        heading: 'Gravel vs. ruta: las diferencias clave',
        list: [
          'Cubiertas: las gravel usan cubiertas más anchas y con tacos para tracción; las de ruta son lisas y angostas para velocidad.',
          'Geometría: la gravel es más relajada y estable; la ruta es más agresiva y aerodinámica.',
          'Desarrollos: la gravel suele tener un rango de cambios más amplio para subir y rodar suelto.',
          'Frenos: la gravel usa discos en casi todos los casos, con mejor mordida en barro y lluvia.',
          'Monturas: la gravel trae puntos extra para bolsos, botellas y parrillas, ideal para bikepacking.',
        ],
      },
      {
        heading: 'Materiales de cuadro',
        paragraphs: [
          'Cada material cambia el precio, el peso y el confort:',
        ],
        list: [
          'Carbono: liviano y cómodo, absorbe bien las vibraciones. El más popular en gama media y alta.',
          'Aluminio: excelente relación precio/rendimiento, con cubiertas anchas que compensan la rigidez.',
          'Acero: durable y con buena flexión, favorito para bikepacking y builds artesanales.',
          'Titanio: el material de por vida; liviano, cómodo y resistente a la corrosión. Gama premium.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Espacio para cubiertas: verificá el clearance máximo del cuadro y horquilla.',
          'Frenos de disco: estado de discos y pastillas, especialmente si se usó en barro.',
          'Monturas y accesorios: que los puntos de anclaje estén en buen estado.',
          'Estado del grupo: revisá el desgaste de transmisión y si es monoplato o doble plato.',
        ],
      },
    ],
    sizeChart: 'gravel',
    subcategories: [
      { label: 'Race', href: '/marketplace?cat=Gravel&q=race' },
      { label: 'Adventure', href: '/marketplace?cat=Gravel&q=adventure' },
      { label: 'Bikepacking', href: '/marketplace?cat=Gravel&q=bikepacking' },
    ],
    popularBrands: [
      { label: 'Specialized', href: '/marketplace?cat=Gravel&brand=Specialized' },
      { label: 'Cannondale', href: '/marketplace?cat=Gravel&brand=Cannondale' },
      { label: 'Trek', href: '/marketplace?cat=Gravel&brand=Trek' },
      { label: 'Giant', href: '/marketplace?cat=Gravel&brand=Giant' },
      { label: 'Niner', href: '/marketplace?cat=Gravel&brand=Niner' },
      { label: 'Salsa', href: '/marketplace?cat=Gravel&brand=Salsa' },
      { label: 'Surly', href: '/marketplace?cat=Gravel&brand=Surly' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Puedo usar una gravel también en asfalto?',
        answer:
          'Sí. Es una de sus grandes ventajas: con cubiertas mixtas o slicks anda muy bien en ruta y después podés mandarle ripio. Por eso es una excelente bici única.',
      },
      {
        question: '¿700c o 650b?',
        answer:
          '700c rueda más rápido y es más común. 650b permite cubiertas más anchas (hasta ~2.1") para terrenos más rotos. Elegí según el tipo de camino que predominará.',
      },
      {
        question: '¿Qué talle elijo si mido 175 cm?',
        answer:
          'Como referencia, un M (52-55 cm) suele ir bien entre 169 y 178 cm. Igual, cada marca varía: mirá el reach y el stack, no solo la etiqueta del talle.',
      },
      {
        question: '¿Necesito frenos de disco?',
        answer:
          'En gravel, sí. Vas a andar en tierra, barro y condiciones variables; el disco te da potencia y control constante. Las versiones hidráulicas son las más recomendadas.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas de gravel usadas', href: '/marketplace?cat=Gravel' },
      { label: 'gravel de carbono usada', href: '/marketplace?cat=Gravel&q=carbono' },
      { label: 'bici de ciclocross usada', href: '/marketplace?cat=Gravel&q=ciclocross' },
      { label: 'bikepacking', href: '/marketplace?cat=Gravel&q=bikepacking' },
      { label: 'cuadro de gravel', href: '/marketplace?cat=Accesorios&q=cuadro' },
      { label: 'bici de ruta usada', href: '/marketplace?cat=Ruta' },
    ],
  },

  Triatlón: {
    title: 'Bicicletas de triatlón y contrarreloj',
    intro:
      'Si querés convertirte en un misil sobre dos ruedas, querés una bici de triatlón. Las tri bikes y TT bikes están pensadas para cortar el drag aéreo: cuadro perfilado, posición adelantada y aerobars para deslizarte por el aire con menos esfuerzo.',
    sections: [
      {
        heading: 'La diferencia entre triatlón y contrarreloj (TT)',
        paragraphs: [
          'La mayoría de las tri y TT modernas se ven iguales y se pueden usar de forma intercambiable, pero hay una distinción clave: las reglas UCI. Las TT para carreras oficiales pueden necesitar cumplir restricciones de diseño UCI. Las de triatlón suelen priorizar la velocidad real y la conveniencia, con integración de hidratación y almacenamiento.',
          'Salvo que corras un campeonato nacional o un evento UCI, no hace falta obsesionarse con la legalidad UCI: el fit y la aerodinámica importan más.',
        ],
      },
      {
        heading: '¿Cuánto gastar en una buena tri?',
        paragraphs: [
          'Una buena forma de decidir cuánto gastar es según tu nivel, presupuesto y objetivos:',
          'Si recién empezás, una alternativa inteligente es sumar aerobars a una bici de ruta: te da versatilidad y te deja probar la posición antes de invertir en una tri dedicada.',
        ],
        list: [
          'Entrada: cuadros de aluminio y componentes de gama media. Ideal para arrancar y descubrir la disciplina.',
          'Gama media: cuadros de carbono y componentes de mejor calidad. La opción más elegida por atletas amateurs.',
          'Gama alta: carbono aerodinámico, grupos electrónicos y ruedas de perfil. Para competir en serio.',
        ],
      },
      {
        heading: 'Qué hace buena a una tri / TT',
        list: [
          'Cuadro aerodinámico: tubos perfilados, componentes integrados y cables ocultos.',
          'Geometría agresiva: ángulo de tubo de asiento más parado (76-78°) que abre la cadera y mejora la entrega de potencia.',
          'Aerobars: apoyás los antebrazos y agarrás las extensiones para mantener una posición aero.',
          'Almacenamiento integrado: hidratación y herramientas que mantienen la aerodinámica.',
          'Ruedas de perfil: las secciones profundas reducen significativamente el drag.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Fit: stack, reach y posición de las aerobars. Es la diferencia entre "rápido" y "rápido en un Ironman".',
          'Hidratación y almacenamiento: que los sistemas integrados estén completos.',
          'Grupo: estado de la transmisión y si es electrónico.',
          'Ruedas: perfil, estado de las cubiertas y compatibilidad con tubeless.',
        ],
      },
    ],
    sizeChart: 'tri',
    subcategories: [
      { label: 'Triatlón', href: '/marketplace?cat=Triatl%C3%B3n&q=triatlon' },
      { label: 'Contrarreloj', href: '/marketplace?cat=Triatl%C3%B3n&q=contrarreloj' },
    ],
    popularBrands: [
      { label: 'Cervélo', href: '/marketplace?cat=Triatl%C3%B3n&brand=Cerv%C3%A9lo' },
      { label: 'Trek', href: '/marketplace?cat=Triatl%C3%B3n&brand=Trek' },
      { label: 'Quintana Roo', href: '/marketplace?cat=Triatl%C3%B3n&brand=Quintana%20Roo' },
      { label: 'Felt', href: '/marketplace?cat=Triatl%C3%B3n&brand=Felt' },
      { label: 'Ventum', href: '/marketplace?cat=Triatl%C3%B3n&brand=Ventum' },
      { label: 'Argon 18', href: '/marketplace?cat=Triatl%C3%B3n&brand=Argon%2018' },
      { label: 'Orbea', href: '/marketplace?cat=Triatl%C3%B3n&brand=Orbea' },
      { label: 'Specialized', href: '/marketplace?cat=Triatl%C3%B3n&brand=Specialized' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Puedo usar una tri bike en una prueba de ruta?',
        answer:
          'En carreras de ruta estilo pelotón, las tri bikes suelen estar prohibidas por su geometría y aerobars. Están pensadas para triatlón, contrarreloj y pruebas contra el reloj.',
      },
      {
        question: '¿Qué es mejor: una tri o una ruta con aerobars?',
        answer:
          'Para empezar, una ruta con aerobars es más versátil y económica. Si ya competís en triatlón seguido, una tri dedicada te da posición, integración y aerodinámica superiores.',
      },
      {
        question: '¿Importa mucho el peso en una tri?',
        answer:
          'Menos que en una escaladora: en llano y contrarreloj la aerodinámica pesa más que el peso. Aun así, en circuitos con subidas un cuadro liviano ayuda.',
      },
      {
        question: '¿Qué talle elijo?',
        answer:
          'Usá la tabla como punto de partida y ajustá con el fit. En tri, la posición aero cambia el alcance: stack y reach son más importantes que el talle de la etiqueta.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas de triatlón usadas', href: '/marketplace?cat=Triatl%C3%B3n' },
      { label: 'bici contrarreloj usada', href: '/marketplace?cat=Triatl%C3%B3n&q=contrarreloj' },
      { label: 'TT bike usada', href: '/marketplace?cat=Triatl%C3%B3n&q=tt' },
      { label: 'bici de ruta usada', href: '/marketplace?cat=Ruta' },
      { label: 'ruedas de perfil', href: '/marketplace?cat=Accesorios&q=ruedas' },
      { label: 'ofertas de triatlón', href: '/marketplace?cat=Triatl%C3%B3n&deal=1' },
    ],
  },

  Urbana: {
    title: 'Bicicletas urbanas usadas',
    intro:
      'Las bicicletas urbanas están pensadas para moverte por la ciudad con seguridad, comodidad y estilo. En Ciclo Market encontrás desde plegables hasta playeras y urbanas clásicas, con guardabarros, portaequipaje, luces y todo lo necesario para el día a día.',
    sections: [
      {
        heading: '¿Qué buscar en una urbana?',
        paragraphs: [
          'Para uso diario, la clave es la comodidad y la simpleza: posición erguida, cambios fáciles y poco mantenimiento. Las bicis con transmisión interna (cambios dentro del buje) o correa son ideales porque exigen menos cuidado y no ensucian.',
        ],
        list: [
          'Guardabarros: indispensables para los días de lluvia.',
          'Portaequipaje: para llevar mochilas, canastos o sillas infantiles.',
          'Luces: fijas y recargables, visibilidad ante todo.',
          'Frenos: de disco o de contrapedal; ambos funcionan bien en ciudad.',
          'Peso: una bici más liviana se sube más fácil a la vereda o al bondi.',
        ],
      },
      {
        heading: 'Plegables: la solución para combinar',
        paragraphs: [
          'Las plegables son perfectas para combinar con tren, subte o el baúl del auto. Fijate el sistema de plegado, el peso y el rodado (16" a 20"): cuanto más chico, más compacta; cuanto más grande, más estable.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Cuadro y pintura: óxido en zonas de montaje de guardabarros y parrillas.',
          'Transmisión: si es interna, que los cambios entren limpios y sin ruido.',
          'Frenos y cubiertas: estado general, especialmente si la bici se dejó a la intemperie.',
          'Accesorios incluidos: muchas se venden con candado, luces o canasto ya instalados.',
        ],
      },
    ],
    sizeChart: 'urban',
    subcategories: [
      { label: 'Plegables', href: '/marketplace?cat=Urbana&q=plegable' },
      { label: 'Playeras', href: '/marketplace?cat=Urbana&q=playera' },
      { label: 'Clásicas', href: '/marketplace?cat=Urbana&q=clasica' },
    ],
    popularBrands: [
      { label: 'Trek', href: '/marketplace?cat=Urbana&brand=Trek' },
      { label: 'Giant', href: '/marketplace?cat=Urbana&brand=Giant' },
      { label: 'Specialized', href: '/marketplace?cat=Urbana&brand=Specialized' },
      { label: 'Raleigh', href: '/marketplace?cat=Urbana&brand=Raleigh' },
      { label: 'Venzo', href: '/marketplace?cat=Urbana&brand=Venzo' },
      { label: 'Vairo', href: '/marketplace?cat=Urbana&brand=Vairo' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Qué diferencia hay entre urbana y playera?',
        answer:
          'La playera tiene el manubrio alto y curvo para una posición muy erguida; la urbana es más polivalente. Ambas son cómodas para ciudad; la playera prioriza la estética clásica.',
      },
      {
        question: '¿Conviene una plegable o una fija?',
        answer:
          'Si combinás con transporte público, una plegable es la mejor opción. Si la bici duerme siempre en casa o en el laburo y no necesitás plegarla, una fija de buen talle es más cómoda y estable.',
      },
      {
        question: '¿Qué talle necesito si mido 170 cm?',
        answer:
          'Como referencia, un M (53-56 cm) suele ir bien entre 165 y 175 cm. En urbanas la posición erguida perdona más, pero conviene apoyar los dos pies con el asiento bajo.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas urbanas usadas', href: '/marketplace?cat=Urbana' },
      { label: 'bici plegable usada', href: '/marketplace?cat=Urbana&q=plegable' },
      { label: 'bici playera usada', href: '/marketplace?cat=Urbana&q=playera' },
      { label: 'e-bike urbana', href: '/marketplace?cat=E-Bike' },
      { label: 'bici fixie', href: '/marketplace?cat=Fixie' },
    ],
  },

  Fixie: {
    title: 'Fixie y single speed usadas',
    intro:
      'La sección fixie agrupa cuadros livianos, componentes minimalistas y muchas bicicletas listas para personalizar. Encontrás montajes con piñón fijo, rueda libre o configuraciones mixtas, ideales para la ciudad y para los que buscan simplicidad total.',
    sections: [
      {
        heading: '¿Fixie o single speed?',
        paragraphs: [
          'La diferencia está en el buje: en una fixie el piñón es fijo y las piernas nunca dejan de pedalear; en una single speed hay rueda libre y podés dejar de pedalear. La fixie da más conexión con la bici y permite frenar con las piernas; la single speed es más indulgente para empezar.',
        ],
      },
      {
        heading: 'Relación y componentes',
        list: [
          'Relación: una relación más corta (ej. 46x17) es más cómoda en ciudad y subidas; una más larga es más rápida en llano.',
          'Manubrios: de pista (drop) para posición aero, o planos para ciudad.',
          'Frenos: muchas fixies se usan sin freno delantero; si vas a andar en ciudad, sumale al menos uno.',
          'Straps: correas o straps para pedalear con el piñón fijo de forma segura.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Cuadro: que no tenga fisuras cerca de las soldaduras.',
          'Buje trasero: que gire parejo y sin juego.',
          'Cadena y plato: desgaste y tensión.',
          'Pintura y detalles: en las custom, el estado de las piezas vale más que el conjunto original.',
        ],
      },
    ],
    sizeChart: 'road',
    subcategories: [
      { label: 'Fixie', href: '/marketplace?cat=Fixie&q=fixie' },
      { label: 'Single speed', href: '/marketplace?cat=Fixie&q=single' },
      { label: 'Pista', href: '/marketplace?cat=Pista' },
    ],
    popularBrands: [
      { label: 'Cinelli', href: '/marketplace?cat=Fixie&brand=Cinelli' },
      { label: 'Specialized', href: '/marketplace?cat=Fixie&brand=Specialized' },
      { label: 'Bianchi', href: '/marketplace?cat=Fixie&brand=Bianchi' },
      { label: 'Fuji', href: '/marketplace?cat=Fixie&brand=Fuji' },
      { label: 'Trek', href: '/marketplace?cat=Fixie&brand=Trek' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Una fixie sirve para la ciudad?',
        answer:
          'Sí, es una bici urbana excelente: liviana, simple y con poco mantenimiento. Sumale un freno delantero y arrancá con rueda libre si es tu primera vez.',
      },
      {
        question: '¿Qué relación uso para empezar?',
        answer:
          'Una 46x17 o 46x16 es un buen punto de partida en ciudad: ni muy dura para arrancar ni muy corta para andar a ritmo.',
      },
      {
        question: '¿Es difícil andar con piñón fijo?',
        answer:
          'Lleva unas salidas de adaptación, sobre todo para frenar con las piernas y no dejar de pedalear en las curvas. Empezá en calles tranquilas.',
      },
    ],
    similarSearches: [
      { label: 'fixie usada', href: '/marketplace?cat=Fixie' },
      { label: 'single speed usada', href: '/marketplace?cat=Fixie&q=single' },
      { label: 'bici de pista usada', href: '/marketplace?cat=Pista' },
      { label: 'bici urbana usada', href: '/marketplace?cat=Urbana' },
    ],
  },

  'E-Bike': {
    title: 'Bicicletas eléctricas (E-Bike)',
    intro:
      'En E-Bike vas a encontrar bicicletas asistidas para ciudad, montaña o gravel, con motores centrales o en el buje. Destacamos capacidad de batería, ciclos de carga, autonomía estimada y modos de asistencia regulables para que evalúes si se adapta a tu rutina.',
    sections: [
      {
        heading: 'Motor central o en el buje',
        list: [
          'Motor central: mejor reparto de peso y sensación natural de pedaleo. Ideal para montaña y uso intensivo.',
          'Motor en el buje: más simple y económico, suficiente para ciudad y trayectos planos.',
        ],
      },
      {
        heading: 'Autonomía y batería: lo más importante al comprar usada',
        paragraphs: [
          'La batería es el componente más caro y el que más se degrada. Preguntá por los ciclos de carga, el año y el estado real de la batería. Una batería cuidada puede durar 500-800 ciclos; una descuidada, mucho menos.',
        ],
        list: [
          'Pedí el historial de service y, si es posible, que el vendedor muestre el estado de la batería en el display.',
          'Verificá que el cargador sea el original y que la bici cargue normal.',
          'Revisá frenos y transmisión: una e-bike pesa más y exige componentes en buen estado.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Batería: ciclos, año, autonomía real y estado general.',
          'Motor: ruidos, juego y respuesta de la asistencia.',
          'Display y controles: que todo funcione y sea legible.',
          'Cuadro y ruedas: peso extra significa más desgaste en frenos y llantas.',
        ],
      },
    ],
    sizeChart: 'urban',
    subcategories: [
      { label: 'Urbanas', href: '/marketplace?cat=E-Bike&q=urbana' },
      { label: 'MTB eléctricas', href: '/marketplace?cat=E-Bike&q=mtb' },
      { label: 'Plegables', href: '/marketplace?cat=E-Bike&q=plegable' },
    ],
    popularBrands: [
      { label: 'Trek', href: '/marketplace?cat=E-Bike&brand=Trek' },
      { label: 'Specialized', href: '/marketplace?cat=E-Bike&brand=Specialized' },
      { label: 'Giant', href: '/marketplace?cat=E-Bike&brand=Giant' },
      { label: 'Momentum', href: '/marketplace?cat=E-Bike&brand=Momentum' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Cuánto dura la batería de una e-bike usada?',
        answer:
          'Depende de los ciclos de carga y el cuidado. En general 500-800 ciclos antes de perder autonomía notable. Pedí el historial y probala si podés.',
      },
      {
        question: '¿Necesito registro o carnet para una e-bike en Argentina?',
        answer:
          'Depende de la normativa local de cada municipio. Verificá la regulación de tu ciudad sobre potencia y velocidad máxima de las bicis asistidas.',
      },
      {
        question: '¿Qué autonomía es suficiente?',
        answer:
          'Para ciudad, 40-60 km reales suelen alcanzar para la mayoría. Si pensás en montaña o trayectos largos, buscá baterías de más capacidad.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas eléctricas usadas', href: '/marketplace?cat=E-Bike' },
      { label: 'e-bike urbana', href: '/marketplace?cat=E-Bike&q=urbana' },
      { label: 'e-MTB usada', href: '/marketplace?cat=E-Bike&q=mtb' },
      { label: 'batería para e-bike', href: '/marketplace?cat=Accesorios&q=bateria' },
    ],
  },

  Niños: {
    title: 'Bicicletas para niños y niñas',
    intro:
      'En la categoría Niños reunimos balance bikes, rodados intermedios y primeras bicis con transmisión. Cada aviso incluye altura recomendada, peso del cuadro y si tiene rueditas, freno a contrapedal o frenos de mano.',
    sections: [
      {
        heading: 'Elegí por rodado, no por edad',
        paragraphs: [
          'El rodado correcto permite que el niño apoye los pies en el piso con el asiento bajo. Comprar "una talla más para que crezca" es un error: una bici grande da inseguridad y frena el aprendizaje.',
        ],
      },
      {
        heading: 'Rueditas, balance bike o rodado libre',
        list: [
          'Balance bike: sin pedales, ideal desde los 2 años para aprender equilibrio.',
          'Rueditas: útiles como transición, pero muchas familias prefieren ir directo al rodado libre con el asiento bajo.',
          'Rodado libre con frenos de mano: para niños que ya equilibran y quieren salir a pedalear.',
        ],
      },
      {
        heading: 'Seguridad y extras',
        paragraphs: [
          'Siempre casco, y revisá que los frenos alcancen a la mano del niño. Guardabarros, canasto y luces suman para que la bici se use más. Muchas publicaciones incluyen estos accesorios.',
        ],
      },
    ],
    sizeChart: 'kids',
    subcategories: [
      { label: 'Balance bikes', href: '/marketplace?cat=Ni%C3%B1os&q=balance' },
      { label: 'Primeras bicis', href: '/marketplace?cat=Ni%C3%B1os&q=primera' },
      { label: 'Rodados 20"-24"', href: '/marketplace?cat=Ni%C3%B1os&q=24' },
    ],
    popularBrands: [
      { label: 'Trek', href: '/marketplace?cat=Ni%C3%B1os&brand=Trek' },
      { label: 'Specialized', href: '/marketplace?cat=Ni%C3%B1os&brand=Specialized' },
      { label: 'Woom', href: '/marketplace?cat=Ni%C3%B1os&brand=Woom' },
      { label: 'Guardian', href: '/marketplace?cat=Ni%C3%B1os&brand=Guardian' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Cuándo pasar a un rodado más grande?',
        answer:
          'Cuando el niño ya no puede pedalear cómodo o le quedan las rodillas cerca del manubrio. Generalmente cada 2-3 años hasta llegar a un 26".',
      },
      {
        question: '¿Sirve comprar usada para niños?',
        answer:
          'Sí, y mucho: los niños crecen rápido y las bicis suelen tener poco uso. Revisá frenos, cubiertas y que no haya óxido en la cadena.',
      },
      {
        question: '¿Qué es una balance bike?',
        answer:
          'Una bici sin pedales donde el niño avanza empujando con los pies. Es la mejor manera de aprender equilibrio y pasar después a pedalear sin rueditas.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas para niños usadas', href: '/marketplace?cat=Ni%C3%B1os' },
      { label: 'balance bike', href: '/marketplace?cat=Ni%C3%B1os&q=balance' },
      { label: 'bici rodado 20 usada', href: '/marketplace?cat=Ni%C3%B1os&q=20' },
      { label: 'bici rodado 24 usada', href: '/marketplace?cat=Ni%C3%B1os&q=24' },
    ],
  },

  Pista: {
    title: 'Bicicletas de pista y velódromo',
    intro:
      'Las bicicletas de pista listadas en Ciclo Market están pensadas para velódromo o criterium, con cuadros rígidos, ángulos agresivos y componentes específicos. Detallamos material del cuadro, geometría, longitud de bielas y relación de transmisión sugerida para cada disciplina.',
    sections: [
      {
        heading: '¿Qué hace especial a una bici de pista?',
        paragraphs: [
          'Son bicis de piñón fijo, sin frenos, con geometría de carrera y ángulos cerrados que priorizan la respuesta inmediata. Cada componente está pensado para la velocidad y la precisión.',
        ],
        list: [
          'Relación de transmisión: las pistas se arman con relaciones fijas según la distancia y el nivel del ciclista.',
          'Bielas: longitud según la altura y la disciplina.',
          'Ruedas: de perfil o lenticulares para reducir el drag en el velódromo.',
          'Cockpit aero: manubrios de pista o de contrarreloj según la prueba.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Cuadro: fisuras cerca de las soldaduras y estado del carbono si es de ese material.',
          'Rodamientos: bujes y pedalier que giren parejo y sin juego.',
          'Cadena y plato: desgaste y tensión.',
          'Compatibilidad: que el buje trasero sea de pista (track) y la relación sea la correcta.',
        ],
      },
    ],
    sizeChart: 'road',
    subcategories: [
      { label: 'Velódromo', href: '/marketplace?cat=Pista&q=velodromo' },
      { label: 'Criterium', href: '/marketplace?cat=Pista&q=criterium' },
    ],
    popularBrands: [
      { label: 'Cinelli', href: '/marketplace?cat=Pista&brand=Cinelli' },
      { label: 'Dolan', href: '/marketplace?cat=Pista&brand=Dolan' },
      { label: 'Bianchi', href: '/marketplace?cat=Pista&brand=Bianchi' },
      { label: 'Look', href: '/marketplace?cat=Pista&brand=Look' },
      { label: 'Specialized', href: '/marketplace?cat=Pista&brand=Specialized' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Puedo usar una bici de pista en la calle?',
        answer:
          'Técnicamente sí, pero no está pensada para eso: sin frenos y con relación fija es riesgosa en tránsito. Si querés ese estilo para ciudad, mirá las fixies.',
      },
      {
        question: '¿Qué relación uso para empezar en velódromo?',
        answer:
          'Empezá con una relación corta y andá subiendo de a poco a medida que ganás ritmo. Tu entrenador o el taller de la pista te pueden orientar.',
      },
      {
        question: '¿Qué talle elijo?',
        answer:
          'Las de pista usan la misma lógica de talles que las de ruta: XS a XXL según la altura. Ajustá también la longitud de bielas a tu altura.',
      },
    ],
    similarSearches: [
      { label: 'bicicletas de pista usadas', href: '/marketplace?cat=Pista' },
      { label: 'bici de velódromo', href: '/marketplace?cat=Pista&q=velodromo' },
      { label: 'fixie usada', href: '/marketplace?cat=Fixie' },
      { label: 'ruedas lenticulares', href: '/marketplace?cat=Accesorios&q=lenticular' },
    ],
  },

  Accesorios: {
    title: 'Accesorios y componentes para ciclismo',
    intro:
      'El catálogo de accesorios reúne componentes originales, upgrades premium y equipamiento de entrenamiento: ruedas, grupos completos, potenciómetros, ciclocomputadoras, rodillos y repuestos difíciles de conseguir.',
    sections: [
      {
        heading: '¿Qué vas a encontrar?',
        list: [
          'Ruedas y cubiertas: de perfil, de carbono, tubeless ready y rodados para cada disciplina.',
          'Grupos y transmisión: grupos completos y piezas sueltas de Shimano, SRAM y Campagnolo.',
          'Medición y entrenamiento: potenciómetros, ciclocomputadoras y rodillos inteligentes.',
          'Componentes: manubrios, stems, sillines, bielas y más.',
        ],
      },
      {
        heading: 'Cómo comprar usado sin errores de compatibilidad',
        paragraphs: [
          'Cada publicación detalla compatibilidades, estado de uso y, cuando corresponde, facturas o garantías vigentes. Antes de comprar, verificá estándares como Boost, AXS, 12v o el ancho de buje según tu cuadro.',
          'Las tiendas oficiales suelen ofrecer instalación y servicio; los ciclistas particulares destacan upgrades que cambiaron por una mejora. Ambos son buenas fuentes de repuestos a buen precio.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Ruedas: alineación, desgaste de llantas y estado de rodamientos.',
          'Grupo: desgaste de platos, cassette y cadena.',
          'Electrónica: que displays y sensores funcionen y tengan batería.',
          'Compatibilidad: estándares de montaje y medidas exactas.',
        ],
      },
    ],
    subcategories: [
      { label: 'Ruedas y cubiertas', href: '/marketplace?cat=Accesorios&q=ruedas' },
      { label: 'Grupos', href: '/marketplace?cat=Accesorios&q=grupo' },
      { label: 'Ciclocomputadoras', href: '/marketplace?cat=Accesorios&q=ciclocomputadora' },
      { label: 'Rodillos', href: '/marketplace?cat=Accesorios&q=rodillo' },
    ],
    popularBrands: [
      { label: 'Shimano', href: '/marketplace?cat=Accesorios&brand=Shimano' },
      { label: 'SRAM', href: '/marketplace?cat=Accesorios&brand=SRAM' },
      { label: 'Campagnolo', href: '/marketplace?cat=Accesorios&brand=Campagnolo' },
      { label: 'Zipp', href: '/marketplace?cat=Accesorios&brand=Zipp' },
      { label: 'Garmin', href: '/marketplace?cat=Accesorios&brand=Garmin' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Qué es Boost y por qué importa?',
        answer:
          'Boost es el estándar de ancho de bujes (110x148 mm) de las MTB modernas. Comprar ruedas Boost para un cuadro no-Boost (o al revés) no va a andar sin adaptadores.',
      },
      {
        question: '¿Conviene comprar un grupo usado?',
        answer:
          'Sí, si está bien cuidado. Revisá el desgaste de platos y cassette, y que el desviador no esté golpeado. Un grupo usado a buen precio es un gran upgrade.',
      },
      {
        question: '¿Cómo sé si una rueda es compatible con mi bici?',
        answer:
          'Verificá el ancho del buje, el estándar de frenos (disco o caliper) y el tipo de cassette. Si tenés dudas, el vendedor o una tienda oficial te pueden orientar.',
      },
    ],
    similarSearches: [
      { label: 'ruedas de carbono usadas', href: '/marketplace?cat=Accesorios&q=ruedas' },
      { label: 'grupo shimano usado', href: '/marketplace?cat=Accesorios&q=shimano' },
      { label: 'potenciómetro usado', href: '/marketplace?cat=Accesorios&q=potenciometro' },
      { label: 'ciclocomputadora usada', href: '/marketplace?cat=Accesorios&q=ciclocomputadora' },
    ],
  },

  Indumentaria: {
    title: 'Indumentaria de ciclismo',
    intro:
      'Esta sección agrupa jerseys, culottes, cascos, zapatillas y accesorios técnicos para entrenar o competir. Indicamos la tabla de talles declarada, el ajuste recomendado y si la prenda fue usada en competencias, salidas casuales o permanece nueva.',
    sections: [
      {
        heading: 'Qué vas a encontrar',
        list: [
          'Culottes: con badana y tirantes, para comodidad en horas de rodada.',
          'Jerseys: transpirables, con bolsillos traseros y cierre.',
          'Cascos: con tecnologías de ventilación y protección (MIPS).',
          'Zapatillas: de calas o planas, para ruta, MTB o ciudad.',
          'Accesorios: guantes, anteojos, medias técnicas y más.',
        ],
      },
      {
        heading: 'Cómo elegir talle en usado',
        paragraphs: [
          'La indumentaria técnica es ceñida a propósito: si dudás entre dos talles, el más grande suele ser más cómodo. Cada publicación aclara el talle declarado y el ajuste recomendado; usá los filtros por marca, categoría, género y talle para evitar pruebas innecesarias.',
        ],
      },
      {
        heading: 'Qué revisar antes de comprar',
        list: [
          'Estado de la badana en culottes y del forro interior.',
          'Que cierres, bolsillos y costuras estén intactos.',
          'Cascos: que no tenga golpes o fisuras (nunca compres un casco golpeado).',
          'Calas y suelas en zapatillas.',
        ],
      },
    ],
    subcategories: [
      { label: 'Culottes', href: '/marketplace?cat=Indumentaria&q=culotte' },
      { label: 'Jerseys', href: '/marketplace?cat=Indumentaria&q=jersey' },
      { label: 'Cascos', href: '/marketplace?cat=Indumentaria&q=casco' },
      { label: 'Zapatillas', href: '/marketplace?cat=Indumentaria&q=zapatillas' },
    ],
    popularBrands: [
      { label: 'Castelli', href: '/marketplace?cat=Indumentaria&brand=Castelli' },
      { label: 'Rapha', href: '/marketplace?cat=Indumentaria&brand=Rapha' },
      { label: 'Giro', href: '/marketplace?cat=Indumentaria&brand=Giro' },
      { label: 'Specialized', href: '/marketplace?cat=Indumentaria&brand=Specialized' },
      { label: 'Assos', href: '/marketplace?cat=Indumentaria&brand=Assos' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Qué talle elijo en indumentaria ciclista?',
        answer:
          'La ropa técnica es ceñida. Usá la tabla de la marca y, si dudás, elegí el talle más grande. En culottes, el talle suele seguir a la altura de cintura y la cadera.',
      },
      {
        question: '¿Puedo comprar un casco usado?',
        answer:
          'Solo si está impecable: sin golpes, fisuras ni rayones profundos. Un casco que recibió un impacto perdió protección aunque se vea bien. Ante la duda, no.',
      },
      {
        question: '¿Vale la pena la ropa técnica?',
        answer:
          'Para salidas largas, sí: la badana y los tejidos transpirables hacen una gran diferencia. En usado podés conseguir marcas premium a buen precio.',
      },
    ],
    similarSearches: [
      { label: 'culotte ciclismo usado', href: '/marketplace?cat=Indumentaria&q=culotte' },
      { label: 'jersey de ciclismo usado', href: '/marketplace?cat=Indumentaria&q=jersey' },
      { label: 'casco de ciclismo usado', href: '/marketplace?cat=Indumentaria&q=casco' },
      { label: 'zapatillas de ciclismo usadas', href: '/marketplace?cat=Indumentaria&q=zapatillas' },
    ],
  },

  Nutrición: {
    title: 'Nutrición para ciclismo',
    intro:
      'En Nutrición reunimos geles, barras, suplementos y bebidas isotónicas pensados para sostener tus entrenamientos y salidas largas. Cada publicación destaca fecha de vencimiento, sabores disponibles y presentaciones individuales o en pack.',
    sections: [
      {
        heading: 'Qué vas a encontrar',
        list: [
          'Geles y energía: para el esfuerzo inmediato durante la rodada.',
          'Barras y alimentos sólidos: energía sostenida para salidas largas.',
          'Hidratación: bebidas isotónicas y sales para reponer electrolitos.',
          'Recuperación: proteínas y suplementos para después del esfuerzo.',
        ],
      },
      {
        heading: 'Cómo comprar seguro',
        paragraphs: [
          'Siempre verificá la fecha de vencimiento y el estado del envase. Las tiendas oficiales suelen ofrecer combos y asesoramiento; los vendedores particulares aclaran cómo almacenaron los productos y por qué los liberan.',
        ],
      },
    ],
    subcategories: [
      { label: 'Geles', href: '/marketplace?cat=Nutrici%C3%B3n&q=gel' },
      { label: 'Barras', href: '/marketplace?cat=Nutrici%C3%B3n&q=barra' },
      { label: 'Hidratación', href: '/marketplace?cat=Nutrici%C3%B3n&q=isot%C3%B3nica' },
      { label: 'Recuperación', href: '/marketplace?cat=Nutrici%C3%B3n&q=prote%C3%ADna' },
    ],
    popularBrands: [
      { label: 'SIS', href: '/marketplace?cat=Nutrici%C3%B3n&brand=SIS' },
      { label: 'GU', href: '/marketplace?cat=Nutrici%C3%B3n&brand=GU' },
      { label: 'Clif', href: '/marketplace?cat=Nutrici%C3%B3n&brand=Clif' },
      { label: 'Enervit', href: '/marketplace?cat=Nutrici%C3%B3n&brand=Enervit' },
      { label: 'Eforce', href: '/marketplace?cat=Nutrici%C3%B3n&brand=Eforce' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Cuánta energía necesito en una salida larga?',
        answer:
          'Como referencia general, 60-90 gramos de carbohidratos por hora en esfuerzos de más de 1:30 h. Combiná geles con alimentos sólidos y buena hidratación.',
      },
      {
        question: '¿Los geles caducan?',
        answer:
          'Sí. Revisá siempre la fecha de vencimiento: un gel vencido puede perder efectividad y hasta alterar el sabor y la textura.',
      },
      {
        question: '¿Vale la pena comprar nutrición usada?',
        answer:
          'Con fecha vigente y envase cerrado, sí: es una forma de conseguir productos a buen precio. Nunca compres productos abiertos o sin fecha clara.',
      },
    ],
    similarSearches: [
      { label: 'geles de ciclismo', href: '/marketplace?cat=Nutrici%C3%B3n&q=gel' },
      { label: 'barras de energía', href: '/marketplace?cat=Nutrici%C3%B3n&q=barra' },
      { label: 'isotónicas para ciclismo', href: '/marketplace?cat=Nutrici%C3%B3n&q=isot%C3%B3nica' },
    ],
  },

  Deals: {
    title: 'Ofertas y descuentos en bicicletas',
    intro:
      'La sección de ofertas reúne bicicletas y accesorios con precio promocional o baja reciente confirmada por el vendedor. Cada publicación indica el valor anterior para que puedas medir el descuento real y comparar con otros anuncios activos.',
    sections: [
      {
        heading: 'Cómo aprovechar las ofertas',
        paragraphs: [
          'Filtrá por categoría, rango de precio, tienda oficial o ubicación para detectar oportunidades cerca tuyo. Activá alertas: cuando un vendedor aplica otra rebaja, te avisamos por correo o notificación.',
        ],
        list: [
          'Compará el precio actual con el valor anterior marcado por el vendedor.',
          'Revisá la fecha de actualización del anuncio para evitar precios desactualizados.',
          'Sumá tus favoritos a la lista de seguimiento para no perder oportunidades.',
        ],
      },
      {
        heading: '¿Querés vender rápido?',
        paragraphs: [
          'Marcá el precio anterior, sumá un copy claro sobre el estado y los extras, y considerá un plan destacado para aparecer en portada. Las ofertas bien comunicadas atraen compradores atentos a las oportunidades.',
        ],
      },
    ],
    subcategories: [
      { label: 'Bicicletas en oferta', href: '/marketplace?deal=1&bikes=1' },
      { label: 'Accesorios en oferta', href: '/marketplace?deal=1&cat=Accesorios' },
    ],
    blogArticles: [blog],
    faqs: [
      {
        question: '¿Cómo sé que una oferta es real?',
        answer:
          'Compará con el precio de lista original y con otros anuncios del mismo modelo. El precio anterior marcado por el vendedor te da una referencia, pero el valor de mercado es el que manda.',
      },
      {
        question: '¿Recibo avisos cuando baja el precio?',
        answer:
          'Sí. Si guardás una publicación o una búsqueda, podés activar alertas para enterarte cuando un vendedor aplica una rebaja o ingresa un anuncio nuevo.',
      },
    ],
    similarSearches: [
      { label: 'ofertas de bicicletas', href: '/marketplace?deal=1&bikes=1' },
      { label: 'bicis en descuento', href: '/marketplace?deal=1' },
      { label: 'ofertas de ruta', href: '/marketplace?deal=1&cat=Ruta' },
      { label: 'ofertas de MTB', href: '/marketplace?deal=1&cat=MTB' },
    ],
  },
}
