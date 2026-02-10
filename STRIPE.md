# Stripe – Résumé doc et flux Clos de la Reine

## Comment Stripe gère un paiement (Payment Intents + Elements)

1. **Côté serveur**  
   Créer un **PaymentIntent** (amount, currency). Stripe renvoie un **client_secret** à ne pas exposer en clair (pas dans l’URL, pas en log).

2. **Côté client**  
   - Charger Stripe.js, créer `Elements` avec le `client_secret`.  
   - Afficher le **Payment Element** (carte, etc.).  
   - Au clic sur « Payer » : appeler `stripe.confirmPayment({ elements, confirmParams: { return_url: '...' } })`.

3. **Après confirmation**  
   - **Carte sans 3D Secure** : le paiement peut être confirmé sans quitter la page.  
   - **Carte avec 3D Secure** ou **méthodes à redirection** (iDEAL, etc.) : Stripe redirige vers la banque puis vers votre `return_url`.  
   - Stripe ajoute aux paramètres de l’URL : `payment_intent` et `payment_intent_client_secret`.  
   - Sur la page de retour : utiliser l’un de ces paramètres pour **récupérer le PaymentIntent** et vérifier son **status** (`succeeded`, `processing`, `requires_payment_method`).

4. **Bonnes pratiques (doc Stripe)**  
   - Ne pas se fier uniquement au retour client : le navigateur peut être fermé avant le chargement de la page de retour.  
   - Utiliser les **webhooks** (`payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`) pour la confirmation côté serveur et la mise à jour de la commande.

## Option `redirect: 'if_required'`

Dans `confirmPayment`, on peut passer `redirect: 'if_required'` :

- **Sans 3DS** : pas de redirection ; la promesse se résout sur la même page, on peut appeler le backend tout de suite et rediriger vers « Merci ».  
- **Avec 3DS** : Stripe redirige quand même vers la banque puis vers `return_url` ; il faut garder la logique de « retour Stripe » (paramètres d’URL + confirmation backend).

## Flux actuel Clos de la Reine (une étape)

- **Une seule page** : formulaire d’adresse de livraison + Payment Element sur la même page (plus d’étape 1 / étape 2).  
- Au chargement : récupération de la commande + création du PaymentIntent.  
- Un seul bouton « Payer » : l’adresse et la carte sont sur la même vue, bouton désactivé tant que l’adresse n’est pas complète.  
- `confirmPayment` est appelé avec **`redirect: 'if_required'`** :  
  - **Carte sans 3DS** : pas de redirection, la promesse se résout, appel backend puis redirection vers `/commande/:id/merci`.  
  - **3DS** : Stripe redirige vers la banque puis vers `return_url` → logique « retour Stripe » (paramètres d’URL) → confirmation backend puis page Merci.

## Références

- [Accept a payment (Payment Intents + Elements)](https://docs.stripe.com/payments/accept-a-payment?api-integration=paymentintents&payment-ui=elements)  
- [Customize redirect behavior (embedded form)](https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=embedded-form)  
- [Payment Intents API](https://docs.stripe.com/api/payment_intents)  
- [Handle post-payment events (webhooks)](https://docs.stripe.com/payments/accept-a-payment?api-integration=paymentintents&payment-ui=elements#web-post-payment)
