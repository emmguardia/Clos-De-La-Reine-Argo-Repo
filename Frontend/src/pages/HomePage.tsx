import { Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { trackEvent } from '../utils/analytics';
import { useFeaturedProducts } from '../hooks/useFeaturedProducts';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import type { Product } from '../data/products';
import SEO from '../components/SEO';

// Bannière : la collection du moment. Pour changer les photos, remplacer les
// fichiers dans Public/Images/accueil (même nom) ou modifier cette liste.
// L'ordre des slides = l'ordre de cette liste. Une même photo sert sur
// ordinateur et téléphone ; `position` règle le cadrage (object-position).
const heroCollection = {
  name: 'Héritage',
  link: `/boutique?collection=${encodeURIComponent('Héritage')}`,
  slides: [
    { image: '/Images/accueil/shooting-cocker-laisse-voiture.webp', position: 'center 30%', alt: 'Cocker en laisse pied-de-poule dans une voiture ancienne' },
    { image: '/Images/accueil/shooting-cockers-harnais-porte.webp', position: 'center 25%', alt: 'Deux cockers en harnais pied-de-poule devant une porte en bois' },
    { image: '/Images/accueil/shooting-joanne-voiture-chiot.webp', position: 'center 40%', alt: 'Joanne et un chiot cocker noir sur la banquette d’une voiture ancienne' },
  ],
};

// Les 2 produits les plus aimés : chaque tuile fait défiler ses photos.
const favorites = [
  {
    name: 'Tartan bleu',
    collection: 'Back to School',
    link: `/boutique?collection=${encodeURIComponent('Back to School')}&couleur=Bleu`,
    images: [1, 2, 3, 4].map((i) => `/Images/accueil/tartan-bleu-${i}.webp`),
  },
  {
    name: 'Toile de Jouy bleu',
    collection: 'Noblesse',
    link: `/boutique?collection=Noblesse&couleur=Bleu`,
    images: [1, 2, 3, 4].map((i) => `/Images/accueil/toile-de-jouy-bleu-${i}.webp`),
  },
];

const categories = [
  { label: 'Colliers', value: 'colliers', image: '/Images/accueil/colliers.webp' },
  { label: 'Laisses', value: 'laisses', image: '/Images/accueil/laisses.webp' },
  { label: 'Harnais', value: 'harnais', image: '/Images/accueil/harnais.webp' },
];

const HERO_DELAY_MS = 5000;

function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = heroCollection.slides.length;
  const go = useCallback((i: number) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => go(index + 1), HERO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, go]);

  return (
    <section
      className="relative h-[72svh] min-h-[480px] md:h-[100svh] md:max-h-[1000px] w-full overflow-hidden bg-[#e9e2d8]"
      aria-roledescription="carrousel"
      aria-label={`Nouvelle collection ${heroCollection.name}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchStartX.current = null;
      }}
    >
      {heroCollection.slides.map((slide, i) => (
        <div
          key={slide.image}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-1000 ${i === index ? 'opacity-100' : 'opacity-0'}`}
        >
          {/* Téléphone : photo entière (pas recadrée), le vide autour est
              rempli par la même photo floutée. Ordinateur : plein cadre. */}
          <img
            src={slide.image}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75 md:hidden"
            loading={i === 0 ? 'eager' : 'lazy'}
          />
          <img
            src={slide.image}
            alt={slide.alt}
            className="relative h-full w-full object-contain md:object-cover"
            style={{ objectPosition: slide.position }}
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : 'auto'}
          />
        </div>
      ))}
      {/* Dégradés : lisibilité du menu en haut et du titre en bas */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/35 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

      <button
        type="button"
        onClick={() => go(index - 1)}
        className="absolute left-4 top-1/2 -translate-y-1/2 hidden md:flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-xl text-gray-900 hover:bg-white transition-colors"
        aria-label="Photo précédente"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-xl text-gray-900 hover:bg-white transition-colors"
        aria-label="Photo suivante"
      >
        ›
      </button>

      <div className="absolute inset-x-0 bottom-0 px-5 pb-8 sm:px-12 sm:pb-14 text-white">
        <h1 className="sr-only">Le Clos de la Reine — colliers, laisses et harnais pour chien faits main en France</h1>
        <p className="text-xs uppercase tracking-[0.35em] text-white/85">Nouvelle collection</p>
        <p className="mt-2 text-5xl sm:text-7xl font-light" style={{ fontFamily: 'Playfair Display, serif' }}>
          {heroCollection.name}
        </p>
        <Link
          to={heroCollection.link}
          className="mt-4 inline-block border-b border-white/80 pb-1 text-sm hover:border-white transition-colors"
          onClick={() => trackEvent('hero_cta_click', { cta: 'decouvrir_collection', source: 'home' })}
        >
          Découvrir la collection
        </Link>
        <div className="mt-6 flex items-center gap-2">
          {heroCollection.slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/55'}`}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FavoriteTile({ item }: { item: typeof favorites[number] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <article>
      <div className="relative aspect-[4/5] overflow-hidden bg-[#e9e2d8]">
        {/* Défilement natif au doigt (scroll-snap), points cliquables sur ordinateur */}
        <div
          ref={trackRef}
          className="flex h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {item.images.map((src, i) => (
            <Link
              key={src}
              to={item.link}
              className="h-full w-full shrink-0 snap-start"
              onClick={() => trackEvent('home_favorite_click', { product: item.name, collection: item.collection })}
            >
              <img
                src={src}
                alt={`${item.name} — collection ${item.collection}, photo ${i + 1}`}
                loading="lazy"
                draggable={false}
                className="h-full w-full object-cover"
              />
            </Link>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
          {item.images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
              aria-label={`${item.name}, photo ${i + 1}`}
            />
          ))}
        </div>
      </div>
      <Link to={item.link} className="block pt-2 text-center">
        <p className="text-xs sm:text-sm text-gray-900">{item.name}</p>
        <p className="text-[11px] sm:text-xs text-gray-500">{item.collection} · dès 27 €</p>
      </Link>
    </article>
  );
}

