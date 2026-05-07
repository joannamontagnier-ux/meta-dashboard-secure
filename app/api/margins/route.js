import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const marginsFile = path.join(process.cwd(), "data", "margins.json");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);

function supabaseEndpoint(table, query = "") {
  return `${supabaseUrl}/rest/v1/${table}${query}`;
}

function supabaseHeaders(extraHeaders = {}) {
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

// ── Marges ────────────────────────────────────────────────────────────────────

async function readLocalMargins() {
  try {
    const file = await readFile(marginsFile, "utf8");
    const margins = JSON.parse(file);
    return margins && typeof margins === "object" ? margins : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeLocalMargins(margins) {
  await mkdir(path.dirname(marginsFile), { recursive: true });
  await writeFile(marginsFile, JSON.stringify(margins, null, 2));
}

async function readSupabaseMargins(userId) {
  const query = userId
    ? `?select=campaign_key,client,client_cpl,validated_leads&user_id=eq.${encodeURIComponent(userId)}`
    : "?select=campaign_key,client,client_cpl,validated_leads";

  const response = await fetch(supabaseEndpoint("campaign_margins", query), {
    headers: supabaseHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());

  const rows = await response.json();
  return rows.reduce((acc, row) => {
    acc[row.campaign_key] = {
      client: row.client || "",
      clientCpl: Number(row.client_cpl || 0),
      validatedLeads: Number(row.validated_leads || 0),
    };
    return acc;
  }, {});
}

async function writeSupabaseMargins(margins, userId) {
  const rows = Object.entries(margins).map(([campaignKey, values]) => ({
    campaign_key: campaignKey,
    user_id: userId || "default",
    client: values.client || "",
    client_cpl: Number(values.clientCpl || 0),
    validated_leads: Number(values.validatedLeads || 0),
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  const response = await fetch(
    supabaseEndpoint("campaign_margins", "?on_conflict=campaign_key"),
    {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify(rows),
    }
  );
  if (!response.ok) throw new Error(await response.text());
}

// ── Campagnes ─────────────────────────────────────────────────────────────────

async function readSupabaseCampaignRows(userId) {
  if (!userId) return [];

  const response = await fetch(
    supabaseEndpoint(
      "campaign_rows",
      `?select=campaign_key,business_name,business_id,account_name,account_id,campaign_name,spend,leads,date,is_manual&user_id=eq.${encodeURIComponent(userId)}&order=date.desc`
    ),
    { headers: supabaseHeaders(), cache: "no-store" }
  );
  if (!response.ok) throw new Error(await response.text());

  const rows = await response.json();
  return rows.map((r) => ({
    businessName: r.business_name || "Sans BM",
    businessId: r.business_id || null,
    accountName: r.account_name,
    accountId: r.account_id || null,
    campaignName: r.campaign_name,
    spend: Number(r.spend || 0),
    leads: Number(r.leads || 0),
    date: r.date,
    isManual: r.is_manual || false,
  }));
}

async function writeSupabaseCampaignRows(rows, userId) {
  if (!userId || !rows.length) return;

  const dbRows = rows.map((r) => ({
    user_id: userId,
    campaign_key: `${r.accountName}__${r.campaignName}__${r.date}`,
    business_name: r.businessName || "Sans BM",
    business_id: r.businessId || null,
    account_name: r.accountName,
    account_id: r.accountId || null,
    campaign_name: r.campaignName,
    spend: Number(r.spend || 0),
    leads: Number(r.leads || 0),
    date: r.date,
    is_manual: r.isManual || false,
    updated_at: new Date().toISOString(),
  }));

  const response = await fetch(
    supabaseEndpoint("campaign_rows", "?on_conflict=user_id,campaign_key"),
    {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify(dbRows),
    }
  );
  if (!response.ok) throw new Error(await response.text());
}

// ── Handlers GET / POST ───────────────────────────────────────────────────────

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const type = searchParams.get("type"); // "margins" | "rows" | null (= margins)

    if (type === "rows") {
      // Charger les campagnes depuis Supabase
      if (!useSupabase || !userId) {
        return NextResponse.json({ rows: [], storage: "local" });
      }
      const rows = await readSupabaseCampaignRows(userId);
      return NextResponse.json({ rows, storage: "supabase" });
    }

    // Par défaut : charger les marges
    const margins = useSupabase
      ? await readSupabaseMargins(userId)
      : await readLocalMargins();

    return NextResponse.json({
      margins,
      storage: useSupabase ? "supabase" : "local-file",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Impossible de lire les données" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const userId = body.userId;
    const type = body.type; // "margins" | "rows"

    if (type === "rows") {
      // Sauvegarder les campagnes dans Supabase
      if (!useSupabase) {
        return NextResponse.json({ success: true, storage: "local" });
      }
      await writeSupabaseCampaignRows(body.rows || [], userId);
      return NextResponse.json({ success: true, storage: "supabase" });
    }

    // Par défaut : sauvegarder les marges
    const margins = body.margins || {};
    if (!margins || typeof margins !== "object" || Array.isArray(margins)) {
      return NextResponse.json(
        { error: "Format de marges invalide" },
        { status: 400 }
      );
    }

    if (useSupabase) {
      await writeSupabaseMargins(margins, userId);
    } else {
      await writeLocalMargins(margins);
    }

    return NextResponse.json({
      success: true,
      margins,
      storage: useSupabase ? "supabase" : "local-file",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Impossible de sauvegarder les données" },
      { status: 500 }
    );
  }
}
