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

// KV values are occasionally stored double-JSON-encoded (a caller sent an
// already-stringified body, so JSON.stringify wrapped it a second time on
// write) — a single JSON.parse then yields a string, not an object, and
// every field lookup on it silently comes back undefined. Parse repeatedly
// until we hit a real object, so a write-side bug degrades gracefully
// instead of breaking every reader silently.
function parseConfigValue(raw) {
  let value = raw;
  let iterations = 0;
  while (typeof value === 'string' && iterations < 5) {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return {};
    }
    iterations++;
  }
  return (value && typeof value === 'object') ? value : {};
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
    config = raw ? parseConfigValue(raw) : {};
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

// Every checkout is logged here permanently the instant the storefront
// saves a cart (i.e. the moment the customer clicks "Pay with PayPal") —
// independent of PayPal ever confirming the payment. This is what makes
// the admin "Order Archive" panel work even when the IPN webhook never
// fires or its payer_email doesn't match what the customer typed at
// checkout: the cart details are already durably recorded here, not just
// sitting in the 24h pending-cart-{email} key used for IPN matching.
// Capped at 1000 entries, no expiry.
async function appendToCheckoutLog(env, cart, paypalOrderId = null) {
  try {
    const raw = await env.UP_DATA.get('checkout-log');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      receivedAt: new Date().toISOString(),
      email: cart.email || '',
      customerName: cart.customer_name || '',
      phone: cart.phone || '',
      address: cart.address || '',
      notes: cart.notes || '',
      orderItems: cart.order_items || '',
      items: Array.isArray(cart.items) ? cart.items : [],
      shippingMethod: cart.shipping_method || '',
      shippingCost: cart.shipping_cost || '',
      total: cart.total || '',
      storeName: cart.store_name || '',
      status: 'awaiting_payment',
      // Set when this entry came from the real PayPal Orders API flow
      // (create-order) rather than the legacy paypal.me + IPN flow — lets
      // capture-order find and update this exact entry precisely, instead
      // of the fuzzy email/amount matching reconcileCheckoutLog needs for
      // the legacy flow below.
      paypalOrderId,
      matchedTxnId: null,
      matchedAt: null,
      matchedVia: null,
    });
    await env.UP_DATA.put('checkout-log', JSON.stringify(list.slice(0, 1000)));
  } catch (e) {
    console.error('checkout-log append failed:', e && e.message ? e.message : e);
  }
}

// Link a confirmed PayPal payment back to the checkout-log entry it came
// from, so the archive shows "paid" instead of leaving it stuck at
// "awaiting payment" forever. Matches by email first; falls back to the
// most recent unmatched entry with the same dollar total, since the email
// a customer types at checkout often differs from their PayPal account's
// email (the same mismatch that can make IPN's pending-cart lookup miss),
// while the amount charged rarely does.
async function reconcileCheckoutLog(env, payerEmail, amount, txnId) {
  try {
    const raw = await env.UP_DATA.get('checkout-log');
    if (!raw) return;
    const list = JSON.parse(raw);
    const normalizedEmail = (payerEmail || '').toLowerCase().trim();
    const amountNum = parseFloat(amount) || 0;

    let match = normalizedEmail
      ? list.find(e => e.status === 'awaiting_payment' && (e.email || '').toLowerCase().trim() === normalizedEmail)
      : null;
    let matchedVia = 'email';
    if (!match && amountNum) {
      match = list.find(e => e.status === 'awaiting_payment' &&
        Math.abs((parseFloat(String(e.total || '').replace(/[^0-9.]/g, '')) || 0) - amountNum) < 0.01);
      matchedVia = 'amount';
    }
    if (match) {
      match.status = 'paid';
      match.matchedTxnId = txnId;
      match.matchedAt = new Date().toISOString();
      match.matchedVia = matchedVia;
      await env.UP_DATA.put('checkout-log', JSON.stringify(list));
    }
  } catch (e) {
    console.error('checkout-log reconcile failed:', e && e.message ? e.message : e);
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
      await reconcileCheckoutLog(env, payerEmail, order.amount, txnId);

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
    // Also record it permanently in the checkout-log archive, independent
    // of whether PayPal ever confirms this payment — see appendToCheckoutLog.
    await appendToCheckoutLog(env, cart);
    return json({ success: true });
  } catch (e) {
    console.error('Save cart error:', e);
    return error('Failed to save cart', 500);
  }
}

// =======================================================
//  PAYPAL ORDERS API — real, non-bypassable checkout
// =======================================================
// Replaces the paypal.me + IPN flow above for storefront checkout. A
// paypal.me link is public and permanent — anyone can pay it directly,
// completely outside the site, with no cart attached. This flow makes
// that structurally impossible: the server creates a unique, single-use
// PayPal Order tied to the exact cart total BEFORE the customer ever
// sees PayPal, and only that exact order can be captured. If capture
// succeeds, the payment is real and confirmed — there's no "optimistic"
// or "unconfirmed" state to reason about, unlike the old flow.
//
// The legacy /ipn and /api/save-cart handlers above are left in place
// during the transition (harmless if nothing calls them once the
// storefront pages stop using paypal.me links) rather than removed.

const PAYPAL_API_BASE = 'https://api-m.paypal.com';

