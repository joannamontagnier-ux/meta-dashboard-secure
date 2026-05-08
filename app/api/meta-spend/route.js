import crypto from "crypto";

function appSecretProof(accessToken) {
  return crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(accessToken)
    .digest("hex");
}

function parseMetaError(error) {
  if (!error) return "Erreur inconnue.";
  const code = error.code;
  const subcode = error.error_subcode;
  const msg = error.message || "";

  // Rate limit
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "⏱ Limite de requêtes Meta atteinte. Attends quelques minutes et réessaie.";
  }
  // Token expiré ou invalide
  if (code === 190) {
    if (subcode === 463) return "🔑 Session Meta expirée. Déconnecte-toi et reconnecte-toi.";
    if (subcode === 460) return "🔑 Mot de passe Meta changé. Reconnecte-toi.";
    return "🔑 Token Meta invalide ou expiré. Reconnecte-toi à Meta.";
  }
  // Permission refusée
  if (code === 200 || code === 10 || code === 3) {
    return "🚫 Permission refusée. Vérifie que l'app a accès à 'ads_read' et 'business_management'.";
  }
  // Compte inactif ou suspendu
  if (code === 275 || code === 100 && msg.includes("disabled")) {
    return "⛔ Ce compte publicitaire est inactif ou suspendu sur Meta.";
  }
  // Compte non trouvé
  if (code === 100) {
    return "🔍 Compte introuvable. Vérifie que tu as bien accès à ce compte Meta.";
  }
  // Accès au compte refusé
  if (code === 273) {
    return "🚫 Accès refusé à ce compte publicitaire. Il est peut-être archivé ou tu n'as plus les droits.";
  }
  // Erreur générique avec message
  if (msg) return `❌ Erreur Meta : ${msg}`;
  return "❌ Erreur Meta inconnue. Réessaie ou reconnecte-toi.";
}

async function fetchAllPages(url) {
  let results = [];
  let nextUrl = url;
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const data = await response.json();
    if (data.error) {
      const friendly = parseMetaError(data.error);
      console.error("Meta API error:", data.error);
      throw new Error(friendly);
    }
    if (data.data) results = results.concat(data.data);
    nextUrl = data.paging?.next || null;
  }
  return results;
}

async function fetchAllPagesSafe(url) {
  try {
    return await fetchAllPages(url);
  } catch (e) {
    console.error("fetchAllPagesSafe:", e.message);
    return [];
  }
}

// ── Cache Supabase ────────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseKey);
const CACHE_TTL_MINUTES = 60;

function supabaseHeaders() {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
  };
}

async function getCachedRows(userId, startDate, endDate) {
  if (!useSupabase || !userId) return null;

  const cacheKey = `${userId}__${startDate}__${endDate}`;
  const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000).toISOString();

  const res = await fetch(
    `${supabaseUrl}/rest/v1/meta_spend_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&updated_at=gte.${encodeURIComponent(cutoff)}&select=rows_json`,
    { headers: supabaseHeaders(), cache: "no-store" }
  );
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.length) return null;

  try {
    return JSON.parse(data[0].rows_json);
  } catch {
    return null;
  }
}

async function setCachedRows(userId, startDate, endDate, rows) {
  if (!useSupabase || !userId) return;

  const cacheKey = `${userId}__${startDate}__${endDate}`;

  await fetch(
    `${supabaseUrl}/rest/v1/meta_spend_cache?on_conflict=cache_key`,
    {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        cache_key: cacheKey,
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        rows_json: JSON.stringify(rows),
        updated_at: new Date().toISOString(),
      }),
    }
  );
}

// ── Récupération des comptes ──────────────────────────────────────────────────

