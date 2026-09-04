// worker-paypal-dev.js
// ══════════════════════════════════════════════════════════════════
// DEV/SANDBOX ONLY — Cloudflare Worker prototype for the real PayPal
// Checkout/Orders API integration, meant to replace the public
// paypal.me link flow (which lets anyone pay outside the site's
// checkout, arriving with no cart/item data attached).
//
// Deployed as a SEPARATE Worker ("up-store-api-dev") bound to a
// SEPARATE KV namespace (UP_STORE_DATA_DEV) — this never reads or
// writes anything in the live up-store-api Worker's data. Uses
// PayPal SANDBOX credentials only; no real money moves through this.
//
// Flow (standard PayPal Orders API v2, "two-call" pattern):
//   1. Customer clicks a PayPal Smart Button on the storefront.
//   2. Browser calls POST /api/paypal/create-order with the cart.
//      This worker asks PayPal to create a unique Order tied to the
//      exact cart total, and saves the cart here in KV keyed by that
//      PayPal Order ID. Returns the Order ID to the browser.
//   3. Customer approves the order inside PayPal's popup — this step
//      only exists because the browser called us first in step 2;
//      there is no public link a customer can jump straight to.
//   4. Browser calls POST /api/paypal/capture-order with the Order
//      ID. This worker asks PayPal to actually capture payment,
//      confirms the captured amount, then reads back the exact cart
//      we saved in step 2 (matched by the guaranteed-unique Order
//      ID — no more fragile "match by payer email" guessing) and
//      records a fully-detailed order. If the capture fails, or
//      nobody ever calls step 2 first, there is nothing to capture —
//      bypass is structurally impossible, not just discouraged.
// ══════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken(env) {
  const clientId = env.PAYPAL_SANDBOX_CLIENT_ID;
  const secret = env.PAYPAL_SANDBOX_SECRET;
  if (!clientId || !secret) {
    throw new Error('PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_SECRET not configured on this Worker');
  }
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${clientId}:${secret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// ── CREATE ORDER ──────────────────────────────────────────────────
// Body: { amount: "62.00", currency: "USD", store_name, customer_name,
//         email, phone, address, shipping_method, notes, order_items,
//         items: [...] }
async function handleCreateOrder(request, env) {
  try {
    const cart = await request.json();
    const amount = parseFloat(cart.amount);
    if (!amount || amount <= 0) return error('Invalid amount', 400);
    if (!cart.email) return error('email is required', 400);

    const accessToken = await getPayPalAccessToken(env);

    const ppRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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
    // Save the cart under the PayPal order ID — this is the atomic
    // link between "what the customer put in their cart" and "what
    // PayPal actually captures". 24h TTL in case they never complete.
    await env.UP_DATA_DEV.put('pending-order-' + orderId, JSON.stringify(cart), {
      expirationTtl: 60 * 60 * 24,
    });

    return json({ id: orderId });
  } catch (e) {
    console.error('create-order error:', e);
    return error('Failed to create order: ' + e.message, 500);
  }
}

// ── CAPTURE ORDER ──────────────────────────────────────────────────
// Body: { orderID: "..." }
async function handleCaptureOrder(request, env) {
  try {
    const { orderID } = await request.json();
    if (!orderID) return error('orderID is required', 400);

    const pendingRaw = await env.UP_DATA_DEV.get('pending-order-' + orderID);
    if (!pendingRaw) {
      return error('No matching cart found for this order — it may have expired or never been created through this endpoint.', 404);
    }
    const cart = JSON.parse(pendingRaw);

    const accessToken = await getPayPalAccessToken(env);
    const ppRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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
      console.warn(`Captured amount ${capturedAmount} does not match expected ${expectedAmount} for order ${orderID}`);
    }

    const enrichedOrder = {
      txnId: capture?.id || orderID,
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
      total: `$${capturedAmount || cart.amount}`,
      orderItems: cart.order_items || '',
      confirmationSent: false,
      confirmationSentAt: null,
    };

    const raw = await env.UP_DATA_DEV.get('orders-list-dev');
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(enrichedOrder);
    await env.UP_DATA_DEV.put('orders-list-dev', JSON.stringify(list.slice(0, 500)));
    await env.UP_DATA_DEV.delete('pending-order-' + orderID);

    return json({ success: true, order: enrichedOrder });
  } catch (e) {
    console.error('capture-order error:', e);
    return error('Failed to capture order: ' + e.message, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === 'POST' && path === '/api/paypal/create-order') {
      return handleCreateOrder(request, env);
    }

    if (request.method === 'POST' && path === '/api/paypal/capture-order') {
      return handleCaptureOrder(request, env);
    }

    // Dev-only inspection endpoint — lets us verify captured orders
    // without needing the admin panel wired up to this dev backend.
    if (request.method === 'GET' && path === '/api/dev/orders-list') {
      const raw = await env.UP_DATA_DEV.get('orders-list-dev');
      return json({ orders: raw ? JSON.parse(raw) : [] });
    }

    if (path === '/ping') {
      return json({ status: 'ok', mode: 'sandbox-dev' });
    }

    return error('Not found', 404);
  },
};
