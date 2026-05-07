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
      console.error(data.error);
      break;
    }

    if (data.data) {
      results = results.concat(data.data);
    }

    nextUrl = data.paging?.next || null;
  }

  return results;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const { accessToken, startDate, endDate } = body;

    const proof = appSecretProof(accessToken);

    const adAccounts = await fetchAllPages(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id&limit=500&access_token=${accessToken}&appsecret_proof=${proof}`
    );

    let rows = [];

    for (const account of adAccounts) {
      const timeRange = encodeURIComponent(
        JSON.stringify({
          since: startDate,
          until: endDate,
        })
      );

     const insights = await fetchAllPages(
  `https://graph.facebook.com/v19.0/act_${account.account_id}/insights?fields=campaign_name,spend,date_start,actions&level=campaign&time_increment=1&limit=500&time_range=${timeRange}&access_token=${accessToken}&appsecret_proof=${proof}`

      );

      for (const item of insights) {
 const leads =
  item.actions?.reduce((total, action) => {
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
  accountName: account.name,
  campaignName: item.campaign_name || "Sans nom",
  spend: parseFloat(item.spend || 0),
  leads,
  date: item.date_start,
});
      }
    }

    return Response.json({ rows });
  } catch (error) {
    console.error(error);

    return Response.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
