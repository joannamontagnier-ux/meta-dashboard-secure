import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const marginsFile = path.join(process.cwd(), "data", "margins.json");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);

function supabaseEndpoint(query = "") {
  return `${supabaseUrl}/rest/v1/campaign_margins${query}`;
}

function supabaseHeaders(extraHeaders = {}) {
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

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

async function readSupabaseMargins() {
  const response = await fetch(
    supabaseEndpoint("?select=campaign_key,client,client_cpl,validated_leads"),
    {
      headers: supabaseHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

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

async function writeSupabaseMargins(margins) {
  const rows = Object.entries(margins).map(([campaignKey, values]) => ({
    campaign_key: campaignKey,
    client: values.client || "",
    client_cpl: Number(values.clientCpl || 0),
    validated_leads: Number(values.validatedLeads || 0),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return;
  }

  const response = await fetch(supabaseEndpoint("?on_conflict=campaign_key"), {
    method: "POST",
    headers: supabaseHeaders({
      Prefer: "resolution=merge-duplicates",
    }),
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function readMargins() {
  return useSupabase ? readSupabaseMargins() : readLocalMargins();
}

async function writeMargins(margins) {
  if (useSupabase) {
    await writeSupabaseMargins(margins);
    return;
  }

  await writeLocalMargins(margins);
}

export async function GET() {
  try {
    return NextResponse.json({
      margins: await readMargins(),
      storage: useSupabase ? "supabase" : "local-file",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Impossible de lire les marges" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const margins = body.margins || {};

    if (!margins || typeof margins !== "object" || Array.isArray(margins)) {
      return NextResponse.json(
        { error: "Format de marges invalide" },
        { status: 400 }
      );
    }

    await writeMargins(margins);
    return NextResponse.json({
      success: true,
      margins,
      storage: useSupabase ? "supabase" : "local-file",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Impossible de sauvegarder les marges" },
      { status: 500 }
    );
  }
}