async function fetchAllAccounts(accessToken, proof) {
  const base = `access_token=${accessToken}&appsecret_proof=${proof}`;

  // 1. BM en parallèle avec comptes directs
  const [businesses, directAccounts] = await Promise.all([
    fetchAllPages(`https://graph.facebook.com/v19.0/me/businesses?fields=id,name&limit=500&${base}`),
    fetchAllPages(`https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_id,account_status&limit=500&${base}`),
  ]);

  const allAccounts = [];
  const seenIds = new Set();

  // 2. Pour chaque BM, owned + client en parallèle
  if (businesses.length > 0) {
    await Promise.all(
      businesses.map(async (bm) => {
        const [owned, clients] = await Promise.all([
          fetchAllPagesSafe(`https://graph.facebook.com/v19.0/${bm.id}/owned_ad_accounts?fields=id,name,account_id,account_status&limit=500&${base}`),
          fetchAllPagesSafe(`https://graph.facebook.com/v19.0/${bm.id}/client_ad_accounts?fields=id,name,account_id,account_status&limit=500&${base}`),
        ]);

        [...owned, ...clients].forEach((acc) => {
          const accountId = acc.account_id || acc.id?.replace("act_", "");
          if (!accountId || seenIds.has(accountId)) return;
          seenIds.add(accountId);
          allAccounts.push({
            account_id: accountId,
            name: acc.name || `Compte ${accountId}`,
            businessName: bm.name,
            businessId: bm.id,
            status: acc.account_status,
          });
        });
      })
    );
  }

  // 3. Comptes directs hors BM
  directAccounts.forEach((acc) => {
    const accountId = acc.account_id || acc.id?.replace("act_", "");
    if (!accountId || seenIds.has(accountId)) return;
    seenIds.add(accountId);
    allAccounts.push({
      account_id: accountId,
      name: acc.name || `Compte ${accountId}`,
      businessName: "Sans BM",
      businessId: null,
      status: acc.account_status,
    });
  });

  return allAccounts;
}

// ── Récupération des insights ─────────────────────────────────────────────────

async function fetchInsightsForAccounts(accounts, accessToken, proof, startDate, endDate) {
  const base = `access_token=${accessToken}&appsecret_proof=${proof}`;
  const timeRange = encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }));
  const rows = [];

  // Paralléliser par lots de 5 pour éviter le rate limit Meta
  const BATCH_SIZE = 5;
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (account) => {
        const insights = await fetchAllPagesSafe(
          `https://graph.facebook.com/v19.0/act_${account.account_id}/insights?fields=campaign_name,spend,date_start,actions&level=campaign&time_increment=1&limit=500&time_range=${timeRange}&${base}`
        );

        return insights.map((item) => {
          const leads = item.actions?.reduce((total, action) => {
            const leadActions = [
              "lead",
              "onsite_conversion.lead_grouped",
              "onsite_conversion.messaging_conversation_started_7d",
            ];
            return leadActions.includes(action.action_type)
              ? total + parseFloat(action.value || 0)
              : total;
          }, 0) || 0;

          return {
            businessName: account.businessName,
            businessId: account.businessId,
            accountName: account.name,
            accountId: account.account_id,
            campaignName: item.campaign_name || "Sans nom",
            spend: parseFloat(item.spend || 0),
            leads,
            date: item.date_start,
          };
        });
      })
    );

    batchResults.forEach((result) => {
      if (result.status === "fulfilled") rows.push(...result.value);
      else console.error("Batch error:", result.reason);
    });
  }

  return rows;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json();
    const { accessToken, startDate, endDate, userId, forceRefresh } = body;
    const proof = appSecretProof(accessToken);

    // 1. Vérifier le cache (sauf si forceRefresh)
    if (!forceRefresh && startDate && endDate) {
      const cached = await getCachedRows(userId, startDate, endDate);
      if (cached) {
        console.log(`Cache hit pour ${userId} ${startDate}-${endDate}`);
        const accounts = await fetchAllAccounts(accessToken, proof);
        const accountList = accounts.map((a) => ({
          accountId: a.account_id,
          accountName: a.name,
          businessName: a.businessName,
          businessId: a.businessId,
          status: a.status,
        }));
        return Response.json({ rows: cached, accountList, fromCache: true });
      }
    }

    // 2. Récupérer tous les comptes en parallèle
    const allAccounts = await fetchAllAccounts(accessToken, proof);

    const accountList = allAccounts.map((a) => ({
      accountId: a.account_id,
      accountName: a.name,
      businessName: a.businessName,
      businessId: a.businessId,
      status: a.status,
    }));

    // 3. Récupérer les insights si période fournie
    let rows = [];
    if (startDate && endDate) {
      rows = await fetchInsightsForAccounts(allAccounts, accessToken, proof, startDate, endDate);

      // 4. Mettre en cache
      if (rows.length > 0) {
        await setCachedRows(userId, startDate, endDate, rows).catch(console.error);
      }
    }

    const warnings = [];
    if (rows.length === 0 && allAccounts.length > 0) {
      warnings.push("Aucune dépense trouvée sur cette période pour les comptes accessibles.");
    }

    return Response.json({ rows, accountList, fromCache: false, warnings });
  } catch (error) {
    console.error(error);
    const message = error.message || "Erreur serveur";
    return Response.json({ error: message }, { status: 500 });
  }
}
