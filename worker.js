const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// =======================================================
//  ACCESS CONTROL
// =======================================================

const PROTECTED_KEYS = new Set([
  'emailjs_private_key',
]);

function isProtectedKey(key) {
  const k = String(key || '').toLowerCase();
  if (PROTECTED_KEYS.has(k)) return true;
  return /private|secret|passwd|password|api[-_]?key|token/.test(k);
}

function isAuthorizedWrite(request, env) {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) {
    console.error('ADMIN_API_TOKEN secret is not set - refusing all writes.');
    return false;
  }
  const auth = request.headers.get('Authorization') || '';
  const supplied = auth.startsWith('Bearer ')
    ? auth.slice(7)
    : (request.headers.get('X-Admin-Token') || '');
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// =======================================================
//  PAYPAL IPN - payment confirmation -> email Erin
// =======================================================

const ERIN_EMAIL = 'erin@underpressurecustomapparel.com';

async function sendErinNewOrderEmail(env, params) {
  const privateKey = env.EMAILJS_PRIVATE_KEY;
  // Credentials live in the app_config KV blob — the same place the admin
  // Integrations panel saves them — not in standalone keys, which nothing
  // ever wrote to.
  let config = {};
  try {
    const raw = await env.UP_DATA.get('app_config');
    config = raw ? JSON.parse(raw) : {};
  } catch (e) { /* fall through with empty config */ }
  const publicKey  = config.emailjsPublicKey;
  const serviceId  = config.emailjsServiceId;
  const templateId = config.emailjsNewOrderTemplateId;

  if (!publicKey || !serviceId || !templateId) {
    console.error('IPN: EmailJS config missing from KV', {
      hasPublicKey: !!publicKey,
      hasServiceId: !!serviceId,
      hasTemplateId: !!templateId,
    });
    return false;
  }

  const body = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: params,
  };

  if (privateKey) {
    body.accessToken = privateKey;
  } else {
    console.error(
      'IPN: EMAILJS_PRIVATE_KEY secret is not set. EmailJS strict mode ' +
      'will reject this call. Add it under Worker Settings > Variables.'
    );
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('IPN: EmailJS send failed', res.status, detail);
    return false;
  }
  return true;
}

// Look up a pending cart saved by the storefront before PayPal opened.
// Keys are stored as pending-cart-{email} with a 24h TTL.
async function lookupPendingCart(env, payerEmail) {
  if (!payerEmail) return null;
  const key = 'pending-cart-' + payerEmail.toLowerCase().trim();
  const raw = await env.UP_DATA.get(key);
  if (!raw) return null;
  try {
    const cart = JSON.parse(raw);
    // Clean up after successful lookup
    await env.UP_DATA.delete(key);
    return cart;
  } catch (e) {
    return null;
  }
}

// Append a fully-enriched order to the orders-list KV key so the admin
// panel can read all orders from a single public GET /data/orders-list call
// without needing the ADMIN_API_TOKEN.  The list is capped at 500 entries.
async function appendToOrdersList(env, enrichedOrder) {
  try {
    const raw = await env.UP_DATA.get('orders-list');
    const list = raw ? JSON.parse(raw) : [];
    // Remove any existing entry with the same txnId (idempotent)
    const filtered = list.filter(o => o.txnId !== enrichedOrder.txnId);
    filtered.unshift(enrichedOrder);
    await env.UP_DATA.put('orders-list', JSON.stringify(filtered.slice(0, 500)));
  } catch (e) {
    console.error('IPN: orders-list update failed:', e && e.message ? e.message : e);
  }
}