async function getPayPalAccessToken(env) {
  const clientId = env.PAYPAL_LIVE_CLIENT_ID;
  const secret = env.PAYPAL_LIVE_SECRET;
  if (!clientId || !secret) {
    throw new Error('PAYPAL_LIVE_CLIENT_ID / PAYPAL_LIVE_SECRET not configured on this Worker');
  }
  const res = await fetch(PAYPAL_API_BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(clientId + ':' + secret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// Body: { amount, currency, store_name, customer_name, email, phone,
//         address, shipping_method, notes, order_items, items: [...] }
async function handlePayPalCreateOrder(request, env) {
  try {
    const cart = await request.json();
    const amount = parseFloat(cart.amount);
    if (!amount || amount <= 0) return error('Invalid amount', 400);
    if (!cart.email) return error('email is required', 400);

    const accessToken = await getPayPalAccessToken(env);

    const ppRes = await fetch(PAYPAL_API_BASE + '/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: cart.currency || 'USD', value: amount.toFixed(2) },
          description: (cart.store_name || 'Under Pressure Custom Apparel') + ' order',
        }],
      }),
    });
    const ppData = await ppRes.json();
    if (!ppRes.ok) {
      console.error('PayPal create order failed', ppData);
      return error('PayPal order creation failed: ' + (ppData.message || JSON.stringify(ppData)), 500);
    }

    const orderId = ppData.id;
    // Save the cart under the PayPal order ID — the atomic link between
    // "what the customer put in their cart" and "what PayPal actually
    // captures". 24h TTL in case they never complete.
    await env.UP_DATA.put('pending-order-' + orderId, JSON.stringify(cart), {
      expirationTtl: 60 * 60 * 24,
    });
    // Also log it to the Order Archive immediately, tagged with this
    // order's guaranteed-unique PayPal Order ID for precise reconciliation.
    await appendToCheckoutLog(env, cart, orderId);

    return json({ id: orderId });
  } catch (e) {
    console.error('paypal create-order error:', e);
    return error('Failed to create order: ' + e.message, 500);
  }
}

// Body: { orderID }
async function handlePayPalCaptureOrder(request, env) {
  try {
    const { orderID } = await request.json();
    if (!orderID) return error('orderID is required', 400);

    const pendingRaw = await env.UP_DATA.get('pending-order-' + orderID);
    if (!pendingRaw) {
      return error('No matching cart found for this order — it may have expired or never been created through this endpoint.', 404);
    }
    const cart = JSON.parse(pendingRaw);

    const accessToken = await getPayPalAccessToken(env);
    const ppRes = await fetch(PAYPAL_API_BASE + '/v2/checkout/orders/' + orderID + '/capture', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
    });
    const ppData = await ppRes.json();
    if (!ppRes.ok) {
      console.error('PayPal capture failed', ppData);
      return error('PayPal capture failed: ' + (ppData.message || JSON.stringify(ppData)), 500);
    }

    const capture = ppData.purchase_units?.[0]?.payments?.captures?.[0];
    const capturedAmount = capture?.amount?.value;
    const payer = ppData.payer || {};

    // Sanity-check the captured amount matches what the cart expected —
    // catches any drift between what was quoted and what PayPal actually
    // took, rather than silently trusting the client.
    const expectedAmount = parseFloat(cart.amount).toFixed(2);
    if (capturedAmount !== expectedAmount) {
      console.warn('Captured amount ' + capturedAmount + ' does not match expected ' + expectedAmount + ' for order ' + orderID);
    }

    const txnId = capture?.id || orderID;
    const enrichedOrder = {
      txnId,
      paypalOrderId: orderID,
      payerEmail: payer.email_address || cart.email,
      payerName: [payer.name?.given_name, payer.name?.surname].filter(Boolean).join(' '),
      amount: capturedAmount || cart.amount,
      currency: capture?.amount?.currency_code || cart.currency || 'USD',
      receivedAt: new Date().toISOString(),
      status: 'paid',
      customerName: cart.customer_name || '',
      email: cart.email,
      phone: cart.phone || '',
      address: cart.address || '',
      shippingMethod: cart.shipping_method || '',
      notes: cart.notes || '',
      storeName: cart.store_name || 'Under Pressure Custom Apparel',
      total: '$' + (capturedAmount || cart.amount),
      orderItems: cart.order_items || '',
      confirmationSent: false,
      confirmationSentAt: null,
    };

    await appendToOrdersList(env, enrichedOrder);
    await env.UP_DATA.delete('pending-order-' + orderID);

    // Mark the matching checkout-log entry paid by its exact PayPal Order
    // ID — reliable, unlike the fuzzy email/amount matching the legacy
    // IPN-driven reconcileCheckoutLog needs.
    try {
      const raw = await env.UP_DATA.get('checkout-log');
      if (raw) {
        const list = JSON.parse(raw);
        const match = list.find(e => e.paypalOrderId === orderID);
        if (match) {
          match.status = 'paid';
          match.matchedTxnId = txnId;
          match.matchedAt = new Date().toISOString();
          match.matchedVia = 'paypalOrderId';
          await env.UP_DATA.put('checkout-log', JSON.stringify(list));
        }
      }
    } catch (e) {
      console.error('checkout-log update on capture failed:', e && e.message ? e.message : e);
    }

    return json({ success: true, order: enrichedOrder });
  } catch (e) {
    console.error('paypal capture-order error:', e);
    return error('Failed to capture order: ' + e.message, 500);
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

    if (request.method === 'POST' && path === '/api/paypal/create-order') {
      return handlePayPalCreateOrder(request, env);
    }

    if (request.method === 'POST' && path === '/api/paypal/capture-order') {
      return handlePayPalCaptureOrder(request, env);
    }

    // Storefront saves cart here before opening PayPal
    if (request.method === 'POST' && path === '/api/save-cart') {
      return handleSaveCart(request, env);
    }

    if (request.method === 'GET' && path === '/api/config') {
      try {
        const raw = await env.UP_DATA.get('app_config');
        const config = raw ? parseConfigValue(raw) : {};
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
        const config = Object.assign({}, raw ? parseConfigValue(raw) : {}, updates);
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
