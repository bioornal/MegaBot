import type { Metadata } from "next";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import { fetchMenuItems } from "@/lib/insforge-client";

const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-menu-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-menu-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Impasto — Menú",
  description:
    "Pizzas estilo napolitano y empanadas delivery. Ingredientes de primera calidad.",
  openGraph: {
    title: "Impasto — Menú",
    description:
      "Pizzas estilo napolitano y empanadas delivery. Ingredientes de primera calidad.",
    images: [],
  },
};

interface MenuItem {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
}

const CATEGORY_ORDER = [
  "pizzas",
  "empanadas",
  "calzones",
  "hamburguesas",
  "lomos",
  "otros",
];

const CATEGORY_NAMES: Record<string, string> = {
  pizzas: "Pizzas",
  empanadas: "Empanadas",
  calzones: "Calzones",
  hamburguesas: "Hamburguesas",
  lomos: "Lomos",
  otros: "Extras",
};

const CATEGORY_ICONS: Record<string, string> = {
  pizzas: "🍕",
  empanadas: "🥟",
  calzones: "🥐",
  hamburguesas: "🍔",
  lomos: "🥩",
  otros: "✨",
};

function groupByCategory(items: MenuItem[]): Map<string, MenuItem[]> {
  const groups = new Map<string, MenuItem[]>();
  for (const item of items) {
    const cat = (item.categoria || "otros").toLowerCase();
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  return groups;
}

export default async function MenuPage() {
  let items: MenuItem[] = [];

  try {
    items = await fetchMenuItems();
  } catch {
    items = [];
  }

  const groups = groupByCategory(items);
  const visibleCategories = CATEGORY_ORDER.filter(
    (cat) => groups.has(cat) && groups.get(cat)!.length > 0
  );

  return (
    <>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes line-extend {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes hero-enter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          33%  { transform: translateY(-6px) rotate(1deg); }
          66%  { transform: translateY(2px) rotate(-1deg); }
        }
        @keyframes grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -1%); }
          20% { transform: translate(1%, 2%); }
          30% { transform: translate(-1%, -2%); }
          40% { transform: translate(3%, 1%); }
          50% { transform: translate(-2%, 2%); }
          60% { transform: translate(2%, -1%); }
          70% { transform: translate(-1%, 1%); }
          80% { transform: translate(1%, -2%); }
          90% { transform: translate(-2%, -1%); }
        }

        .menu-page {
          position: fixed;
          inset: 0;
          overflow: auto;
          background: #faf6f0;
          color: #1a1612;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .menu-page::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 256px 256px;
          animation: grain 8s steps(1) infinite;
        }

        .menu-hero-line {
          height: 1px;
          background: #d4582a;
          transform-origin: center;
          animation: line-extend 1s cubic-bezier(0.22,1,0.36,1) forwards;
        }

        .menu-hero-title {
          opacity: 0;
          animation: hero-enter 0.8s 0.2s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .menu-hero-tagline {
          opacity: 0;
          animation: hero-enter 0.8s 0.35s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .menu-hero-badge {
          opacity: 0;
          animation: hero-enter 0.8s 0.5s cubic-bezier(0.22,1,0.36,1) forwards;
        }

        .menu-category-header {
          opacity: 0;
          animation: fade-up 0.5s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .menu-grid-item {
          opacity: 0;
          animation: fade-up 0.45s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .menu-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 10px 0;
          border-bottom: 1px solid #ede4d8;
        }
      `}</style>

      <div
        className={`menu-page ${serif.variable} ${dmSans.variable}`}
        style={{ fontFamily: "var(--font-menu-sans), system-ui, sans-serif" }}
      >
        {/* ── Hero ── */}
        <header
          style={{
            position: "relative",
            zIndex: 1,
            padding: "clamp(48px, 10vw, 100px) 24px clamp(24px, 5vw, 56px)",
            textAlign: "center",
          }}
        >
          {/* Decorative line above */}
          <div
            className="menu-hero-line"
            style={{ maxWidth: 120, margin: "0 auto 28px" }}
          />

          {/* Brand mark */}
          <div
            className="menu-hero-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#d4582a",
              color: "#faf6f0",
              marginBottom: 20,
              animation: "float 6s ease-in-out infinite",
            }}
            aria-hidden
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a4 4 0 0 1 4 4c0 4-4 8-4 8s-4-4-4-8a4 4 0 0 1 4-4z" />
              <path d="M4 20h16" />
              <path d="M8 16v4" />
              <path d="M16 16v4" />
              <circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" />
              <circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" />
              <path d="M8 9c0 0 1.5 2 4 2s4-2 4-2" />
            </svg>
          </div>

          {/* Brand name */}
          <h1
            className="menu-hero-title"
            style={{
              fontFamily: "var(--font-menu-serif), Georgia, serif",
              fontSize: "clamp(3.25rem, 10vw, 6rem)",
              fontWeight: 400,
              color: "#1a1612",
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              margin: 0,
            }}
          >
            Impasto
          </h1>

          {/* Tagline */}
          <p
            className="menu-hero-tagline"
            style={{
              fontSize: "clamp(0.75rem, 1.5vw, 0.85rem)",
              fontWeight: 500,
              color: "#8c7e6d",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              marginTop: 14,
            }}
          >
            Pizzas napolitanas &bull; Empanadas &bull; Delivery
          </p>

          {/* Decorative line below */}
          <div
            className="menu-hero-line"
            style={{ maxWidth: 80, margin: "28px auto 0" }}
          />

          {/* Status badge */}
          <div
            className="menu-hero-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 24,
              padding: "8px 18px",
              borderRadius: 999,
              background: "#1a1612",
              color: "#d4582a",
              fontSize: "0.8rem",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 6px rgba(34,197,94,0.5)",
              }}
            />
            Abierto Mar–Dom 19:00–01:00
          </div>
        </header>

        {/* ── Menu Grid ── */}
        <main
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 72px",
          }}
        >
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            visibleCategories.map((cat, catIndex) => {
              const catItems = groups.get(cat)!;
              return (
                <section key={cat} style={{ marginBottom: 48 }}>
                  {/* Category header */}
                  <div
                    className="menu-category-header"
                    style={{
                      animationDelay: `${0.15 + catIndex * 0.08}s`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 20,
                      paddingBottom: 12,
                      borderBottom: "1px solid #e8dfd2",
                    }}
                  >
                    <span style={{ fontSize: "1.3rem" }}>
                      {CATEGORY_ICONS[cat] || ""}
                    </span>
                    <h2
                      style={{
                        fontFamily: "var(--font-menu-serif), Georgia, serif",
                        fontSize: "1.35rem",
                        fontWeight: 400,
                        color: "#1a1612",
                        letterSpacing: "-0.01em",
                        margin: 0,
                      }}
                    >
                      {CATEGORY_NAMES[cat] || cat}
                    </h2>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        color: "#b8944a",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {catItems.length}
                    </span>
                  </div>

                  {/* Product grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(min(270px, 100%), 1fr))",
                      columnGap: 40,
                      rowGap: 0,
                    }}
                  >
                    {catItems.map((item, itemIndex) => (
                      <div
                        key={item.id}
                        className="menu-grid-item menu-row"
                        style={{
                          animationDelay: `${0.25 + catIndex * 0.08 + itemIndex * 0.04}s`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.92rem",
                            fontWeight: 500,
                            color: "#1a1612",
                            lineHeight: 1.4,
                            paddingRight: 8,
                          }}
                        >
                          {item.nombre}
                        </span>
                        <span
                          style={{
                            fontSize: "0.92rem",
                            fontWeight: 700,
                            color: "#d4582a",
                            whiteSpace: "nowrap",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ${item.precio.toLocaleString("es-AR")}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </main>

        {/* ── Footer ── */}
        <footer
          style={{
            position: "relative",
            zIndex: 1,
            borderTop: "1px solid #e8dfd2",
          }}
        >
          <div
            style={{
              maxWidth: 960,
              margin: "0 auto",
              padding: "36px 24px 48px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 28,
              fontSize: "0.82rem",
              color: "#8c7e6d",
              lineHeight: 1.8,
            }}
          >
            <div>
              <h3
                style={{
                  fontFamily: "var(--font-menu-serif), Georgia, serif",
                  fontSize: "0.95rem",
                  fontWeight: 400,
                  color: "#1a1612",
                  letterSpacing: "-0.01em",
                  marginBottom: 8,
                }}
              >
                Horarios
              </h3>
              <p>Mar a Dom · 19:00 a 01:00</p>
              <p>Lunes cerrado</p>
            </div>
            <div>
              <h3
                style={{
                  fontFamily: "var(--font-menu-serif), Georgia, serif",
                  fontSize: "0.95rem",
                  fontWeight: 400,
                  color: "#1a1612",
                  letterSpacing: "-0.01em",
                  marginBottom: 8,
                }}
              >
                Entrega
              </h3>
              <p>Delivery $5.000</p>
              <p>Retiro sin costo · Av. San Martin 1245</p>
            </div>
            <div>
              <h3
                style={{
                  fontFamily: "var(--font-menu-serif), Georgia, serif",
                  fontSize: "0.95rem",
                  fontWeight: 400,
                  color: "#1a1612",
                  letterSpacing: "-0.01em",
                  marginBottom: 8,
                }}
              >
                Pago
              </h3>
              <p>Transferencia · Efectivo al recibir</p>
            </div>
          </div>
          <div
            style={{
              textAlign: "center",
              padding: "16px 24px 32px",
              fontSize: "0.75rem",
              color: "#b8aa98",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Pedidos por WhatsApp &middot; Impasto {new Date().getFullYear()}
          </div>
        </footer>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "72px 24px",
        color: "#8c7e6d",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#ede4d8",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          fontSize: "1.5rem",
        }}
      >
        🍕
      </div>
      <p
        style={{
          fontFamily: "var(--font-menu-serif), Georgia, serif",
          fontSize: "1.25rem",
          color: "#1a1612",
          marginBottom: 8,
        }}
      >
        Menú no disponible
      </p>
      <p style={{ fontSize: "0.9rem" }}>
        Escribinos por WhatsApp y te pasamos los precios.
      </p>
    </div>
  );
}
