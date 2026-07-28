// Under Pressure Custom Apparel — Image Upload Worker
// Receives a photo from the player design form, uploads it to
// Cloudflare Images, and returns the public delivery URL.
//
// SETUP: After uploading this file to GitHub, go to:
// Cloudflare → Workers & Pages → under-pressure-website
// → Settings → Variables and secrets → Add variable
//   Name:  CF_IMAGES_TOKEN
//   Value: (paste your Cloudflare API token here)
//   ✓ Encrypt

const ACCOUNT_ID = "6aff7fbefc8562da0c7616e83e4e4e45";
const ACCOUNT_HASH = "lwwGzTeyuPa8yw_b-_V1gg";

export default {
  async fetch(request, env) {

    // Allow CORS from your site
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://underpressurecustomapparel.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST to /upload-image
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/upload-image") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    try {
      // Get the image from the incoming request
      const formData = await request.formData();
      const imageFile = formData.get("image");

      if (!imageFile) {
        return new Response(JSON.stringify({ error: "No image provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Forward to Cloudflare Images API
      const cfFormData = new FormData();
      cfFormData.append("file", imageFile);

      const cfResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`,
          },
          body: cfFormData,
        }
      );

      const cfResult = await cfResponse.json();

      if (!cfResult.success) {
        console.error("Cloudflare Images error:", JSON.stringify(cfResult.errors));
        return new Response(JSON.stringify({ error: "Upload failed", details: cfResult.errors }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build the public delivery URL
      const imageId = cfResult.result.id;
      const deliveryUrl = `https://imagedelivery.net/${ACCOUNT_HASH}/${imageId}/public`;

      return new Response(JSON.stringify({ success: true, url: deliveryUrl }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (err) {
      console.error("Worker error:", err);
      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
