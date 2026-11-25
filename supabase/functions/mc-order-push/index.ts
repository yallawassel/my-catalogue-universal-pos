// Raffi — ring the shop owner's phone (Web Push) when a new online order arrives.
// Called by the database trigger mc_saas_order_push (header x-raffi-secret), or by a signed-in
// manager with {action:"test", business_id} to send a test alert to their own devices.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const r = await admin.rpc("mc_saas_push_config");
  if (r.error || !r.data) throw new Error("push config missing");
  cfg = r.data as Record<string, string>;
  webpush.setVapidDetails("https://myraffi.com", cfg.raffi_vapid_public, cfg.raffi_vapid_private);
  return cfg;
}
const money = (n: number, c: string) => (c === "USD" ? "$" : c === "EUR" ? "€" : c + " ") + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: ["LBP", "IQD", "SYP"].includes(c) ? 0 : 2 });

async function send(businessId: string, payload: Record<string, unknown>, userId?: string) {
  let q = admin.from("mc_saas_push_subscriptions").select("id,endpoint,p256dh,auth,fail_count").eq("business_id", businessId);
  if (userId) q = q.eq("user_id", userId);
  const subs = (await q).data || [];
  let ok = 0, gone = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      ok++; await admin.from("mc_saas_push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410 || s.fail_count >= 9) { gone++; await admin.from("mc_saas_push_subscriptions").delete().eq("id", s.id); }
      else await admin.from("mc_saas_push_subscriptions").update({ fail_count: s.fail_count + 1 }).eq("id", s.id);
    }
  }));
  return { devices: subs.length, sent: ok, removed: gone };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const c = await config();
    const body = await req.json().catch(() => ({}));
    if (body.action === "test") {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
      const u = await user.auth.getUser(token);
      if (!u.data.user) return json({ error: "Sign in first." }, 401);
      const can = await user.rpc("mc_saas_can_manage", { p_business_id: body.business_id });
      if (can.error || can.data !== true) return json({ error: "Access denied." }, 403);
      const r = await send(body.business_id, { title: "🔔 Raffi order alerts are on", body: "You will hear this for every new online order.", url: "./admin.html#orders", tag: "raffi-test" }, u.data.user.id);
      return json(r);
    }
    if (req.headers.get("x-raffi-secret") !== c.raffi_order_push_secret) return json({ error: "Forbidden" }, 403);
    if (body.request_id) {
      // a shop asked to subscribe: ring the platform owner's devices
      const q = (await admin.from("mc_saas_subscription_requests").select("id,business_id,plan,contact_phone,contact_way").eq("id", body.request_id).maybeSingle()).data;
      if (!q) return json({ error: "request not found" }, 404);
      const b = (await admin.from("mc_saas_businesses").select("company_name").eq("id", q.business_id).maybeSingle()).data;
      const ids = ((await admin.rpc("mc_saas_platform_admin_ids")).data || []) as string[];
      const subs = ids.length ? ((await admin.from("mc_saas_push_subscriptions").select("id,endpoint,p256dh,auth,fail_count").in("user_id", ids)).data || []) : [];
      const seen = new Set<string>(); let sent = 0;
      for (const s of subs) {
        if (seen.has(s.endpoint)) continue; seen.add(s.endpoint);
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: `💳 Subscription request — ${b?.company_name || "a shop"}`, body: `${q.plan || "plan?"} · ${q.contact_way || "contact"}: ${q.contact_phone}`, url: "./platform-admin.html", tag: "raffi-subreq-" + q.id }), { TTL: 86400, urgency: "high" }); sent++; } catch (_) { /* ignore */ }
      }
      return json({ devices: seen.size, sent });
    }
    const o = (await admin.from("mc_saas_orders").select("id,business_id,order_number,customer_name,total,currency,items,notes").eq("id", body.order_id).maybeSingle()).data;
    if (!o) return json({ error: "order not found" }, 404);
    const n = Array.isArray(o.items) ? o.items.length : 0;
    const via = /^\[(\w+)\]/.exec(o.notes || "")?.[1];
    const r = await send(o.business_id, {
      title: `🛎️ New order${o.order_number ? " #" + o.order_number : ""} — ${money(o.total, o.currency || "USD")}`,
      body: `${o.customer_name || "Customer"} · ${n} item${n === 1 ? "" : "s"}${via ? " · " + via : ""}`,
      url: "./orders.html", tag: "raffi-order-" + o.id,
    });
    return json(r);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
