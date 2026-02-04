import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JWT_PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || (process.env.NODE_ENV === 'production' ? '/app/secrets/jwt_private_key.pem' : join(__dirname, '..', '..', '..', '..', 'Email-Service', 'secrets', 'jwt_private_key.pem'));
const EMAIL_SERVICE_URL = process.env.EMAIL_SERVICE_URL || 'http://email-service.email-service.svc.cluster.local:8080';
const PROJECT = 'clos-de-la-reine';

function generateJWTToken() {
  try {
    const privateKey = readFileSync(JWT_PRIVATE_KEY_PATH, 'utf8');
    return jwt.sign(
      {
        project: PROJECT,
        permissions: ['send_email'],
      },
      privateKey,
      {
        algorithm: 'RS256',
        issuer: 'email-service',
        expiresIn: '1h',
      }
    );
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de la génération du token JWT:', error.message);
    throw new Error(`JWT generation failed: ${error.message}`);
  }
}

async function sendEmailToService(templateId, toEmail, toName, variables = {}, subject = null) {
  try {
    const token = generateJWTToken();
    
    const requestBody = {
      template_id: templateId,
      to_email: toEmail,
      to_name: toName,
      project: PROJECT,
      variables: variables,
    };
    
    if (subject != null) {
      requestBody.subject = subject;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('📤 [EMAIL] Envoi à Email-Service:', JSON.stringify(requestBody, null, 2));
    }
    
    const response = await fetch(`${EMAIL_SERVICE_URL}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMessage = error.error || `HTTP ${response.status}`;
      const errorDetails = error.details ? ` - Details: ${Array.isArray(error.details) ? error.details.join(', ') : error.details}` : '';
      throw new Error(errorMessage + errorDetails);
    }

    const result = await response.json();
    console.log('✅ [EMAIL] Email envoyé à', toEmail, 'via Email-Service');
    return { success: true, message: result.message || 'Email sent successfully' };
  } catch (error) {
    console.error('❌ [EMAIL] Erreur lors de l\'envoi de l\'email via Email-Service:', error);
    return { success: false, error: error.message };
  }
}

export const sendPasswordResetEmail = async (userEmail, signedToken) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://closdelareine.fr';
  
  const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(signedToken)}&email=${encodeURIComponent(userEmail)}`;

  const toName = userEmail.split('@')[0];

  return await sendEmailToService('forgot-password', userEmail, toName, {
    reset_link: resetLink
  });
};

export const sendOrderConfirmationEmail = async (userEmail, orderData) => {
  const toName = `${orderData.firstName} ${orderData.lastName}`;
  
  const orderItems = orderData.items.map(item => 
    `- ${item.name} x${item.quantity} - ${item.price.toFixed(2)}€`
  ).join('\n');
  
  // Formater le total
  const orderTotal = `Sous-total: ${(orderData.totalAmount - (orderData.shippingCost || 0)).toFixed(2)}€\nFrais de port: ${(orderData.shippingCost || 0).toFixed(2)}€\nTotal: ${orderData.totalAmount.toFixed(2)}€`;
  
  // Formater l'adresse de livraison
  const shippingAddress = typeof orderData.shippingAddress === 'string' 
    ? orderData.shippingAddress 
    : `${orderData.shippingAddress.address || ''}\n${orderData.shippingAddress.postalCode || ''} ${orderData.shippingAddress.city || ''}\n${orderData.shippingAddress.country || 'France'}`;

  return await sendEmailToService('order-confirmation', userEmail, toName, {
    order_number: orderData.orderNumber || 'N/A',
    order_items: orderItems,
    order_total: orderTotal,
    shipping_address: shippingAddress
  });
};

export const sendNewContactNotificationEmail = async (adminEmail, contactData) => {
  const toName = 'Administrateur';
  
  return await sendEmailToService('contact', adminEmail, toName, {
    from_name: contactData.firstName && contactData.lastName 
      ? `${contactData.firstName} ${contactData.lastName}` 
      : contactData.from_name || 'Client',
    from_email: contactData.email || contactData.from_email || '',
    message: contactData.message || '',
    phone: contactData.phone || ''
  });
};

export const sendContactConfirmationEmail = async (userEmail, contactData) => {
  const toName = contactData.firstName && contactData.lastName 
    ? `${contactData.firstName} ${contactData.lastName}` 
    : userEmail.split('@')[0];

  return await sendEmailToService('contact-sent', userEmail, toName, {  });
};

export const sendNewOrderNotificationEmail = async (orderData) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'closdelareine@gmail.com';
  const toName = 'Administrateur';
  
  const orderItems = orderData.items.map(item => 
    `- ${item.name} x${item.quantity} - ${item.price.toFixed(2)}€`
  ).join('\n');
  
  // Formater le total
  const orderTotal = `Sous-total: ${(orderData.totalAmount - (orderData.shippingCost || 0)).toFixed(2)}€\nFrais de port: ${(orderData.shippingCost || 0).toFixed(2)}€\nTotal: ${orderData.totalAmount.toFixed(2)}€`;
  
  // Formater l'adresse de livraison
  const shippingAddress = typeof orderData.shippingAddress === 'string' 
    ? orderData.shippingAddress 
    : `${orderData.shippingAddress.address || ''}\n${orderData.shippingAddress.postalCode || ''} ${orderData.shippingAddress.city || ''}\n${orderData.shippingAddress.country || 'France'}`;

  return await sendEmailToService('new-order', adminEmail, toName, {
    order_number: orderData.orderNumber || 'N/A',
    customer_name: orderData.customerName || 'Client',
    customer_email: orderData.customerEmail || '',
    customer_phone: orderData.customerPhone || '',
    order_items: orderItems,
    order_total: orderTotal,
    shipping_address: shippingAddress,
    payment_method: orderData.paymentMethod || 'Stripe'
  });
};
