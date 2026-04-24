import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description?: string;
  path?: string;
  ogImage?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const SITE_NAME = 'Clos de la Reine';
const BASE_URL = 'https://closdelareine.com';
const DEFAULT_DESCRIPTION = 'Accessoires artisanaux pour chiens — colliers, laisses et harnais faits à la main avec des matières de qualité, pour les chiens qui ont du style.';
const DEFAULT_OG_IMAGE = `${BASE_URL}/Images/header2.webp`;

export default function SEO({ title, description, path, ogImage, noindex, jsonLd }: SEOProps) {
  const fullTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
  const metaDesc = description || DEFAULT_DESCRIPTION;
  const canonicalUrl = path ? `${BASE_URL}${path}` : undefined;
  const ogImageUrl = ogImage ? `${BASE_URL}${ogImage}` : DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDesc} />
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDesc} />
      <meta property="og:image" content={ogImageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDesc} />
      <meta name="twitter:image" content={ogImageUrl} />

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
