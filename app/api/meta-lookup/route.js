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

  if (code === 4 || code === 17 || code === 32 || code === 613)
    return "⏱ Limite de requêtes Meta atteinte. Attends quelques minutes et réessaie.";
  if (code === 190) {
    if (subcode === 463) return "🔑 Session Meta expirée. Déconnecte-toi et reconnecte-toi.";
    if (subcode === 460) return "🔑 Mot de passe Meta changé. Reconnecte-toi.";
    return "🔑 Token Meta invalide ou expiré. Reconnecte-toi à Meta.";
  }
  if (code === 200 || code === 10 || code === 3)
    return "🚫 Permission refusée. Vérifie que l'app a accès à 'ads_read' et 'business_management'.";
  if (code === 100 && msg.toLowerCase().includes("does not exist"))
    return "🔍 ID introuvable. Vérifie qu'il s'agit d'un ID Meta valide et que tu as les droits d'accès.";
  if (code === 273)
    return "🚫 Accès refusé à ce compte. Il est peut-être archivé ou tu n'as plus les droits.";
  if (msg) return `❌ Erreur Meta : ${msg}`;
  return "❌ Erreur Meta inconnue. Réessaie ou reconnecte-toi.";
}

async function fetchMeta(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(parseMetaError(data.error));
  return data;
}

export async function POST(request) {
  try {
    const { accessToken, metaId } = await request.json();
    if (!accessToken || !metaId) {
      return Response.json({ error: "accessToken et metaId requis" }, { status: 400 });
    }

    const proof = crypto
      .createHmac("sha256", process.env.META_APP_SECRET)
      .update(accessToken)
      .digest("hex");

    const base = `access_token=${accessToken}&appsecret_proof=${proof}`;
    const id = metaId.trim();

    // On essaie les 3 types dans l'ordre : ad → adset → campaign
    // Chaque appel retourne les infos + les parents via les champs imbriqués

    // ── 1. Essai en tant que Ad ───────────────────────────────────────────────
    try {
      const ad = await fetchMeta(
        `https://graph.facebook.com/v19.0/${id}?fields=id,name,status,adset{id,name,campaign{id,name,account_id}},account_id&${base}`
      );

      if (ad.adset) {
        // Récupérer le compte pub
        const accountId = ad.account_id || ad.adset?.campaign?.account_id;
        let accountName = accountId ? `act_${accountId}` : "—";
        let businessName = "—";

        if (accountId) {
          try {
            const account = await fetchMeta(
              `https://graph.facebook.com/v19.0/act_${accountId}?fields=name,business{id,name}&${base}`
            );
            accountName = account.name || accountName;
            businessName = account.business?.name || "Sans BM";
          } catch {}
        }

        return Response.json({
          type: "Ad (Publicité)",
          id: ad.id,
          name: ad.name,
          status: ad.status,
          adSet: { id: ad.adset?.id, name: ad.adset?.name },
          campaign: { id: ad.adset?.campaign?.id, name: ad.adset?.campaign?.name },
          account: { id: accountId, name: accountName },
          business: { name: businessName },
        });
      }
    } catch {}

    // ── 2. Essai en tant que Ad Set ───────────────────────────────────────────
    try {
      const adset = await fetchMeta(
        `https://graph.facebook.com/v19.0/${id}?fields=id,name,status,campaign{id,name,account_id},account_id&${base}`
      );

      if (adset.campaign) {
        const accountId = adset.account_id || adset.campaign?.account_id;
        let accountName = accountId ? `act_${accountId}` : "—";
        let businessName = "—";

        if (accountId) {
          try {
            const account = await fetchMeta(
              `https://graph.facebook.com/v19.0/act_${accountId}?fields=name,business{id,name}&${base}`
            );
            accountName = account.name || accountName;
            businessName = account.business?.name || "Sans BM";
          } catch {}
        }

        return Response.json({
          type: "Ad Set (Ensemble de publicités)",
          id: adset.id,
          name: adset.name,
          status: adset.status,
          adSet: { id: adset.id, name: adset.name },
          campaign: { id: adset.campaign?.id, name: adset.campaign?.name },
          account: { id: accountId, name: accountName },
          business: { name: businessName },
        });
      }
    } catch {}

    // ── 3. Essai en tant que Campaign ─────────────────────────────────────────
    try {
      const campaign = await fetchMeta(
        `https://graph.facebook.com/v19.0/${id}?fields=id,name,status,account_id&${base}`
      );

      if (campaign.account_id) {
        let accountName = `act_${campaign.account_id}`;
        let businessName = "—";

        try {
          const account = await fetchMeta(
            `https://graph.facebook.com/v19.0/act_${campaign.account_id}?fields=name,business{id,name}&${base}`
          );
          accountName = account.name || accountName;
          businessName = account.business?.name || "Sans BM";
        } catch {}

        return Response.json({
          type: "Campagne",
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          adSet: null,
          campaign: { id: campaign.id, name: campaign.name },
          account: { id: campaign.account_id, name: accountName },
          business: { name: businessName },
        });
      }
    } catch {}

    return Response.json({ error: "🔍 ID introuvable. Vérifie qu'il s'agit d'un ID Meta valide et que tu as les droits d'accès." }, { status: 404 });

  } catch (error) {
    console.error(error);
    const message = error.message?.startsWith("🔑") || error.message?.startsWith("⏱") || error.message?.startsWith("🚫") || error.message?.startsWith("🔍") || error.message?.startsWith("❌")
      ? error.message
      : `❌ Erreur serveur : ${error.message || "Réessaie."}`;
    return Response.json({ error: message }, { status: 500 });
  }
}
