import { Link } from 'react-router-dom';
import { useState } from 'react';
import { trackEvent } from '../utils/analytics';
import { useFeaturedProducts } from '../hooks/useFeaturedProducts';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import type { ProductCategory, Product } from '../data/products';
const heroImage = '/Images/header.webp';
interface FeaturedProduct {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  badge: string;
  image: string;
  tone: string;
  to: string;
  category: ProductCategory;
  collection: string;
}
const featuredProducts: FeaturedProduct[] = [
  {
    id: '1',
    title: 'Collier tartan beige',
    subtitle: 'Collier et laisse assortis, bleu profond',
    price: '27€',
    badge: 'Collier phare',
    image: '/Images/Back_to_school_1.webp',
    tone: 'from-[#f2dedd]/90 via-white to-[#e5f2eb]/60',
    to: '/boutique?category=colliers',
    category: 'colliers',
    collection: 'Back to School',
  },
  {
    id: '2',
    title: 'Laisse tartan beige',
    subtitle: 'Tressage atelier, mousqueton inox, teinte moka',
    price: '37€',
    badge: 'Laisse phare',
    image: '/Images/Collier_BTS1.webp',
    tone: 'from-[#e5f2eb]/90 via-white to-[#f8f4ef]/60',
    to: '/boutique?category=laisses',
    category: 'laisses',
    collection: 'Back to School',
  },
  {
    id: '3 ',
    title: 'Harnais tartan beige',
    subtitle: 'Mesh respirant, sangles sable, ergonomie douce',
    price: '47€',
    badge: 'Harnais phare',
    image: '/Images/Back_to_school_3.webp',
    tone: 'from-[#f8f4ef]/90 via-white to-[#f2dedd]/60',
    to: '/boutique?category=harnais',
    category: 'harnais',
    collection: 'Back to School',
  },
];
export default function HomePage() {
  const { products: newProducts, loading } = useFeaturedProducts(4);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-gray-50 to-gray-100">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={heroImage}
            alt="Sélection premium pour vos compagnons"
            className="h-full w-full object-cover"
            style={{ objectPosition: 'center 60%' }}
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/75 to-white/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-3xl space-y-8">
            <p className="uppercase tracking-[0.35em] text-xs text-gray-500 animate-fadeIn">
              Maison d'élégance canine
            </p>
            <h1 className="text-4xl sm:text-6xl font-light text-gray-900 leading-tight animate-fadeIn">
              Le raffinement pour compagnons d'exception.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl animate-fadeIn-delay-1">
              Une sélection exigeante alliant noblesse des matières et confort, dédiée à l'élégance de vos précieux animaux.
            </p>
            <div className="flex flex-wrap items-center gap-4 animate-fadeIn-delay-2">
              <a
                href="#pieces-phares"
                className="bg-gray-900 text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-gray-900/10"
                onClick={() => trackEvent('hero_cta_click', { cta: 'decouvrir_collection', source: 'home' })}
              >
                Découvrir la collection
              </a>
              <a
                href="#nouveautes"
                className="px-8 py-3 rounded-full border border-gray-300 text-gray-900 hover:border-gray-600 hover:text-gray-900 transition-all duration-300"
                onClick={() => trackEvent('hero_cta_click', { cta: 'nouveautes', source: 'home' })}
              >
                Nouveautés
              </a>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500 animate-fadeIn-delay-3">
              <div className="flex items-center gap-2">
                <span className="block h-px w-10 bg-gray-400" />
                Passions & Esthétisme
              </div>
              <div className="flex items-center gap-2">
                <span className="block h-px w-10 bg-gray-400" />
                Exigence & Réflexion
              </div>
              <div className="flex items-center gap-2">
                <span className="block h-px w-10 bg-gray-400" />
                Authentique & Unique
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="pieces-phares" className="bg-white py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <div>
              <p className="uppercase tracking-[0.3em] text-xs text-gray-500">Sélection</p>
              <h2 className="text-3xl sm:text-4xl font-light text-gray-900 mt-2">
                Pièces phares
              </h2>
              <p className="text-gray-900 mt-3 max-w-xl">
                Découvrez notre dernière collection Back to School.
              </p>
            </div>
            <Link
              to="/boutique"
              className="self-start sm:self-auto px-5 py-2 rounded-full border border-gray-300 text-sm text-gray-800 hover:border-gray-900 transition-colors"
              onClick={() => trackEvent('home_section_click', { section: 'pieces_phares', action: 'voir_tout' })}
            >
              Voir tout
            </Link>
          </header>
          <div className="grid gap-6 lg:grid-cols-2">
            {featuredProducts.map((product, index) => (
              <article
                key={product.id}
                className={`relative overflow-hidden rounded-[32px] group shadow-xl shadow-gray-200/60 isolate ${
                  index === 0 ? 'lg:row-span-2 min-h-[420px]' : 'min-h-[320px]'
                }`}
              >
                <div className="absolute inset-0">
                  <img
                    src={product.image}
                    loading="lazy"
                    alt={product.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${product.tone} opacity-60`}
                  />
                </div>
                <div className="relative h-full flex flex-col justify-between p-8 sm:p-10">
                  <div className="flex items-center gap-3">
                    <span className="px-4 py-1 rounded-full bg-white/80 backdrop-blur-md text-xs uppercase tracking-[0.2em] text-gray-900 shadow-lg">
                      {product.badge}
                    </span>
                    <span className="h-px w-10 bg-gray-900/70" />
                    <span className="text-sm text-gray-900 font-medium drop-shadow-lg">{product.collection}</span>
                  </div>
                  <div className={`space-y-4 max-w-md ${index === 0 ? '' : 'space-y-2'}`}>
                    <h3 className={`font-light leading-tight text-gray-900 drop-shadow-2xl ${index === 0 ? 'text-3xl' : 'text-xl'}`}>
                      {product.title}
                    </h3>
                    <p className={`text-gray-900 font-medium drop-shadow-lg ${index === 0 ? 'text-sm sm:text-base' : 'text-xs'}`}>{product.subtitle}</p>
                    <div className="flex items-center gap-4">
                      <span className={`font-light text-gray-900 drop-shadow-lg ${index === 0 ? 'text-2xl' : 'text-lg'}`}>{product.price}</span>
                      <Link
                        to={product.to}
                        className={`rounded-full bg-gray-900 text-white font-medium hover:bg-gray-800 transition-all duration-200 shadow-lg ${index === 0 ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'}`}
                        onClick={() => trackEvent('home_featured_click', { product: product.title, category: product.category })}
                      >
                        Découvrir
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section id="nouveautes" className="bg-gradient-to-b from-white to-[#f8f4ef] py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
            <div>
              <p className="uppercase tracking-[0.3em] text-xs text-gray-500">Nouveautés</p>
              <h2 className="text-3xl sm:text-4xl font-light text-gray-900 mt-2">
                Dernières arrivées
              </h2>
              <p className="text-gray-500 mt-3 max-w-xl">
                Découvrez nos dernières créations et collections saisonnières.
              </p>
            </div>
            <Link
              to="/boutique"
              className="self-start sm:self-auto px-5 py-2 rounded-full border border-gray-300 text-sm text-gray-800 hover:border-gray-900 transition-colors"
              onClick={() => trackEvent('home_section_click', { section: 'nouveautes', action: 'voir_tout' })}
            >
              Voir tout
            </Link>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {loading ? (
              <div className="col-span-4 text-center py-8 text-gray-500">Chargement...</div>
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
              <div className="col-span-4 text-center py-8 text-gray-500">Aucun produit disponible</div>
            )}
          </div>
        </div>
      </section>
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-10 items-center">
          <article className="space-y-4">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">Maison</p>
            <h2 className="text-3xl font-light text-gray-900">Le Clos de la Reine</h2>
            <p className="text-gray-600 leading-relaxed">
            Une maison française qui imagine colliers, laisses et harnais au 
            croisement de l'élégance et de la fonctionnalité. 
            Matières douces, finitions soignées, palette crème, rose poudré et
             vert clair pour sublimer vos compagnons et votre intérieur.
            </p>
            <ul className="flex gap-4 text-sm text-gray-700 list-none">
              <li className="px-4 py-2 rounded-full bg-[#f8f4ef]">Finitions sellier</li>
              <li className="px-4 py-2 rounded-full bg-[#e5f2eb]">Cuirs végétaux</li>
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
      <section className="py-16 bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-10 items-center">
          <div className="overflow-hidden rounded-[28px] shadow-xl shadow-black/10 order-2 md:order-1 transition duration-300 ease-in-out hover:scale-[1.02]">
            <img
              src="/Images/Profile2.webp"
              alt="Joanne, fondatrice"
              className="w-full h-full object-cover transition-transform duration-300 ease-in-out hover:scale-[1.02]"
              loading="lazy"
            />
          </div>
          <div className="space-y-4 order-1 md:order-2">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">Fondatrice</p>
            <h2 className="text-3xl font-light text-gray-900">Joanne — œil couture, esprit atelier</h2>
            <p className="text-gray-600 leading-relaxed">
              Cavalière, maman et sensible à la beauté dans ses moindres détails, Joanne imagine des lignes raffinées dédiées à l'élégance canine, portées par l'exigence et la sincérité.
              Chaque pièce est conçue en série limitée, avec des matières sélectionnées avec soin, des finitions précises et une attention constante au confort comme à l'émotion.
              Le Clos de la Reine privilégie une production mesurée, guidée par l'écoute et les retours, afin de proposer des créations justes, durables et intemporelles.
            </p>
            <div className="flex flex-col gap-2 text-sm text-gray-700">
              <span>• Sélection de matières responsables</span>
              <span>• Production raisonnée, ajustée avec précision</span>
              <span>• Collections pensées pour durer</span>
            </div>
            <div className="pt-6 mt-6 border-t border-gray-200/60">
              <p className="text-gray-600 leading-relaxed">
                Vendôme est entré dans ma vie à un moment où j'en avais profondément besoin : il est devenu à la fois mon moteur et mon pilier. Au-delà de sa beauté évidente, il est d'une douceur infinie, drôle, lumineux au quotidien, et il m'accompagne chaque jour dans la création et l'élaboration des produits que propose Le Clos de la Reine.
                Il vient de l'élevage du{' '}
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
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-800 hover:border-gray-900 hover:bg-gray-50 transition-colors"
              >
                Voir le site de l'élevage
              </a>
            </div>
          </div>
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

