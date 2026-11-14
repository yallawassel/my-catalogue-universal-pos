import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "AI service is not configured. Ask the platform administrator to configure the Edge Function secrets." }, 503);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  const businessId = String(body.business_id || "");
  const prompt = String(body.prompt || "").trim();
  if (!businessId || !prompt || prompt.length > 5000) return json({ error: "Business and prompt are required. Prompts must be under 5,000 characters." }, 400);
  if (!["chat", "generate_image", "edit_image"].includes(action)) return json({ error: "Unsupported AI action." }, 400);
  const { data: membership, error: memberError } = await admin.from("mc_saas_members").select("business_id,role").eq("business_id", businessId).eq("user_id", userData.user.id).maybeSingle();
  if (memberError || !membership) return json({ error: "You do not have access to this business." }, 403);
  const { data: business, error: businessError } = await admin.from("mc_saas_businesses").select("company_name,description,currency").eq("id", businessId).maybeSingle();
  if (businessError || !business) return json({ error: "Business not found." }, 404);

  // Image generation/editing is disabled by default to prevent accidental OpenAI spend.
  // Enable only after reviewing real provider costs and setting the Supabase secret
  // AI_IMAGE_GENERATION_ENABLED=true. This check runs before job creation or credit deduction.
  const imageAction = action === "generate_image" || action === "edit_image";
  if (imageAction && Deno.env.get("AI_IMAGE_GENERATION_ENABLED") !== "true") {
    return json({ error: "AI image generation and editing are temporarily paused to protect your API balance. No credits were deducted. Chat remains available." }, 503);
  }
  const generateCredits = Math.max(1, Number(Deno.env.get("AI_IMAGE_GENERATE_CREDITS") || 2));
  const editCredits = Math.max(1, Number(Deno.env.get("AI_IMAGE_EDIT_CREDITS") || 3));
  const credits = action === "chat" ? 1 : action === "generate_image" ? generateCredits : editCredits;
  const { data: job, error: jobError } = await admin.from("mc_saas_ai_jobs").insert({ business_id: businessId, user_id: userData.user.id, job_type: action, status: "processing", prompt: prompt.slice(0, 5000), credits_charged: credits }).select("id").single();
  if (jobError || !job) return json({ error: "Could not create the AI job record." }, 500);
  const { error: consumeError } = await userClient.rpc("mc_saas_ai_consume_credits", { p_business_id: businessId, p_credits: credits, p_action: action, p_reference_id: job.id });
  if (consumeError) { await admin.from("mc_saas_ai_jobs").update({ status: "failed", error_message: consumeError.message, completed_at: new Date().toISOString() }).eq("id", job.id); return json({ error: consumeError.message }, 402); }

  try {
    if (action === "chat") {
      const history = Array.isArray(body.history) ? body.history.slice(-10).filter((m: any) => ["user", "assistant"].includes(m?.role) && typeof m?.content === "string").map((m: any) => ({ role: m.role, content: m.content.slice(0, 3000) })) : [];
      const input = [...history, { role: "user", content: prompt }];
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("OPENAI_TEXT_MODEL") || "gpt-5.5", instructions: `You are the My Catalogue AI assistant for ${business.company_name}. Help the business owner improve their product catalogue. Give practical, concise, professional advice. Do not claim to have changed products, prices, stock, orders, templates or settings. You may draft product descriptions, suggest categories, translate text, and recommend visual directions. Always ask the user to review and approve changes. Business description: ${business.description || "Not provided"}. Currency: ${business.currency || "USD"}.`, input, max_output_tokens: 700 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || `OpenAI request failed (${response.status}).`);
      const answer = String(result.output_text || result.output?.flatMap((o: any) => o.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("\n") || "I could not produce a text response.");
      await admin.from("mc_saas_ai_jobs").update({ status: "completed", provider_model: Deno.env.get("OPENAI_TEXT_MODEL") || "gpt-5.5", completed_at: new Date().toISOString() }).eq("id", job.id);
      return json({ answer, job_id: job.id, credits_charged: credits });
    }

    const imageModel = action === "edit_image" ? (Deno.env.get("OPENAI_IMAGE_EDIT_MODEL") || "gpt-image-2.5-sunburst") : (Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-2.5-flare");
    const imagePrompt = `Create a professional ecommerce catalogue photograph. Product brief: ${prompt}. Preserve the real product identity, proportions, packaging, labels and printed text when an input image is supplied. Do not invent brand names, certifications, sizes or claims. Use clean premium commercial lighting, accurate colors, a simple uncluttered background and a square composition suitable for a product catalogue.`;
    let imageResponse: Response;
    if (action === "edit_image") {
      const b64 = String(body.image_base64 || "");
      const mime = String(body.image_mime || "image/jpeg");
      if (!b64 || b64.length > 14_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("For editing, upload a JPEG, PNG or WebP image smaller than 10 MB.");
      const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const form = new FormData(); form.append("model", imageModel); form.append("prompt", imagePrompt); form.append("size", "1024x1024"); form.append("quality", "high"); form.append("output_format", "webp"); form.append("image", new Blob([binary], { type: mime }), "source-image." + (mime.split("/")[1] || "jpg"));
      imageResponse = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
    } else {
      imageResponse = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: imageModel, prompt: imagePrompt, size: "1024x1024", quality: "high", output_format: "webp", n: 1 }) });
    }
    const imageResult = await imageResponse.json();
    if (!imageResponse.ok) throw new Error(imageResult?.error?.message || `OpenAI image request failed (${imageResponse.status}).`);
    const imageBase64 = imageResult?.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("The image provider returned no image data.");
    const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
    const path = `${businessId}/ai/${job.id}.webp`;
    const { error: uploadError } = await admin.storage.from("mc-saas-images").upload(path, bytes, { contentType: "image/webp", upsert: false });
    if (uploadError) throw new Error(`Could not save generated image: ${uploadError.message}`);
    const { data: publicData } = admin.storage.from("mc-saas-images").getPublicUrl(path);
    await admin.from("mc_saas_ai_jobs").update({ status: "completed", result_url: publicData.publicUrl, provider_model: imageModel, completed_at: new Date().toISOString() }).eq("id", job.id);
    return json({ image_url: publicData.publicUrl, job_id: job.id, credits_charged: credits, model: imageModel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    await admin.rpc("mc_saas_ai_refund_credits", { p_business_id: businessId, p_credits: credits, p_action: `${action}_refund`, p_reference_id: job.id });
    await admin.from("mc_saas_ai_jobs").update({ status: "failed", error_message: message.slice(0, 1000), completed_at: new Date().toISOString() }).eq("id", job.id);
    return json({ error: message, refunded: true }, 502);
  }
});
