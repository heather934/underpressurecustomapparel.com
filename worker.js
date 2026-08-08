// Under Pressure Custom Apparel — Cloudflare Worker
// Routes:
//   POST /upload-image  — Cloudflare Images upload
//   POST /ipn           — PayPal IPN listener (payment confirmation)
//
// ENVIRONMENT SECRETS (set in Cloudflare Workers → Settings → Variables):
//   CF_IMAGES_TOKEN   — Cloudflare API token for Images
//   KV binding:  UP_DATA (the UP_STORE_DATA namespace)
//
// EmailJS credentials are read from KV at runtime (no hardcoded secrets).

const ACCOUNT_ID   = "6aff7fbefc8562da0c7616e83e4e4e45";
const ACCOUNT_HASH = "lwwGzTeyuPa8yw_b-_V1gg";

const CORS = {
  "Access-Control-Allow-Origin":  "https://underpressurecustomapparel.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Read EmailJS config from KV (stored as individual keys). */
async function getEmailConfig(env) {
  const [publicKey, serviceId, confirmTpl, newOrderTpl] = await Promise.all([
    env.UP_DATA.get("emailjs_public_key"),
    env.UP_DATA.get("emailjs_service_id"),
    env.UP_DATA.get("emailjs_template_id_order_confirmation"),
    env.UP_DATA.get("emailjs_template_id_new_order_made"),
  ]);
  return { publicKey, serviceId, confirmTpl, newOrderTpl };
}

/**
 * Send one email via EmailJS REST API.
 * https://www.emailjs.com/docs/rest-api/send/
 */
async function sendEmail(cfg, templateId, templateParams) {
  const body = {
    service_id:   cfg.serviceId,
    template_id:  templateId,
    user_id:      cfg.publicKey,
    template_params: templateParams,
  };
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.ok;
}

// ─── /upload-image ────────────────────────────────────────────────────────────

async function handleImageUpload(request, env) {
  try {
    const formData  = await request.formData();
    const imageFile = formData.get("image");

    if (!imageFile) return json({ error: "No image provided" }, 400);

    const cfForm = new FormData();
    cfForm.append("file", imageFile);

    const cfRes    = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`,
      { method: "POST", headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` }, body: cfForm }
    );
    const cfResult = await cfRes.json();

    if (!cfResult.success) {
      console.error("CF Images error:", JSON.stringify(cfResult.errors));
      return json({ error: "Upload failed", details: cfResult.errors }, 500);
    }

    const imageId    = cfResult.result.id;
    const deliveryUrl = `https://imagedelivery.net/${ACCOUNT_HASH}/${imageId}/public`;
    return json({ success: true, url: deliveryUrl });

  } catch (err) {
    console.error("Upload error:", err);
    return json({ error: "Server error" }, 500);
  }
}

// ─── /ipn ─────────────────────────────────────────────────────────────────────

async function handleIPN(request, env) {
  // 1. Read raw POST body (PayPal sends application/x-www-form-urlencoded)
  const rawBody = await request.text();

  // 2. Verify with PayPal — send "cmd=_notify-validate" prepended
  const verifyRes = await fetch("https://ipnpb.paypal.com/cgi-bin/webscr", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    "cmd=_notify-validate&" + rawBody,
  });
  const verifyText = await verifyRes.text();

  // PayPal responds with either "VERIFIED" or "INVALID"
  if (verifyText !== "VERIFIED") {
    console.warn("IPN not verified:", verifyText, rawBody);
    return new Response("INVALID", { status: 200 }); // always 200 to PayPal
  }

  // 3. Parse the IPN fields
  const params       = new URLSearchParams(rawBody);
  const txnType      = params.get("txn_type")      || "";
  const paymentStatus = params.get("payment_status") || "";
  const txnId        = params.get("txn_id")         || "";
  const payerEmail   = params.get("payer_email")    || "";
  const payerFirst   = params.get("first_name")     || "";
  const payerLast    = params.get("last_name")      || "";
  const amount       = params.get("mc_gross")       || "";
  const currency     = params.get("mc_currency")    || "USD";
  const itemName     = params.get("item_name")      || "";
  const custom       = params.get("custom")         || ""; // pass order meta here if needed

  // Only act on completed payments
  if (paymentStatus !== "Completed") {
    console.log("IPN received but payment_status:", paymentStatus, "— skipping");
    return new Response("OK", { status: 200 });
  }

  // 4. Build order object
  const order = {
    txnId,
    payerEmail,
    payerName:  `${payerFirst} ${payerLast}`.trim(),
    amount,
    currency,
    itemName,
    custom,
    receivedAt: new Date().toISOString(),
    status:     "paid",
  };

  // 5. Store in KV under order-{txnId}
  try {
    await env.UP_DATA.put(`order-${txnId}`, JSON.stringify(order));
    console.log("Order saved:", txnId);
  } catch (err) {
    console.error("KV write error:", err);
  }

  // 6. Send emails via EmailJS
  try {
    const cfg = await getEmailConfig(env);

    if (cfg.publicKey && cfg.serviceId) {
      const sharedParams = {
        txn_id:     txnId,
        payer_name: order.payerName,
        payer_email: payerEmail,
        amount:     `${amount} ${currency}`,
        item_name:  itemName,
        order_date: new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
      };

      // Order confirmation → customer
      if (cfg.confirmTpl && payerEmail) {
        await sendEmail(cfg, cfg.confirmTpl, {
          ...sharedParams,
          to_email: payerEmail,
          to_name:  order.payerName,
        });
      }

      // New order notification → Erin
      if (cfg.newOrderTpl) {
        await sendEmail(cfg, cfg.newOrderTpl, {
          ...sharedParams,
          to_email: "erin@underpressurecustomapparel.com",
          to_name:  "Erin",
        });
      }

      console.log("IPN emails sent for txn:", txnId);
    } else {
      console.warn("EmailJS config missing from KV — emails not sent");
    }
  } catch (err) {
    console.error("Email error:", err);
  }

  return new Response("OK", { status: 200 });
}

// ─── main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/upload-image") {
      return handleImageUpload(request, env);
    }

    if (request.method === "POST" && path === "/ipn") {
      return handleIPN(request, env);
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