async function handleIPN(request, env, ctx) {
  const rawBody = await request.text();

  ctx.waitUntil((async () => {
    try {
      const verifyRes = await fetch('https://ipnpb.paypal.com/cgi-bin/webscr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'UnderPressure-IPN/1.0',
        },
        body: 'cmd=_notify-validate&' + rawBody,
      });
      const verdict = (await verifyRes.text()).trim();

      if (verdict !== 'VERIFIED') {
        console.warn('IPN not verified:', verdict);
        return;
      }

      const p = new URLSearchParams(rawBody);
      const paymentStatus = p.get('payment_status') || '';
      const txnId = p.get('txn_id') || '';

      if (paymentStatus !== 'Completed') {
        console.log('IPN ignored, payment_status =', paymentStatus);
        return;
      }

      const seenKey = 'ipn-seen-' + txnId;
      if (txnId && (await env.UP_DATA.get(seenKey))) {
        console.log('IPN duplicate ignored for txn', txnId);
        return;
      }

      const payerEmail = p.get('payer_email') || '';

      const order = {
        txnId,
        payerEmail,
        payerName: ((p.get('first_name') || '') + ' ' + (p.get('last_name') || '')).trim(),
        amount: p.get('mc_gross') || '',
        currency: p.get('mc_currency') || 'USD',
        itemName: p.get('item_name') || '',
        note: p.get('memo') || '',
        receivedAt: new Date().toISOString(),
        status: 'paid',
      };

      // Look up the cart the storefront saved before opening PayPal
      const pendingCart = await lookupPendingCart(env, payerEmail);

      // Build the order items string from the saved cart, or fall back
      let orderItemsStr = order.itemName || '(not supplied by PayPal.me)';
      let customerName = order.payerName;
      let customerEmail = payerEmail;
      let customerPhone = '';
      let customerAddress = '';
      let shippingMethod = '';
      let shippingCost = 0;
      let customerNotes = order.note;
      let storeName = 'Under Pressure Custom Apparel';
      let totalStr = '$' + order.amount + ' ' + order.currency;
      let cartItems = []; // structured per-item data, when the storefront sent it

      if (pendingCart) {
        // Use the rich cart data from the storefront
        if (pendingCart.order_items) orderItemsStr = pendingCart.order_items;
        if (pendingCart.customer_name) customerName = pendingCart.customer_name;
        if (pendingCart.email) customerEmail = pendingCart.email;
        if (pendingCart.phone) customerPhone = pendingCart.phone;
        if (pendingCart.address) customerAddress = pendingCart.address;
        if (pendingCart.shipping_method) shippingMethod = pendingCart.shipping_method;
        if (pendingCart.shipping_cost) shippingCost = parseFloat(pendingCart.shipping_cost) || 0;
        if (pendingCart.notes) customerNotes = pendingCart.notes;
        if (pendingCart.store_name) storeName = pendingCart.store_name;
        if (pendingCart.total) totalStr = pendingCart.total;
        if (Array.isArray(pendingCart.items)) cartItems = pendingCart.items;
        console.log('IPN: matched pending cart for', payerEmail);
      } else {
        console.log('IPN: no pending cart found for', payerEmail, '- using PayPal data only');
      }

      // EmailJS's "New Order Made" template expects an {{#orders}} loop of
      // {{image_url}}/{{name}}/{{units}}/{{price}} plus customer/shipping
      // fields repeated per line (see sendOrderEmail(s) in the storefront
      // pages, which build this same shape client-side). Build it from the
      // structured cart items when we have them; otherwise fall back to a
      // single synthetic line so the email isn't blank.
      const orders = (cartItems.length ? cartItems : [{ name: orderItemsStr, units: 1, price: order.amount || '' }])
        .map(i => ({
          image_url:       i.image_url || '',
          name:             i.name || '',
          units:            i.units || i.qty || 1,
          price:            i.price != null ? String(i.price) : '',
          customer_email:   customerEmail,
          customer_phone:   customerPhone,
          shipping_address: customerAddress,
          shipping_method:  shippingMethod,
          color:            i.color || '',
          design_name:      i.design_name || '',
          size:             i.size || '',
          personalization:  i.personalization || '',
        }));
      const totalNumeric = parseFloat(String(totalStr).replace(/[^0-9.]/g, '')) || parseFloat(order.amount) || 0;

      if (txnId) {
        await env.UP_DATA.put('order-' + txnId, JSON.stringify(order));
        await env.UP_DATA.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
      }

      // ── Build the enriched order record and push it to orders-list so the
      //    admin panel can show it under Store Orders without needing /keys auth.
      const enrichedOrder = {
        txnId,
        payerEmail,
        payerName: order.payerName,
        amount: order.amount,
        currency: order.currency,
        receivedAt: order.receivedAt,
        status: 'paid',
        // Rich fields from pending cart (empty strings when cart wasn't saved)
        customerName,
        email: customerEmail,
        phone: customerPhone,
        address: customerAddress,
        shippingMethod,
        notes: customerNotes,
        storeName,
        total: totalStr,
        orderItems: orderItemsStr,
        confirmationSent: false,
        confirmationSentAt: null,
      };
      await appendToOrdersList(env, enrichedOrder);

      await sendErinNewOrderEmail(env, {
        to_email: ERIN_EMAIL,
        to_name: 'Erin',
        reply_to: customerEmail,
        name: customerName,
        customer_name: customerName,
        email: customerEmail,
        customer_email: customerEmail,
        phone: customerPhone,
        customer_phone: customerPhone,
        address: customerAddress,
        shipping_address: customerAddress,
        shipping_method: shippingMethod,
        total: totalStr,
        order_total: totalStr,
        order_id: order.txnId,
        paypal_id: order.txnId,
        order_items: orderItemsStr,
        orders,
        cost: { shipping: shippingCost.toFixed(2), tax: '0.00', total: totalNumeric.toFixed(2) },
        notes: customerNotes,
        store_name: storeName,
      });

      console.log('IPN processed for txn', txnId);
    } catch (e) {
      console.error('IPN handler error:', e && e.stack ? e.stack : e);
    }
  })());

  return new Response('OK', { status: 200 });
}

// =======================================================
//  PENDING CART SAVE (called by storefront before PayPal)
// =======================================================

