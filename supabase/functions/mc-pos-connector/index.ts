// My Catalogue — Live POS connector (v8, units v4: Packet + Box with sizes from the POS)
// One-way, read-only-from-POS synchronization endpoint used by the Windows agent,
// export-folder watcher and any cloud POS / custom integration.
//
// Auth: header `x-connector-key: mcpos_...` (created in Admin → Live POS connector).
// Only the SHA-256 hash of the key is stored in the database.
//
// Safety rules (same as the Excel importer):
//  • Matching order: unit barcode → product barcode → POS product ID → SKU. Never by name.
//  • Ambiguous identifiers are skipped and reported, never guessed.
//  • Existing catalogue names, photos, descriptions and categories are preserved.
//  • Products are never deleted. Nothing is ever written back to the POS.
//  • `dry_run: true` returns the full plan without changing anything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-connector-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAX_ITEMS = 5000;

type Item = {
  barcode?: unknown; pos_product_id?: unknown; sku?: unknown; name?: unknown; category?: unknown; description?: unknown;
  unit1?: unknown; price1?: unknown; unit2?: unknown; price2?: unknown; stock_qty?: unknown; active?: unknown;
  pieces1?: unknown; pieces2?: unknown; unit_only?: unknown;
};

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const key = (v: unknown) => str(v).toLowerCase();
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function multiMap<T>(rows: T[], pick: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = pick(r); if (!k) continue; const a = m.get(k) || []; a.push(r); m.set(k, a); }
  return m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Connector is not configured on the server." }, 503);

  const connectorKey = (req.headers.get("x-connector-key") || "").trim();
  if (!/^mcpos_[a-f0-9]{48}$/.test(connectorKey)) return json({ error: "Missing or invalid connector key." }, 401);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > 8_000_000) return json({ error: "Request too large. Send at most 5,000 items per request." }, 413);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const hash = await sha256Hex(connectorKey);
  const { data: k, error: kErr } = await admin.from("mc_saas_pos_agent_keys")
    .select("id,business_id,name,permission,connection_id,revoked_at").eq("key_hash", hash).maybeSingle();
  if (kErr) return json({ error: "Connector storage is not installed. Run POS_CONNECTOR_V8_MIGRATION.sql." }, 500);
  if (!k || k.revoked_at) return json({ error: "This connector key is not valid or has been revoked." }, 401);

  const { data: biz } = await admin.from("mc_saas_businesses").select("id,company_name,slug,currency").eq("id", k.business_id).maybeSingle();
  if (!biz) return json({ error: "Business not found." }, 404);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const action = str(body.action || "sync");
  const touch = (summary?: unknown) =>
    admin.from("mc_saas_pos_agent_keys").update({ last_used_at: new Date().toISOString(), ...(summary ? { last_sync_summary: summary } : {}) }).eq("id", k.id);

  if (action === "ping") {
    await touch();
    return json({ ok: true, business: { name: biz.company_name, slug: biz.slug, currency: biz.currency }, key: { name: k.name, permission: k.permission } });
  }
  if (action !== "sync") return json({ error: "Unsupported action. Use 'ping' or 'sync'." }, 400);

  const items = Array.isArray(body.items) ? (body.items as Item[]) : null;
  if (!items) return json({ error: "'items' must be an array." }, 400);
  if (items.length > MAX_ITEMS) return json({ error: `Send at most ${MAX_ITEMS} items per request (split into batches).` }, 413);

  const dryRun = body.dry_run !== false;   // safe default: preview unless explicitly false
  let mode = str(body.sync_mode) === "price" ? "price" : "full";
  if (k.permission === "price") mode = "price";
  const includeStock = body.include_stock === true && k.permission === "full_stock";
  const markup = Number(body.markup_pct ?? 0);
  if (!Number.isFinite(markup) || markup < -100 || markup > 1000) return json({ error: "markup_pct must be between -100 and 1000." }, 400);
  const source = str(body.source) === "api" ? "api" : "local_agent";
  const adjust = (v: number | null) => (v === null ? null : round2(v * (1 + markup / 100)));

  // Load catalogue identifiers once.
  // The API returns at most 1000 rows per request, so read in pages (a catalogue can have thousands).
  async function readAll(table: string, cols: string) {
    const rows: any[] = [];
    for (let from = 0; from < 200000; from += 1000) {
      const { data, error } = await admin.from(table).select(cols).eq("business_id", biz!.id).order("id").range(from, from + 999);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { data: rows, error: null };
  }
  const { data: products, error: pErr } = await readAll("mc_saas_products", "id,name,category,barcode,sku,pos_product_id,label1,price1,label2,price2,pieces1,pieces2,sort_order");
  if (pErr || !products) return json({ error: "Could not read catalogue: " + (pErr?.message || "unknown") }, 500);
  type P = { id: string; name: string; category: string; barcode: string; sku: string; pos_product_id: string; label1: string; price1: number | null; label2: string; price2: number | null; pieces1: number | null; pieces2: number | null; sort_order: number };
  let units: { id: string; product_id: string; unit_name: string; barcode: string; is_base_unit: boolean; conversion_configured: boolean; is_active: boolean; selling_price: number | null }[] = [];
  const u = await readAll("mc_saas_product_units", "id,product_id,unit_name,barcode,is_base_unit,conversion_configured,is_active,selling_price");
  const unitsInstalled = !u.error;
  if (!u.error) units = u.data || [];
  // current stock, so unchanged quantities are not written again on every run
  const st = includeStock ? await readAll("mc_saas_product_stock", "id,product_id,physical_qty_base,stock_initialized") : { data: [], error: null };
  const stockNow = new Map<string, number>((st.data || []).filter((x: any) => x.stock_initialized).map((x: any) => [x.product_id, Number(x.physical_qty_base)]));

  const byBarcode = multiMap<any>(products || [], (p) => key(p.barcode));
  const byPosId = multiMap<any>(products || [], (p) => str(p.pos_product_id));
  const bySku = multiMap<any>(products || [], (p) => key(p.sku));
  const unitByBarcode = multiMap(units.filter((x) => x.is_active), (x) => key(x.barcode));
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const baseUnit = new Map(units.filter((x) => x.is_base_unit).map((x) => [x.product_id, x]));

  type Row = { i: number; action: "update" | "new" | "unchanged" | "skip"; reason?: string; product_id?: string; name?: string; match?: string; changes?: Record<string, unknown>; stock?: string };
  const out: Row[] = [];
  const updates = new Map<string, { product: P; payload: Record<string, unknown>; old: Record<string, unknown>; match: string }>();
  const unitPriceUpdates: { id: string; selling_price: number }[] = [];
  const inserts: Record<string, unknown>[] = [];
  const stockOps: { unit_id: string; qty: number; i: number }[] = [];
  const seenNewKeys = new Set<string>();
  const newStock = new Map<string, number>(); // pos id / barcode of a new product -> stock to set right after it is created
  let maxSort = (products || []).reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0);

  items.forEach((raw, i) => {
    const barcode = str(raw.barcode, 80), posId = str(raw.pos_product_id, 80), sku = str(raw.sku, 80);
    const name = str(raw.name, 200);
    const p1 = num(raw.price1), p2 = num(raw.price2), stock = num(raw.stock_qty);
    if ([p1, p2].some((v) => v !== null && (Number.isNaN(v) || v < 0))) { out.push({ i, action: "skip", reason: "Invalid price", name }); return; }
    // how many main (POS base) units each shown unit holds, e.g. Box = 270
    const pcs = (v: unknown) => { const n = num(v); return n !== null && Number.isFinite(n) && n > 0 ? round2(n) : null; };
    const pc1 = pcs(raw.pieces1), pc2 = pcs(raw.pieces2);
    const u1 = str(raw.unit1, 80), u2 = str(raw.unit2, 80);
    // the POS sends the full unit set (agent query with Unit1/Unit2): it decides labels, prices and sizes
    const unitSet = mode === "full" && !!u1 && raw.unit_only !== true;
    if (!barcode && !posId && !sku) { out.push({ i, action: "skip", reason: "No barcode, POS ID or SKU", name }); return; }

    // 1. unit barcode (multi-barcode products, e.g. AntiSoft packaging units)
    let product: P | undefined; let unit: (typeof units)[number] | undefined; let match = "";
    if (barcode) {
      const ub = unitByBarcode.get(key(barcode)) || [];
      if (ub.length > 1) { out.push({ i, action: "skip", reason: "Duplicate unit barcode in catalogue", name }); return; }
      if (ub.length === 1) { unit = ub[0]; product = productById.get(unit.product_id); match = unit.is_base_unit ? "Barcode" : "Unit barcode"; }
    }
    const pick = (m: Map<string, P[]>, k2: string, label: string) => {
      if (product || !k2) return true; const a = m.get(k2) || [];
      if (a.length > 1) { out.push({ i, action: "skip", reason: `Duplicate ${label} in catalogue — resolve manually`, name }); return false; }
      if (a.length === 1) { product = a[0]; match = label; } return true;
    };
    if (!pick(byBarcode, key(barcode), "Barcode")) return;
    if (!pick(byPosId, posId, "POS ID")) return;
    if (!pick(bySku, key(sku), "SKU")) return;

    if (product) {
      const prev = updates.get(product.id);
      const payload: Record<string, unknown> = prev ? prev.payload : {};
      const old: Record<string, unknown> = prev ? prev.old : {};
      const before = JSON.stringify(payload), unitCountBefore = unitPriceUpdates.length;
      const rowChanges: Record<string, unknown> = {};
      const set = (field: keyof P, value: unknown) => {
        if (value === null || value === undefined || value === "") return;
        if (String(product![field] ?? "") === String(value)) return;
        old[field as string] = product![field]; payload[field as string] = value; rowChanges[field as string] = value;
      };
      const setOrClear = (field: keyof P, value: unknown) => {
        const v = value === undefined ? null : value;
        if (String(product![field] ?? "") === String(v ?? "")) return;
        old[field as string] = product![field]; payload[field as string] = v; rowChanges[field as string] = v;
      };
      if (unitSet) {
        // e.g. Packet (45) + Box (270). A unit with no POS price becomes "price on request".
        setOrClear("label1", u1); setOrClear("price1", adjust(p1)); setOrClear("pieces1", pc1);
        setOrClear("label2", u2); setOrClear("price2", u2 ? adjust(p2) : null); setOrClear("pieces2", u2 ? pc2 : null);
      } else if (unit && !unit.is_base_unit) {
        // Price for a packaging unit (e.g. Box). Mirror into price2 when it is the product's 2nd label.
        const v = adjust(p1 ?? p2);
        if (v !== null && Number(unit.selling_price ?? NaN) !== v && !unitPriceUpdates.some((x) => x.id === unit!.id)) { unitPriceUpdates.push({ id: unit.id, selling_price: v }); rowChanges[unit.unit_name + " price"] = v; }
        if (v !== null && key(product.label2) === key(unit.unit_name)) set("price2", v);
      } else {
        set("price1", adjust(p1));
        set("price2", adjust(p2));
      }
      if (mode === "full") { // fill missing identifiers only — never overwrite catalogue content
        if (!str(product.barcode) && barcode && !unit) set("barcode", barcode);
        if (!str(product.pos_product_id) && posId) set("pos_product_id", posId);
        if (!str(product.sku) && sku && !(bySku.get(key(sku)) || []).length) set("sku", sku);
      }
      let stockNote = "";
      if (includeStock && stock !== null && !Number.isNaN(stock)) {
        // A negative POS quantity (sold before it was received) means nothing on the shelf: show as sold out.
        const qty = Math.max(0, stock);
        // with a full unit set the POS quantity is in its base unit = the catalogue's main stock unit
        const su = unitSet ? baseUnit.get(product.id) : (unit || baseUnit.get(product.id));
        if (su && su.is_base_unit && stockNow.get(product.id) === qty) stockNote = "stock " + qty + " (no change)";
        else if (su && (su.is_base_unit || su.conversion_configured)) { stockOps.push({ unit_id: su.id, qty, i }); stockNote = "stock " + qty + " " + su.unit_name + (stock < 0 ? " (POS shows " + stock + ")" : ""); }
        else stockNote = "stock skipped: unit conversion not verified";
      }
      const changed = JSON.stringify(payload) !== before || unitPriceUpdates.length !== unitCountBefore;
      if (Object.keys(payload).length) updates.set(product.id, { product, payload, old, match });
      out.push({ i, action: changed ? "update" : "unchanged", product_id: product.id, name: product.name, match, changes: changed ? rowChanges : undefined, stock: stockNote || undefined });
      return;
    }

    if (mode === "price") { out.push({ i, action: "skip", reason: "Not in catalogue (price-only mode never adds products)", name }); return; }
    if (!name) { out.push({ i, action: "skip", reason: "New product needs a name", name }); return; }
    const newKey = barcode ? "bc:" + key(barcode) : posId ? "pos:" + posId : "sku:" + key(sku);
    if (seenNewKeys.has(newKey)) { out.push({ i, action: "skip", reason: "Repeated in this batch", name }); return; }
    seenNewKeys.add(newKey);
    const unit1 = u1 || "Piece", unit2 = u2;
    maxSort += 1;
    inserts.push({
      business_id: biz.id, name, category: str(raw.category, 120) || "Products", description: str(raw.description, 2000),
      barcode, sku: sku && !(bySku.get(key(sku)) || []).length ? sku : "", pos_product_id: posId,
      label1: unit1, price1: adjust(p1), label2: unit2, price2: unit2 ? adjust(p2) : null,
      pieces1: pc1, pieces2: unit2 ? pc2 : null,
      sort_order: maxSort, is_active: raw.active === false ? false : true, updated_at: new Date().toISOString(),
    });
    if (includeStock && stock !== null && !Number.isNaN(stock)) newStock.set(posId ? "pos:" + posId : "bc:" + key(barcode), Math.max(0, stock));
    out.push({ i, action: "new", name });
  });

  const summary = {
    dry_run: dryRun, mode, received: items.length,
    updated: out.filter((r) => r.action === "update").length,
    added: out.filter((r) => r.action === "new").length,
    unchanged: out.filter((r) => r.action === "unchanged").length,
    skipped: out.filter((r) => r.action === "skip").length,
    stock_updates: stockOps.length + newStock.size, stock_available: unitsInstalled,
    errors: 0,
  };

  if (dryRun) {
    await touch({ ...summary, at: new Date().toISOString() });
    return json({ ok: true, summary, rows: out.slice(0, 5000), truncated: out.length > 5000 });
  }

  // ---------- apply ----------
  const errors: string[] = [];
  const { data: job } = await admin.from("mc_saas_sync_jobs").insert({
    business_id: biz.id, source_type: source, sync_mode: mode, status: "running", markup_pct: markup, rows_total: items.length,
    connection_id: k.connection_id || null,
  }).select("id").single();
  const jobId = job?.id || null;
  const now = new Date().toISOString();
  let updated = 0, added = 0;
  const changeLog: Record<string, unknown>[] = [];
  const created: { id: string; pos_product_id: string; barcode: string }[] = [];
  // runs that add products appear in Admin → Recent imports, so they can be undone like an Excel import
  let importBatch: string | null = null;
  if (inserts.length) {
    const { data: cats } = await admin.from("mc_saas_categories").select("name,image_url,sort_order").eq("business_id", biz.id);
    const { data: b } = await admin.from("mc_saas_import_batches").insert({
      business_id: biz.id, kind: "sync", file_name: "Live POS connector · " + k.name, sync_job_id: jobId, categories_before: cats || [],
    }).select("id").single();
    importBatch = b?.id || null;
    if (importBatch) for (const row of inserts) row.import_batch = importBatch;
  }

  for (const [id, x] of updates) {
    const { error } = await admin.from("mc_saas_products").update({ ...x.payload, updated_at: now }).eq("id", id).eq("business_id", biz.id);
    if (error) { errors.push(`${x.product.name}: ${error.message}`); continue; }
    updated++;
    if (changeLog.length < 2000) changeLog.push({ business_id: biz.id, job_id: jobId, product_id: id, match_method: "connector: " + x.match, old_values: x.old, new_values: x.payload });
  }
  for (const up of unitPriceUpdates) {
    const { error } = await admin.from("mc_saas_product_units").update({ selling_price: up.selling_price, updated_at: now }).eq("id", up.id).eq("business_id", biz.id);
    if (error) errors.push(`Unit ${up.id}: ${error.message}`);
  }
  for (let s = 0; s < inserts.length; s += 500) {
    const chunk = inserts.slice(s, s + 500);
    const { data, error } = await admin.from("mc_saas_products").insert(chunk).select("id,name,pos_product_id,barcode");
    if (error) {
      // fall back to one-by-one so one bad row does not block the rest
      for (const row of chunk) {
        const r = await admin.from("mc_saas_products").insert(row).select("id,pos_product_id,barcode").single();
        if (r.error) errors.push(`${row.name}: ${r.error.message}`); else { added++; created.push(r.data as any); if (changeLog.length < 2000) changeLog.push({ business_id: biz.id, job_id: jobId, product_id: r.data.id, match_method: "connector: new product", old_values: {}, new_values: row }); }
      }
    } else {
      added += (data || []).length;
      for (const d of data || []) created.push(d as any);
      for (const d of data || []) if (changeLog.length < 2000) changeLog.push({ business_id: biz.id, job_id: jobId, product_id: d.id, match_method: "connector: new product", old_values: {}, new_values: { name: d.name } });
    }
  }
  // stock for products created in this run (their base unit is made by a database trigger)
  if (newStock.size && created.length) {
    const ids = created.map((c) => c.id);
    // small chunks: a long id list makes the request URL too long and the lookup fails
    for (let s = 0; s < ids.length; s += 100) {
      const { data: bu, error: buErr } = await admin.from("mc_saas_product_units").select("id,product_id").eq("business_id", biz.id).eq("is_base_unit", true).in("product_id", ids.slice(s, s + 100));
      if (buErr) errors.push("Stock for new products: " + buErr.message);
      const unitOf = new Map((bu || []).map((x) => [x.product_id, x.id]));
      for (const c of created.slice(s, s + 100)) {
        const q = newStock.get(c.pos_product_id ? "pos:" + c.pos_product_id : "bc:" + key(c.barcode));
        const uid = unitOf.get(c.id);
        if (q !== undefined && uid) stockOps.push({ unit_id: uid, qty: q, i: -1 });
      }
    }
  }
  let stockDone = 0;
  for (const op of stockOps) {
    const { error } = await admin.rpc("mc_saas_pos_agent_stock_snapshot", {
      p_business_id: biz.id, p_product_unit_id: op.unit_id, p_quantity: op.qty, p_external_event_id: `agent-${jobId || now}-${op.unit_id}`,
    });
    if (error) errors.push(`Stock row ${op.i + 1}: ${error.message}`); else stockDone++;
  }
  for (let s = 0; s < changeLog.length; s += 500) await admin.from("mc_saas_sync_changes").insert(changeLog.slice(s, s + 500));

  const final = { ...summary, dry_run: false, updated, added, stock_updates: stockDone, errors: errors.length, at: now };
  if (jobId) await admin.from("mc_saas_sync_jobs").update({
    status: errors.length ? "completed_with_errors" : "completed", rows_updated: updated, rows_added: added, rows_failed: errors.length,
    completed_at: new Date().toISOString(), error_summary: errors.slice(0, 20),
  }).eq("id", jobId);
  if (k.connection_id) await admin.from("mc_saas_pos_connections").update({ last_sync_at: now, connection_status: errors.length ? "error" : "ready", last_error: errors[0] || "" }).eq("id", k.connection_id);
  await touch(final);
  return json({ ok: errors.length === 0, summary: final, job_id: jobId, errors: errors.slice(0, 50), rows: out.slice(0, 5000), truncated: out.length > 5000 });
});