export default function HomePage() {
  const { products: newProducts, loading } = useFeaturedProducts(4);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <>
      <SEO
        title="Clos de la Reine"
        description="Accessoires artisanaux pour chiens — colliers, laisses et harnais faits à la main avec des matières de qualité, pour les chiens qui ont du style."
        path="/"
        ogImage="/Images/header2.webp"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Le Clos de la Reine",
          "description": "Accessoires artisanaux pour chiens — colliers, laisses et harnais en cuir végétal, finitions sellier, production atelier française.",
          "url": "https://leclosdelareine.com",
          "logo": "https://leclosdelareine.com/Images/Logo.webp",
          "image": "https://leclosdelareine.com/Images/header.webp",
          "email": "closdelareine@gmail.com",
          "telephone": "+33628462644",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "1 Chemin de la Marnière",
            "addressLocality": "Lésigny",
            "postalCode": "77150",
            "addressCountry": "FR"
          },
          "priceRange": "€€",
          "currenciesAccepted": "EUR",
          "paymentAccepted": "Credit Card",
          "openingHours": "Mo-Su 00:00-23:59",
          "sameAs": []
        }}
      />
      <HeroCarousel />

      <section className="bg-[var(--cream)] pt-10 pb-4 sm:pt-14">
        <p className="text-center uppercase tracking-[0.3em] text-[11px] text-gray-500">Les plus aimés</p>
        <div className="mx-auto mt-5 grid max-w-[340px] grid-cols-2 gap-3 px-0 sm:max-w-[640px] sm:gap-4">
          {favorites.map((item) => <FavoriteTile key={item.name} item={item} />)}
        </div>

        <nav aria-label="Catégories" className="mx-auto mt-10 grid max-w-[340px] grid-cols-3 gap-4 sm:max-w-[460px]">
          {categories.map((c) => (
            <Link
              key={c.value}
              to={`/boutique?category=${c.value}`}
              className="group flex flex-col items-center gap-2"
              onClick={() => trackEvent('home_category_click', { category: c.value })}
            >
              <span className="block aspect-square w-full overflow-hidden rounded-full bg-[#e9e2d8] ring-1 ring-black/5">
                <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </span>
              <span className="text-xs sm:text-sm text-gray-900">{c.label}</span>
            </Link>
          ))}
        </nav>
      </section>

      <section id="nouveautes" className="bg-[var(--cream)] py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-4xl font-light text-gray-900">Toute la boutique</h2>
            <Link
              to="/boutique"
              className="text-sm text-gray-700 underline underline-offset-4 hover:text-gray-900"
              onClick={() => trackEvent('home_section_click', { section: 'boutique', action: 'voir_tout' })}
            >
              Voir tout
            </Link>
          </header>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {loading ? (
              <div className="col-span-2 lg:col-span-4 text-center py-8 text-gray-500">Chargement...</div>
            ) : newProducts.length > 0 ? (
              newProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  showCollection
                  onProductClick={(product) => {
                    setSelectedProduct(product);
                    setIsModalOpen(true);
                  }}
                />
              ))
            ) : (
              <div className="col-span-2 lg:col-span-4 text-center py-8 text-gray-500">Aucun produit disponible</div>
            )}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-[var(--cream)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <article className="space-y-4">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">Maison</p>
            <h2 className="text-3xl font-light text-gray-900">Le Clos de la Reine</h2>
            <p className="text-gray-600 leading-relaxed">
            Une maison française qui imagine colliers, laisses et harnais au
            croisement de l'élégance et de la fonctionnalité.
            Matières douces, finitions soignées, palette crème, rose poudré et
             vert clair pour sublimer vos compagnons et votre intérieur.
            </p>
            <ul className="flex flex-wrap gap-3 text-sm text-gray-700 list-none">
              <li className="px-4 py-2 rounded-full bg-white">Détails soignés</li>
              <li className="px-4 py-2 rounded-full bg-[#e5f2eb]">Tissus élégants</li>
              <li className="px-4 py-2 rounded-full bg-[#f2dedd]">Production atelier</li>
            </ul>
          </article>
          <figure className="overflow-hidden rounded-[28px] shadow-xl shadow-black/10">
            <img
              src="/Images/Profile1.webp"
              alt="Univers Le Clos de la Reine"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      <section className="py-12 sm:py-16 bg-[var(--cream)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <div className="overflow-hidden rounded-[28px] shadow-xl shadow-black/10 order-2 md:order-1">
            <img
              src="/Images/Profile2.webp"
              alt="Joanne, fondatrice"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="space-y-4 order-1 md:order-2">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">Fondatrice</p>
            <h2 className="text-3xl font-light text-gray-900">Joanne — œil couture, esprit atelier</h2>
            <p className="text-gray-600 leading-relaxed">
              Cavalière, maman et sensible à la beauté dans ses moindres détails, Joanne imagine des lignes raffinées, dédiées à l'élégance canine, portées par l'exigence et la sincérité.
              Chaque pièce est conçue en série limitée, avec des matières sélectionnées avec soin, des finitions précises et une attention constante portée au confort comme à l'émotion.
              Le Clos de la Reine privilégie une production mesurée, guidée par l'écoute et les retours, afin de proposer des créations justes, durables et intemporelles.
            </p>
            <div className="flex flex-col gap-2 text-sm text-gray-700">
              <span>• Sélection de matières responsables</span>
              <span>• Production raisonnée, ajustée avec précision</span>
              <span>• Collections pensées pour durer</span>
            </div>
            <div className="pt-6 mt-6 border-t border-gray-200/60">
              <p className="text-gray-600 leading-relaxed">
              Vendôme est arrivé dans ma vie au moment où j'en avais profondément besoin : il est devenu à la fois mon moteur et mon pilier. Au-delà de sa beauté évidente, il est d'une douceur infinie, drôle, lumineux au quotidien, et il m'accompagne chaque jour dans la création et l'élaboration des produits que propose Le Clos de la Reine.
                Vendôme a vu le jour à l’élevage du {' '}
                <a
                  href="https://dudomainedesrevesbleus.chiens-de-france.com/cocker-spaniel-anglais"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-gray-900 font-medium underline underline-offset-2 hover:text-gray-700 transition-colors"
                >
                  domaine des rêves bleus
                  <span className="text-xs">↗</span>
                </a>
                .
              </p>
              <a
                href="https://dudomainedesrevesbleus.chiens-de-france.com/cocker-spaniel-anglais"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-800 hover:border-gray-900 hover:bg-white transition-colors"
              >
                Voir le site de l'élevage
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Texte de référencement en bas de page, comme les grandes boutiques en ligne */}
      <section className="bg-white py-12 sm:py-14">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-3 text-sm text-gray-600 leading-relaxed">
          <h2 className="text-xl sm:text-2xl font-light text-gray-900">Colliers, laisses et harnais pour chien, faits main en France</h2>
          <p>
            Le Clos de la Reine crée des <strong className="font-medium text-gray-800">colliers pour chien</strong>, des{' '}
            <strong className="font-medium text-gray-800">laisses</strong> et des <strong className="font-medium text-gray-800">harnais</strong> en tissu,
            cousus à la main en petites séries. Tartan, vichy, velours, toile de Jouy ou motif marin : chaque collection se décline
            en collier, laisse et harnais assortis, pour les petits comme pour les grands chiens.
          </p>
          <p>
            Les colliers et harnais existent du XS au XL, les laisses en 1 m et 1,20 m, avec des finitions dorées et des matières
            douces pour le confort de votre compagnon. Livraison partout en France, paiement sécurisé.
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            <Link to="/boutique?category=colliers" className="text-gray-900 underline underline-offset-4">Colliers pour chien</Link>
            <Link to="/boutique?category=laisses" className="text-gray-900 underline underline-offset-4">Laisses pour chien</Link>
            <Link to="/boutique?category=harnais" className="text-gray-900 underline underline-offset-4">Harnais pour chien</Link>
            <Link to="/faq" className="text-gray-900 underline underline-offset-4">Questions fréquentes</Link>
          </p>
        </div>
      </section>

      <ProductModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
