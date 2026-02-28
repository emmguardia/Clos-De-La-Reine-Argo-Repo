import { Link } from 'react-router-dom';

export default function CGVPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors duration-200 text-sm">
            ← Retour à l&apos;accueil
          </Link>
        </div>
        <h1 className="text-3xl font-light text-gray-900 mb-8">Conditions Générales de Vente</h1>
        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">1. Identification du vendeur</h2>
            <p>
              <strong>Le Clos de La Reine</strong><br />
              Auto-entrepreneur<br />
              1 Chemin de la Marnière, 77150 Lésigny<br />
              SIRET : 890 865 389 00021<br />
              closdelareine@gmail.com<br />
              06.28.46.26.44
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">2. Objet</h2>
            <p>
              Les présentes conditions générales régissent les ventes de produits proposés par Le Clos de La Reine, aussi bien en ligne (site internet, réseaux sociaux, plateformes e-commerce) qu&apos;en présentiel (boutiques éphémères, marchés, événements).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">3. Produits</h2>
            <p>
              Les caractéristiques essentielles des produits (laisses, colliers et harnais) sont présentées avec la plus grande exactitude possible. Les photos sont non contractuelles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">4. Prix</h2>
            <p>
              Le Vendeur est immatriculé en tant qu&apos;auto-entrepreneur et bénéficie du régime de la franchise en base de TVA conformément à l&apos;article 293 B du Code général des impôts.
            </p>
            <p>
              En conséquence, la TVA n&apos;est pas applicable aux ventes réalisées. Les prix indiqués sur le site sont exprimés en euros et correspondent à des montants nets, TVA non applicable – article 293 B du CGI.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Les prix sont indiqués en euros, toutes taxes comprises (TTC).</li>
              <li>Ils ne comprennent pas les frais de livraison pour les ventes en ligne, qui sont précisés avant validation de la commande.</li>
              <li>Le Clos de La Reine se réserve le droit de modifier ses prix à tout moment, mais les produits sont facturés sur la base du tarif en vigueur au moment de la commande.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">5. Commande & Paiement</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>En ligne :</strong> La commande est validée après paiement intégral par carte bancaire, PayPal, ou tout autre moyen de paiement proposé sur la boutique.</li>
              <li><strong>En présentiel :</strong> Le paiement est dû immédiatement lors de l&apos;achat. Les moyens de paiement acceptés sont (espèces / carte / autres).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">6. Livraison (vente en ligne)</h2>
            <p>
              Les produits sont expédiés à l&apos;adresse indiquée par le client lors de la commande.<br />
              Délais moyens : 10 jours ouvrés pour la France.<br />
              En cas de retard ou perte imputable au transporteur, la responsabilité du Clos de La Reine ne saurait être engagée.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">7. Droit de rétractation (vente en ligne uniquement)</h2>
            <p>
              Conformément à la législation, le client dispose d&apos;un délai de 14 jours à compter de la réception du produit pour exercer son droit de rétractation, sans avoir à motiver sa décision.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Le produit doit être retourné en parfait état, non utilisé, dans son emballage d&apos;origine.</li>
              <li>Les frais de retour sont à la charge du client, sauf erreur de notre part.</li>
              <li>Le remboursement sera effectué dans un délai de 14 jours après réception du retour.</li>
            </ul>
            <p className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <strong>⚠️ Pour les ventes en présentiel</strong> (marchés, boutiques, etc.), le droit de rétractation ne s&apos;applique pas. Toutefois, Le Clos de La Reine pourra proposer un échange ou un avoir à titre commercial, selon les conditions définies sur place.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">8. Retours & Échanges</h2>
            <p>
              Aucun retour ne sera accepté au-delà du délai légal ou des conditions particulières annoncées. Les produits personnalisés ou réalisés sur mesure ne sont ni repris ni échangés.
            </p>
            <p>
              Conformément à l&apos;article L221-28 du Code de la consommation, le droit de rétractation ne peut être exercé pour les produits confectionnés selon les spécifications du Client ou nettement personnalisés.
            </p>
            <p>
              En conséquence, les articles réalisés sur mesure, personnalisés ou confectionnés à la demande du Client ne peuvent en aucun cas être repris, échangés ou remboursés, sauf en cas de défaut avéré ou de non-conformité.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">9. Responsabilité</h2>
            <p>
              Le Clos de La Reine ne saurait être tenue responsable des dommages résultant d&apos;une mauvaise utilisation des produits.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">10. Propriété intellectuelle</h2>
            <p>
              Tous les éléments visuels, textes, photos, logos, créations et designs proposés par Le Clos de La Reine sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou utilisation non autorisée est interdite.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">11. Données personnelles</h2>
            <p>
              Les informations collectées lors des commandes sont utilisées uniquement pour leur traitement et la relation commerciale. Elles ne sont jamais transmises à des tiers sans accord préalable du client.
            </p>
            <p>
              Conformément à la réglementation, le client dispose d&apos;un droit d&apos;accès, de modification et de suppression de ses données en contactant closdelareine@gmail.com.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-4">12. Droit applicable et litiges</h2>
            <p>
              Les présentes CGV sont régies par le droit français. En cas de litige, une solution amiable sera recherchée. À défaut, les tribunaux compétents seront ceux du ressort de Melun.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
