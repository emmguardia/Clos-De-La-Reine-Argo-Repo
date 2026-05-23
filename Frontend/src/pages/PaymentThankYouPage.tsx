import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Package, CheckCircle, CreditCard, Truck, Mail, Box, Calendar, ArrowLeft } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

export default function PaymentThankYouPage() {
  const navigate = useNavigate();
  const { orderId } = useParams();

  useEffect(() => {
    if (orderId) trackEvent('payment_thankyou_view', { order_id: orderId });
  }, [orderId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/profil?tab=commandes')}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voir mes commandes
        </button>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-light text-gray-900 mb-4">Merci pour votre paiement</h1>
          <p className="text-lg text-gray-600">
            Votre commande a bien été enregistrée. Un email de confirmation vous a été envoyé.
          </p>
        </div>

        <div className="mb-12 bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 border border-black/5">
          <h2 className="text-xl font-light text-gray-900 mb-6 text-center">Où en est votre commande ?</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="text-center opacity-60">
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mx-auto mb-2 md:mb-4">
                <Package className="w-6 h-6 md:w-7 md:h-7 text-yellow-700" />
              </div>
              <h3 className="text-sm font-medium text-gray-900">1. Bon de commande</h3>
            </div>
            <div className="text-center opacity-60">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mx-auto mb-2 md:mb-4">
                <CheckCircle className="w-6 h-6 md:w-7 md:h-7 text-blue-700" />
              </div>
              <h3 className="text-sm font-medium text-gray-900">2. Validation</h3>
            </div>
            <div className="text-center opacity-60">
              <div className="bg-purple-50 border-2 border-purple-200 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mx-auto mb-2 md:mb-4">
                <CreditCard className="w-6 h-6 md:w-7 md:h-7 text-purple-700" />
              </div>
              <h3 className="text-sm font-medium text-gray-900">3. Paiement</h3>
            </div>
            <div className="text-center">
              <div className="bg-green-50 border-2 border-green-300 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mx-auto mb-2 md:mb-4 ring-2 ring-green-400/50">
                <Truck className="w-6 h-6 md:w-7 md:h-7 text-green-700" />
              </div>
              <h3 className="text-sm font-medium text-gray-900">4. Fabrication & Envoi</h3>
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 border border-black/5 space-y-6">
          <h2 className="text-2xl font-light text-gray-900">Et maintenant ?</h2>
          <p className="text-gray-600">
            Votre paiement a bien été reçu. Voici ce qui va se passer :
          </p>
          <ul className="space-y-4">
            <li className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                <Box className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Fabrication</h3>
                <p className="text-sm text-gray-600">
                  Joanne fabrique votre commande à la main avec soin. Vous serez prévenu lorsque la fabrication sera terminée.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                <Truck className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Expédition</h3>
                <p className="text-sm text-gray-600">
                  Votre colis sera expédié via La Poste. Vous recevrez un email avec le suivi d&apos;envoi dès l&apos;expédition.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Email de confirmation</h3>
                <p className="text-sm text-gray-600">
                  Un récapitulatif de votre commande a été envoyé à votre adresse email. Clos de la Reine a également reçu une notification.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Suivi</h3>
                <p className="text-sm text-gray-600">
                  Vous pouvez suivre l&apos;état de votre commande à tout moment dans <strong>Mon compte → Mes commandes</strong>.
                </p>
              </div>
            </li>
          </ul>
          <div className="pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Référence commande : <span className="font-mono text-gray-700">{orderId || '—'}</span>
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/profil?tab=commandes')}
            className="px-6 py-3 rounded-2xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
          >
            Voir mes commandes
          </button>
          <button
            onClick={() => navigate('/boutique')}
            className="px-6 py-3 rounded-2xl border border-gray-200 font-medium hover:bg-gray-50 transition-colors"
          >
            Continuer mes achats
          </button>
        </div>
      </div>
    </div>
  );
}
