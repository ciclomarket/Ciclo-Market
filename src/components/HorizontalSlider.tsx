import { useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string;
};

type Tone = "light" | "dark";

type Props = {
  title: string;
  subtitle?: string;
  items: Item[];
  renderCard: (item: any, index?: number) => React.ReactNode;
  maxItems?: number;     // default 20
  initialLoad?: number;  // default 8
  tone?: Tone;
};

export default function HorizontalSlider({
  title,
  subtitle,
  items,
  renderCard,
  maxItems = 20,
  initialLoad = 8,
  tone = "light",
}: Props) {
  const maxToShow = Math.min(maxItems, items?.length || 0);
  const [count, setCount] = useState(Math.min(initialLoad, maxToShow));
  const viewportRef = useRef<HTMLDivElement>(null);
  const titleClass = tone === "dark" ? "text-white" : "text-[#14212e]";
  const subtitleClass = tone === "dark" ? "text-white/70" : "text-[#14212e]/70";
  const arrowClass =
    tone === "dark"
      ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
      : "border-white/30 bg-[#14212e] text-white hover:bg-[#1b2f3f]";

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
        <div className="mb-6">
          <h2 className={`text-2xl font-extrabold tracking-tight ${titleClass}`}>{title}</h2>
          {subtitle && <p className={`mt-1 text-sm ${subtitleClass}`}>{subtitle}</p>}
          <div className="mt-2 h-px max-w-[160px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
        <div className={`text-sm ${subtitleClass}`}>No hay elementos.</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-6">
        <h2 className={`text-2xl font-extrabold tracking-tight ${titleClass}`}>{title}</h2>
        {subtitle && <p className={`mt-1 text-sm ${subtitleClass}`}>{subtitle}</p>}
        <div className="mt-2 h-px max-w-[160px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
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
          {visibleItems.map((it: any, idx: number) => (
            <div key={it.id} className="shrink-0 w-[75%] sm:w-[50%] lg:w-[25%] snap-start">
              {renderCard(it, idx)}
            </div>
          ))}
        </div>
      </div>

      {/* flechas (ocultas en móvil) */}
      <button
        aria-label="Anterior"
        onClick={() => scrollByCards(-1)}
        className={`absolute left-4 top-1/2 z-10 hidden size-10 -translate-y-1/2 grid place-content-center rounded-full border shadow-lg transition md:flex ${arrowClass}`}
      >
        ‹
      </button>
      <button
        aria-label="Siguiente"
        onClick={() => scrollByCards(1)}
        className={`absolute right-4 top-1/2 z-10 hidden size-10 -translate-y-1/2 grid place-content-center rounded-full border shadow-lg transition md:flex ${arrowClass}`}
      >
        ›
      </button>
    </div>
  );
}