async function handleSaveCart(request, env) {
  try {
    const cart = await request.json();
    const email = (cart.email || '').toLowerCase().trim();
    if (!email) return error('email is required', 400);
    const key = 'pending-cart-' + email;
    // TTL of 24 hours — if payment doesn't come through, it auto-cleans
    await env.UP_DATA.put(key, JSON.stringify(cart), { expirationTtl: 60 * 60 * 24 });
    return json({ success: true });
  } catch (e) {
    console.error('Save cart error:', e);
    return error('Failed to save cart', 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === 'POST' && path === '/ipn') {
      return handleIPN(request, env, ctx);
    }

    if (request.method === 'GET' && path === '/ipn') {
      return json({ status: 'ipn listener ready', expects: 'POST from PayPal' });
    }

    // Storefront saves cart here before opening PayPal
    if (request.method === 'POST' && path === '/api/save-cart') {
      return handleSaveCart(request, env);
    }

    if (request.method === 'GET' && path === '/api/config') {
      try {
        const raw = await env.UP_DATA.get('app_config');
        const config = raw ? JSON.parse(raw) : {};
        return json({ config });
      } catch(e) {
        return json({ config: {} });
      }
    }

    // Admin Integrations panel saves EmailJS/PayPal/Cloudflare credentials
    // here. Merge into the existing app_config so saving one integration
    // (e.g. EmailJS) doesn't wipe out the others (e.g. PayPal).
    if (request.method === 'POST' && path === '/api/config') {
      try {
        const updates = await request.json();
        const raw = await env.UP_DATA.get('app_config');
        const config = Object.assign({}, raw ? JSON.parse(raw) : {}, updates);
        await env.UP_DATA.put('app_config', JSON.stringify(config));
        return json({ ok: true, config });
      } catch (e) {
        return error('Failed to save config: ' + e.message, 500);
      }
    }

    if (request.method === 'POST' && path === '/images/upload') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        const filename = formData.get('filename') || file && file.name || 'upload';
        if (!file || typeof file === 'string') return error('No file provided', 400);
        const cf_account_id = env.CF_ACCOUNT_ID;
        const cf_images_token = env.CF_IMAGES_TOKEN;
        if (!cf_account_id || !cf_images_token) return error('CF_ACCOUNT_ID and CF_IMAGES_TOKEN secrets are required', 500);
        const arrayBuffer = await file.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: file.type });
        const uploadForm = new FormData();
        uploadForm.append('file', blob, filename);
        const cfRes = await fetch(
          'https://api.cloudflare.com/client/v4/accounts/' + cf_account_id + '/images/v1',
          { method: 'POST', headers: { Authorization: 'Bearer ' + cf_images_token }, body: uploadForm }
        );
        const cfData = await cfRes.json();
        if (!cfData.success) return error((cfData.errors && cfData.errors[0] && cfData.errors[0].message) || 'Upload failed', 500);
        const image = cfData.result;
        const publicUrl = (image.variants && image.variants.find(function(v){ return v.endsWith('/public'); }))
          || (image.variants && image.variants[0])
          || ('https://imagedelivery.net/' + image.id + '/public');
        return json({ success: true, id: image.id, url: publicUrl });
      } catch (e) {
        return error('Upload failed: ' + e.message, 500);
      }
    }

    if (request.method === 'DELETE' && path.startsWith('/images/')) {
      try {
        const imageId = path.replace('/images/', '');
        if (!imageId) return error('No image ID provided', 400);
        const cf_account_id = env.CF_ACCOUNT_ID;
        const cf_images_token = env.CF_IMAGES_TOKEN;
        if (!cf_account_id || !cf_images_token) return error('Credentials missing', 500);
        await fetch(
          'https://api.cloudflare.com/client/v4/accounts/' + cf_account_id + '/images/v1/' + imageId,
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + cf_images_token } }
        );
        return json({ success: true });
      } catch (e) {
        return error('Delete failed: ' + e.message, 500);
      }
    }

    if (request.method === 'GET' && path.startsWith('/data/')) {
      const key = path.replace('/data/', '');
      if (isProtectedKey(key)) {
        console.warn('Blocked public read of protected key:', key);
        return error('Not found', 404);
      }
      const value = await env.UP_DATA.get(key);
      if (value === null) return json({});
      return json(JSON.parse(value));
    }

    if (request.method === 'POST' && path.startsWith('/data/')) {
      const key = path.replace('/data/', '');
      const body = await request.json();
      await env.UP_DATA.put(key, JSON.stringify(body));
      return json({ success: true });
    }

    if (request.method === 'DELETE' && path.startsWith('/data/')) {
      const key = path.replace('/data/', '');
      await env.UP_DATA.delete(key);
      return json({ success: true });
    }

    if (request.method === 'GET' && path === '/keys') {
      if (!isAuthorizedWrite(request, env)) return error('Unauthorized', 401);
      const list = await env.UP_DATA.list();
      return json(list.keys.map(function(k){ return k.name; }));
    }

    if (path === '/ping') {
      return json({ status: 'ok' });
    }

    return error('Not found', 404);
  },
};
