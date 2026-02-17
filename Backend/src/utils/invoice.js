import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JWT_INVOICE_PRIVATE_KEY_PATH = process.env.JWT_INVOICE_PRIVATE_KEY_PATH || '/app/secrets/jwt_invoice_private_key.pem';
const INVOICE_SERVICE_URL = process.env.INVOICE_SERVICE_URL || 'http://invoice-service.invoice-service.svc.cluster.local:8080';
const PROJECT = 'clos-de-la-reine';

function generateInvoiceServiceToken(privateKey) {
  try {
    return jwt.sign(
      { project: PROJECT, permissions: ['generate_invoice'] },
      privateKey,
      { algorithm: 'RS256', issuer: 'clos-de-la-reine-back', expiresIn: '1h' }
    );
  } catch (e) {
    console.error('❌ [INVOICE] JWT error:', e.message);
    throw new Error('JWT generation failed for Invoice-Service');
  }
}

export async function sendInvoiceEmail(clientEmail, orderData) {
  if (!INVOICE_SERVICE_URL || INVOICE_SERVICE_URL.includes('undefined')) {
    console.warn('[INVOICE] INVOICE_SERVICE_URL non configuré, skip envoi facture');
    return { success: false, error: 'Invoice-Service non configuré' };
  }
  try {
    let privateKey;
    try {
      privateKey = readFileSync(JWT_INVOICE_PRIVATE_KEY_PATH, 'utf8');
    } catch (e) {
      console.warn('[INVOICE] Clé JWT Invoice manquante, skip envoi facture');
      return { success: false, error: 'Clé JWT Invoice manquante' };
    }
    const token = generateInvoiceServiceToken(privateKey);
    const response = await fetch(`${INVOICE_SERVICE_URL}/api/v1/generate-and-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        project: PROJECT,
        order_data: orderData,
        to_email: clientEmail,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || err.details || 'Invoice-Service error');
    }
    console.log('✅ [INVOICE] Facture envoyée à', clientEmail);
    return { success: true };
  } catch (e) {
    console.error('❌ [INVOICE] Erreur:', e.message);
    return { success: false, error: e.message };
  }
}
