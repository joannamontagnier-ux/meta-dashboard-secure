import crypto from "crypto";

function appSecretProof(accessToken) {
  return crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(accessToken)
    .digest("hex");
}

async function fetchMeta(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
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

    return Response.json({ error: "ID introuvable. Vérifie qu'il s'agit d'un ID Meta valide et que tu as les droits d'accès." }, { status: 404 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || "Erreur serveur" }, { status: 500 });
  }
}
