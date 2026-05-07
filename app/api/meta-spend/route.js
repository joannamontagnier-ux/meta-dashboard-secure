import crypto from "crypto";

function appSecretProof(accessToken) {
  return crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(accessToken)
    .digest("hex");
}

async function fetchAllPages(url) {
  let results = [];
  let nextUrl = url;
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const data = await response.json();
    if (data.error) {
      console.error("Meta API error:", data.error);
      break;
    }
    if (data.data) results = results.concat(data.data);
    nextUrl = data.paging?.next || null;
  }
  return results;
}

async function fetchSafe(url) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) { console.error("Meta API error:", data.error); return null; }
    return data;
  } catch (e) {
    console.error("fetchSafe error:", e);
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { accessToken, startDate, endDate } = body;
    const proof = appSecretProof(accessToken);
    const base = `access_token=${accessToken}&appsecret_proof=${proof}`;

    // ── 1. Récupérer tous les Business Managers accessibles ──────────────────
    const businesses = await fetchAllPages(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&limit=500&${base}`
    );

    // ── 2. Pour chaque BM : tous les comptes owned + client ──────────────────
    const allAccounts = []; // { account_id, name, businessName, businessId }

    for (const bm of businesses) {
      // Comptes détenus par ce BM
      const owned = await fetchAllPages(
        `https://graph.facebook.com/v19.0/${bm.id}/owned_ad_accounts?fields=id,name,account_id,account_status&limit=500&${base}`
      );
      for (const acc of owned) {
        const accountId = acc.account_id || acc.id?.replace("act_", "");
        if (!accountId) continue;
        if (!allAccounts.find((a) => a.account_id === accountId)) {
          allAccounts.push({ account_id: accountId, name: acc.name || `Compte ${accountId}`, businessName: bm.name, businessId: bm.id, status: acc.account_status });
        }
      }

      // Comptes clients rattachés à ce BM
      const clients = await fetchAllPages(
        `https://graph.facebook.com/v19.0/${bm.id}/client_ad_accounts?fields=id,name,account_id,account_status&limit=500&${base}`
      );
      for (const acc of clients) {
        const accountId = acc.account_id || acc.id?.replace("act_", "");
        if (!accountId) continue;
        if (!allAccounts.find((a) => a.account_id === accountId)) {
          allAccounts.push({ account_id: accountId, name: acc.name || `Compte ${accountId}`, businessName: bm.name, businessId: bm.id, status: acc.account_status });
        }
      }
    }

    // ── 3. Comptes directs rattachés au profil (hors BM) ─────────────────────
    const directAccounts = await fetchAllPages(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_id,account_status&limit=500&${base}`
    );
    for (const acc of directAccounts) {
      const accountId = acc.account_id || acc.id?.replace("act_", "");
      if (!accountId) continue;
      if (!allAccounts.find((a) => a.account_id === accountId)) {
        allAccounts.push({ account_id: accountId, name: acc.name || `Compte ${accountId}`, businessName: "Sans BM", businessId: null, status: acc.account_status });
      }
    }

    // ── 4. Pour chaque compte : récupérer les insights si période fournie ─────
    // Si pas de dates, on retourne la liste des comptes avec 0 dépenses
    // pour que le frontend puisse les afficher dans les filtres
    const rows = [];

    if (startDate && endDate) {
      const timeRange = encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }));

      await Promise.allSettled(
        allAccounts.map(async (account) => {
          const insights = await fetchAllPages(
            `https://graph.facebook.com/v19.0/act_${account.account_id}/insights?fields=campaign_name,spend,date_start,actions&level=campaign&time_increment=1&limit=500&time_range=${timeRange}&${base}`
          );

          for (const item of insights) {
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

            rows.push({
              businessName: account.businessName,
              businessId: account.businessId,
              accountName: account.name,
              accountId: account.account_id,
              campaignName: item.campaign_name || "Sans nom",
              spend: parseFloat(item.spend || 0),
              leads,
              date: item.date_start,
            });
          }
        })
      );
    }

    // ── 5. Retourner aussi la liste exhaustive des comptes et BM ──────────────
    // Le frontend peut l'utiliser pour peupler les filtres même sans dépenses
    const accountList = allAccounts.map((a) => ({
      accountId: a.account_id,
      accountName: a.name,
      businessName: a.businessName,
      businessId: a.businessId,
      status: a.status,
    }));

    return Response.json({ rows, accountList });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
