import { useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string;
};

type Props = {
  title: string;
  subtitle?: string;
  items: Item[];
  renderCard: (item: any) => React.ReactNode;
  maxItems?: number;     // default 20
  initialLoad?: number;  // default 8
};

export default function HorizontalSlider({
  title,
  subtitle,
  items,
  renderCard,
  maxItems = 20,
  initialLoad = 8,
}: Props) {
  const maxToShow = Math.min(maxItems, items?.length || 0);
  const [count, setCount] = useState(Math.min(initialLoad, maxToShow));
  const viewportRef = useRef<HTMLDivElement>(null);

  const visibleItems = useMemo(
    () => (items || []).slice(0, count),
    [items, count]
  );

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 400;
    if (nearEnd && count < maxToShow) {
      setCount((c) => Math.min(c + 4, maxToShow));
    }
  };

  const scrollByCards = (dir: 1 | -1) => {
    const el = viewportRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.9 * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });

    // faux loop cuando ya cargamos todos
    window.setTimeout(() => {
      const end = el.scrollWidth - el.clientWidth - 4;
      const atEnd = el.scrollLeft >= end;
      const atStart = el.scrollLeft <= 4;
      if (count === maxToShow) {
        if (dir === 1 && atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
        if (dir === -1 && atStart) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      }
    }, 350);
  };

  // teclado ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") scrollByCards(1);
      if (e.key === "ArrowLeft") scrollByCards(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, maxToShow]);

  // si no hay items, no renderizo nada raro
  if (!items || items.length === 0) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#14212e]">{title}</h2>
          {subtitle && <span className="text-sm text-[#14212e]/70">{subtitle}</span>}
        </div>
        <div className="text-sm text-[#14212e]/70">No hay elementos.</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#14212e]">{title}</h2>
        {subtitle && <span className="text-sm text-[#14212e]/70">{subtitle}</span>}
      </div>

      {/* viewport */}
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
        role="region"
        aria-label={title}
      >
        <div className="flex gap-5 pr-4">
          {visibleItems.map((it: any) => (
            <div key={it.id} className="shrink-0 w-[75%] sm:w-[50%] lg:w-[25%] snap-start">
              {renderCard(it)}
            </div>
          ))}
        </div>
      </div>

      {/* flechas (ocultas en móvil) */}
      <button
        aria-label="Anterior"
        onClick={() => scrollByCards(-1)}
        className="absolute left-4 top-1/2 z-10 hidden size-10 -translate-y-1/2 grid place-content-center rounded-full border border-white/30 bg-[#14212e] text-white shadow-lg transition hover:bg-[#1b2f3f] md:flex"
      >
        ‹
      </button>
      <button
        aria-label="Siguiente"
        onClick={() => scrollByCards(1)}
        className="absolute right-4 top-1/2 z-10 hidden size-10 -translate-y-1/2 grid place-content-center rounded-full border border-white/30 bg-[#14212e] text-white shadow-lg transition hover:bg-[#1b2f3f] md:flex"
      >
        ›
      </button>
    </div>
  );
}
