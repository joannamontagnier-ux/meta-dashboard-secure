"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MARGIN_STORAGE_KEY = "meta-dashboard-margin-fields-v1";
const ROWS_STORAGE_KEY = "meta-dashboard-campaign-rows-v1";
const isDevelopment = process.env.NODE_ENV !== "production";

const demoRows = [
  {
    accountName: "Compte Meta - Demo Paris",
    campaignName: "Lead Gen - Paris - Audit solaire",
    spend: 1240.5,
    leads: 86,
    date: "2026-05-01",
  },
  {
    accountName: "Compte Meta - Demo Lyon",
    campaignName: "Conversion - Lyon - Devis isolation",
    spend: 890,
    leads: 58,
    date: "2026-05-02",
  },
  {
    accountName: "Compte Meta - Demo Bordeaux",
    campaignName: "Lead Gen - Bordeaux - Patrimoine",
    spend: 530.2,
    leads: 44,
    date: "2026-05-03",
  },
  {
    accountName: "Compte Meta - Demo Paris",
    campaignName: "Retargeting - Paris - Audit solaire",
    spend: 312.7,
    leads: 21,
    date: "2026-05-04",
  },
];

export default function Home() {
  const [token, setToken] = useState(null);
  const [rows, setRows] = useState(() => {
    if (typeof window === "undefined") return [];

    const saved = window.localStorage.getItem(ROWS_STORAGE_KEY);
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loadStatus, setLoadStatus] = useState("");
  const [marginFields, setMarginFields] = useState(() => {
    if (typeof window === "undefined") return {};

    const saved = window.localStorage.getItem(MARGIN_STORAGE_KEY);
    if (!saved) return {};

    try {
      return JSON.parse(saved);
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bmFilter, setBmFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [chartMode, setChartMode] = useState("day");
  const [activeView, setActiveView] = useState("global");
  const [chartReady, setChartReady] = useState(false);
  const [savingMargins, setSavingMargins] = useState(false);
  const [marginStorage, setMarginStorage] = useState("local-file");
  const [exportStatus, setExportStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const saveRequestRef = useRef(0);
  const importInputRef = useRef(null);

  useEffect(() => {
    async function loadSavedMargins() {
      try {
        const response = await fetch("/api/margins");
        const data = await response.json();

        if (data.margins) {
          setMarginFields(data.margins);
          window.localStorage.setItem(
            MARGIN_STORAGE_KEY,
            JSON.stringify(data.margins)
          );
        }

        if (data.storage) {
          setMarginStorage(data.storage);
        }
      } catch (error) {
        console.log(error);
      }
    }

    const frame = window.requestAnimationFrame(() => {
      setChartReady(true);
    });

    window.fbAsyncInit = function () {
      FB.init({
        appId: "1429673219178010",
        cookie: true,
        xfbml: true,
        version: "v19.0",
      });
    };

    (function (d, s, id) {
      let js;
      const fjs = d.getElementsByTagName(s)[0];

      if (d.getElementById(id)) return;

      js = d.createElement(s);
      js.id = id;
      js.src = "https://connect.facebook.net/fr_FR/sdk.js";

      fjs.parentNode.insertBefore(js, fjs);
    })(document, "script", "facebook-jssdk");

    loadSavedMargins();

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  async function saveMargins(nextFields) {
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;

    setSavingMargins(true);
    window.localStorage.setItem(
      MARGIN_STORAGE_KEY,
      JSON.stringify(nextFields)
    );

    try {
      const response = await fetch("/api/margins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ margins: nextFields }),
      });
      const data = await response.json();

      if (data.storage) {
        setMarginStorage(data.storage);
      }
    } catch (error) {
      console.log(error);
    } finally {
      if (saveRequestRef.current === requestId) {
        setSavingMargins(false);
      }
    }
  }

  function saveCampaignRows(nextRows) {
    setRows(nextRows);
    window.localStorage.setItem(ROWS_STORAGE_KEY, JSON.stringify(nextRows));
  }

  async function loginMeta() {
    if (window.location.protocol !== "https:") {
      alert(
        "Meta bloque la connexion depuis une page http://localhost. Utilise les données test en local, ou lance le site en HTTPS / déploie-le pour connecter Meta."
      );
      return;
    }

    FB.login(
      function (response) {
        if (response.authResponse) {
          setToken(response.authResponse.accessToken);
        } else {
          alert("Connexion refusée");
        }
      },
      {
        scope: "ads_read,business_management",
      }
    );
  }

  async function loadData() {
    if (!token) {
      alert("Connecte-toi à Meta");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/meta-spend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: token,
          startDate,
          endDate,
        }),
      });

      const data = await response.json();

      if (data.rows?.length > 0) {
        const nextRows = mergeCampaignRows(rows, data.rows);
        saveCampaignRows(nextRows);
        setLoadStatus(
          `${data.rows.length} campagne(s) chargée(s), ${nextRows.length} campagne(s) conservée(s) au total.`
        );
      } else {
        setLoadStatus(
          "Aucune campagne trouvée pour cette période. Les données affichées précédemment sont conservées."
        );
      }
    } catch (err) {
      console.log(err);
      setLoadStatus(
        "Erreur de chargement Meta. Les données affichées précédemment sont conservées."
      );
    }

    setLoading(false);
  }

  function loadDemoData() {
    const nextRows = mergeCampaignRows(rows, demoRows);
    saveCampaignRows(nextRows);

    const demoMarginFields = {
      [rowKey(demoRows[0])]: {
        client: "Helio Conseil",
        clientCpl: 42,
        validatedLeads: 61,
      },
      [rowKey(demoRows[1])]: {
        client: "Maison Reno",
        clientCpl: 55,
        validatedLeads: 39,
      },
      [rowKey(demoRows[2])]: {
        client: "Atlas Finance",
        clientCpl: 38,
        validatedLeads: 26,
      },
      [rowKey(demoRows[3])]: {
        client: "Helio Conseil",
        clientCpl: 42,
        validatedLeads: 17,
      },
    };

    setMarginFields(demoMarginFields);
    saveMargins(demoMarginFields);
  }

  function addManualRow() {
    const today = new Date().toISOString().slice(0, 10);
    const manualRow = {
      accountName: "Ligne manuelle",
      campaignName: `Campagne manuelle ${rows.length + 1}`,
      spend: 0,
      leads: 0,
      date: startDate || today,
      isManual: true,
    };
    const nextRows = mergeCampaignRows(rows, [manualRow]);

    saveCampaignRows(nextRows);
    setActiveView("global");
    setLoadStatus("Ligne manuelle ajoutée. Tu peux modifier ses champs dans le tableau.");
  }

  function updateManualRow(row, field, value) {
    const oldKey = rowKey(row);
    const nextValue = ["spend", "leads"].includes(field)
      ? asNumber(value)
      : value;
    const nextRow = {
      ...row,
      [field]: nextValue,
    };
    const nextRows = rows.map((item) =>
      rowKey(item) === oldKey ? nextRow : item
    );
    const newKey = rowKey(nextRow);

    saveCampaignRows(nextRows);

    if (oldKey !== newKey && marginFields[oldKey]) {
      const nextFields = {
        ...marginFields,
        [newKey]: marginFields[oldKey],
      };

      delete nextFields[oldKey];
      setMarginFields(nextFields);
      saveMargins(nextFields);
    }
  }

  function deleteManualRow(row) {
    const key = rowKey(row);
    const nextRows = rows.filter((item) => rowKey(item) !== key);
    const nextFields = { ...marginFields };

    delete nextFields[key];
    saveCampaignRows(nextRows);
    setMarginFields(nextFields);
    saveMargins(nextFields);
    setLoadStatus("Ligne manuelle supprimée.");
  }

  function updateMarginField(row, field, value) {
    const key = rowKey(row);
    const numericValue = Number.parseFloat(value || 0);
    const nextValue =
      field === "client"
        ? value
        : Number.isFinite(numericValue)
          ? numericValue
          : "";

    const nextFields = {
      ...marginFields,
      [key]: {
        ...marginFields[key],
        [field]: nextValue,
      },
    };

    setMarginFields(nextFields);
    saveMargins(nextFields);
  }

  async function importLeadsCsv(event) {
    const [file] = event.target.files;
    event.target.value = "";

    if (!file) return;

    if (rows.length === 0) {
      setImportStatus("Charge d'abord les campagnes Meta ou les données test.");
      return;
    }

    try {
      const importedRows = parseMarginCsv(await file.text());
      let matchedRows = 0;
      let unmatchedRows = 0;
      const nextFields = { ...marginFields };

      importedRows.forEach((importedRow) => {
        const matches = rows.filter((row) => {
          const campaignOk =
            normalizeText(row.campaignName) ===
            normalizeText(importedRow.campaignName);
          const dateOk = importedRow.date
            ? row.date === importedRow.date
            : true;
          const accountOk = importedRow.accountName
            ? normalizeText(row.accountName) ===
              normalizeText(importedRow.accountName)
            : true;

          return campaignOk && dateOk && accountOk;
        });

        if (matches.length === 0) {
          unmatchedRows += 1;
          return;
        }

        matches.forEach((row) => {
          const key = rowKey(row);

          nextFields[key] = {
            ...nextFields[key],
            client: importedRow.client,
            clientCpl: importedRow.clientCpl,
            validatedLeads: importedRow.validatedLeads,
          };
          matchedRows += 1;
        });
      });

      setMarginFields(nextFields);
      saveMargins(nextFields);
      setImportStatus(
        `${matchedRows} campagne(s) mise(s) à jour depuis le CSV${
          unmatchedRows > 0 ? ` · ${unmatchedRows} ligne(s) sans correspondance` : ""
        }.`
      );
    } catch (error) {
      console.log(error);
      setImportStatus(
        "Import impossible. Colonnes attendues : campagne, client, cpl_client, leads_valides."
      );
    }
  }

  const enrichedRows = useMemo(
    () =>
      rows.map((row) => {
        const manual = marginFields[rowKey(row)] || {};
        const inherited = findInheritedMarginFields(row, marginFields);
        const client = manual.client || inherited.client || "";
        const clientCpl = asNumber(
          manual.clientCpl || inherited.clientCpl
        );
        const validatedLeads = asNumber(manual.validatedLeads);
        const spend = asNumber(row.spend);
        const leads = asNumber(row.leads);
        const revenue = clientCpl * validatedLeads;
        const margin = revenue - spend;
        const roas = spend > 0 ? revenue / spend : 0;
        const realCostPerLead =
          validatedLeads > 0 ? spend / validatedLeads : 0;
        const alerts = getProfitAlerts({
          spend,
          leads,
          clientCpl,
          validatedLeads,
          margin,
          roas,
          realCostPerLead,
        });

        return {
          ...row,
          spend,
          leads,
          client,
          clientCpl,
          validatedLeads,
          revenue,
          margin,
          marginRate: revenue > 0 ? margin / revenue : 0,
          roas,
          realCostPerLead,
          alerts,
          alertCount: alerts.length,
        };
      }),
    [rows, marginFields]
  );

  const filteredRows = useMemo(
    () =>
      enrichedRows
        .filter((row) => {
          const bmOk = bmFilter ? row.accountName === bmFilter : true;
          const campaignOk = campaignFilter
            ? row.campaignName === campaignFilter
            : true;
          const clientOk = clientFilter ? row.client === clientFilter : true;
          const startOk = startDate ? row.date >= startDate : true;
          const endOk = endDate ? row.date <= endDate : true;
          const search = searchText.toLowerCase();
          const searchOk =
            search === "" ||
            row.accountName.toLowerCase().includes(search) ||
            row.campaignName.toLowerCase().includes(search) ||
            row.client.toLowerCase().includes(search);

          return (
            bmOk &&
            campaignOk &&
            clientOk &&
            startOk &&
            endOk &&
            searchOk
          );
        })
        .sort((a, b) => {
          return b.spend - a.spend;
        }),
    [
      enrichedRows,
      bmFilter,
      campaignFilter,
      clientFilter,
      startDate,
      endDate,
      searchText,
    ]
  );

  const totals = summarize(filteredRows);
  const alertRows = filteredRows.filter((row) => row.alertCount > 0);
  const uniqueAccounts = [...new Set(rows.map((r) => r.accountName))];
  const uniqueCampaigns = [...new Set(rows.map((r) => r.campaignName))];
  const uniqueClients = [
    ...new Set(enrichedRows.map((r) => r.client).filter(Boolean)),
  ].sort();
  const clientRows = groupBy(filteredRows, "client");
  const campaignRows = groupBy(filteredRows, "campaignName");
  const chartData = buildChartData(filteredRows, chartMode);

  const exportCsv = useCallback(async () => {
    if (filteredRows.length === 0) {
      setExportStatus("Aucune ligne à exporter. Charge les campagnes ou clique sur Données test.");
      return;
    }

    const headers = [
      "Compte",
      "Campagne",
      "Date",
      "Spend Meta",
      "Leads Meta",
      "Client",
      "CPL client",
      "Leads validés",
      "CA",
      "Marge",
      "Marge %",
      "ROAS",
      "Coût réel par lead",
      "Alertes",
    ];

    const csvRows = filteredRows.map((row) => [
      row.accountName,
      row.campaignName,
      row.date,
      row.spend,
      row.leads,
      row.client,
      row.clientCpl,
      row.validatedLeads,
      row.revenue,
      row.margin,
      row.marginRate,
      row.roas,
      row.realCostPerLead,
      row.alerts.join(", "),
    ]);

    const csv = [headers, ...csvRows]
      .map((cells) => cells.map(escapeCsvCell).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `meta-marges-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard.writeText(csv);
      setExportStatus(
        `${filteredRows.length} ligne(s) exportée(s). CSV aussi copié dans le presse-papiers.`
      );
    } catch {
      setExportStatus(
        `${filteredRows.length} ligne(s) exportée(s). Si le téléchargement est bloqué ici, teste dans Chrome/Safari.`
      );
    }
  }, [filteredRows]);

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <div style={heroStyle}>
          <p style={eyebrowStyle}>Meta Ads</p>
          <h1 style={titleStyle}>Dashboard dépenses & marge</h1>
        </div>

        <div style={panelStyle}>
          <div style={toolbarStyle}>
            <button onClick={loginMeta} style={primaryButtonStyle}>
              {token ? "Connecté à Meta" : "Connecter Meta"}
            </button>

            <button onClick={loadData} style={darkButtonStyle}>
              {loading ? "Chargement..." : "Charger les campagnes"}
            </button>

            <button onClick={addManualRow} style={secondaryButtonStyle}>
              Ajouter une ligne
            </button>

            {isDevelopment && (
              <button onClick={loadDemoData} style={secondaryButtonStyle}>
                Données test
              </button>
            )}

            <button
              onClick={() => importInputRef.current?.click()}
              style={secondaryButtonStyle}
            >
              Import leads CSV
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={importLeadsCsv}
              style={{ display: "none" }}
            />

            <button
              onClick={exportCsv}
              style={secondaryButtonStyle}
            >
              Export CSV
            </button>
          </div>

          <div style={filterGridStyle}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />

            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />

            <select
              value={bmFilter}
              onChange={(e) => setBmFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">Tous les comptes</option>
              {uniqueAccounts.map((acc) => (
                <option key={acc}>{acc}</option>
              ))}
            </select>

            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">Toutes les campagnes</option>
              {uniqueCampaigns.map((camp) => (
                <option key={camp}>{camp}</option>
              ))}
            </select>

            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="">Tous les clients</option>
              {uniqueClients.map((client) => (
                <option key={client}>{client}</option>
              ))}
            </select>

          </div>

          <input
            type="text"
            placeholder="Rechercher compte, client ou campagne..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ ...inputStyle, marginTop: "20px", width: "100%" }}
          />

          <div style={saveStatusStyle}>
            {savingMargins
              ? "Sauvegarde des marges..."
              : `Marges sauvegardées ${
                  marginStorage === "supabase"
                    ? "dans Supabase"
                    : "côté projet"
                }`}
            {exportStatus ? ` · ${exportStatus}` : ""}
            {importStatus ? ` · ${importStatus}` : ""}
            {loadStatus ? ` · ${loadStatus}` : ""}
          </div>
        </div>

        <div style={cardGridStyle}>
          <Card title="Spend Meta" value={formatMoney(totals.spend)} />
          <Card title="Leads Meta" value={formatNumber(totals.leads)} />
          <Card
            title="Leads validés"
            value={formatNumber(totals.validatedLeads)}
          />
          <Card title="CA" value={formatMoney(totals.revenue)} />
          <Card
            title="Marge"
            value={formatMoney(totals.margin)}
            danger={totals.margin < 0}
          />
          <Card
            title="Marge %"
            value={formatPercent(totals.marginRate)}
            danger={totals.marginRate < 0}
          />
          <Card title="ROAS" value={formatRatio(totals.roas)} />
          <Card
            title="Coût réel / lead"
            value={formatMoney(totals.realCostPerLead)}
          />
          <Card
            title="Alertes"
            value={formatNumber(alertRows.length)}
            danger={alertRows.length > 0}
          />
        </div>

        <div style={tabsStyle}>
          {[
            ["global", "Vue globale"],
            ["client", "Par client"],
            ["campaign", "Par campagne"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActiveView(value)}
              style={
                activeView === value ? activeTabStyle : inactiveTabStyle
              }
            >
              {label}
            </button>
          ))}
        </div>

        {activeView === "global" && (
          <div style={panelStyle}>
            <SectionTitle title="Campagnes enrichies" />
            {loading ? (
              <Loader />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Compte</Th>
                    <Th>Campagne</Th>
                    <Th>Date</Th>
                    <Th>Dépenses</Th>
                    <Th>Leads Meta</Th>
                    <Th>Client</Th>
                    <Th>CPL client</Th>
                    <Th>Leads validés</Th>
                    <Th>CA</Th>
                    <Th>Marge</Th>
                    <Th>Marge %</Th>
                    <Th>ROAS</Th>
                    <Th>Coût réel / lead</Th>
                    <Th>Alertes</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="15" style={emptyCellStyle}>
                        Aucune campagne à afficher avec les filtres actuels.
                        Tes marges restent sauvegardées dans Supabase.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => (
                      <tr key={`${rowKey(row)}-${index}`}>
                        <Td>
                          {row.isManual ? (
                            <input
                              value={row.accountName}
                              onChange={(e) =>
                                updateManualRow(
                                  row,
                                  "accountName",
                                  e.target.value
                                )
                              }
                              placeholder="Compte"
                              style={smallInputStyle}
                            />
                          ) : (
                            row.accountName
                          )}
                        </Td>
                        <Td strong>
                          {row.isManual ? (
                            <input
                              value={row.campaignName}
                              onChange={(e) =>
                                updateManualRow(
                                  row,
                                  "campaignName",
                                  e.target.value
                                )
                              }
                              placeholder="Campagne"
                              style={wideInputStyle}
                            />
                          ) : (
                            row.campaignName
                          )}
                        </Td>
                        <Td>
                          {row.isManual ? (
                            <input
                              type="date"
                              value={row.date}
                              onChange={(e) =>
                                updateManualRow(
                                  row,
                                  "date",
                                  e.target.value
                                )
                              }
                              style={smallInputStyle}
                            />
                          ) : (
                            row.date
                          )}
                        </Td>
                        <Td>
                          {row.isManual ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.spend || ""}
                              onChange={(e) =>
                                updateManualRow(
                                  row,
                                  "spend",
                                  e.target.value
                                )
                              }
                              placeholder="0"
                              style={smallInputStyle}
                            />
                          ) : (
                            formatMoney(row.spend)
                          )}
                        </Td>
                        <Td>
                          {row.isManual ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.leads || ""}
                              onChange={(e) =>
                                updateManualRow(
                                  row,
                                  "leads",
                                  e.target.value
                                )
                              }
                              placeholder="0"
                              style={smallInputStyle}
                            />
                          ) : (
                            formatNumber(row.leads)
                          )}
                        </Td>
                        <Td>
                          <input
                            value={row.client}
                            onChange={(e) =>
                              updateMarginField(
                                row,
                                "client",
                                e.target.value
                              )
                            }
                            placeholder="Client"
                            style={smallInputStyle}
                          />
                        </Td>
                        <Td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.clientCpl || ""}
                            onChange={(e) =>
                              updateMarginField(
                                row,
                                "clientCpl",
                                e.target.value
                              )
                            }
                            placeholder="0"
                            style={smallInputStyle}
                          />
                        </Td>
                        <Td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.validatedLeads || ""}
                            onChange={(e) =>
                              updateMarginField(
                                row,
                                "validatedLeads",
                                e.target.value
                              )
                            }
                            placeholder="0"
                            style={smallInputStyle}
                          />
                        </Td>
                        <Td>{formatMoney(row.revenue)}</Td>
                        <Td danger={row.margin < 0}>
                          {formatMoney(row.margin)}
                        </Td>
                        <Td danger={row.marginRate < 0}>
                          {formatPercent(row.marginRate)}
                        </Td>
                        <Td>{formatRatio(row.roas)}</Td>
                        <Td>{formatMoney(row.realCostPerLead)}</Td>
                        <Td>
                          <AlertBadges alerts={row.alerts} />
                        </Td>
                        <Td>
                          {row.isManual ? (
                            <button
                              type="button"
                              onClick={() => deleteManualRow(row)}
                              style={dangerButtonStyle}
                            >
                              Supprimer
                            </button>
                          ) : (
                            <span style={mutedTextStyle}>Meta</span>
                          )}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </div>
        )}

        {activeView === "client" && (
          <SummaryTable
            title="Performance par client"
            labelHeader="Client"
            rows={clientRows}
          />
        )}

        {activeView === "campaign" && (
          <SummaryTable
            title="Performance par campagne"
            labelHeader="Campagne"
            rows={campaignRows}
          />
        )}

        <div style={{ ...panelStyle, marginTop: "30px" }}>
          <div style={chartHeaderStyle}>
            <SectionTitle title="Dépenses par période" />

            <select
              value={chartMode}
              onChange={(e) => setChartMode(e.target.value)}
              style={{ ...inputStyle, maxWidth: "190px" }}
            >
              <option value="day">Jour</option>
              <option value="week">Semaine</option>
              <option value="month">Mois</option>
            </select>
          </div>

          <div style={{ width: "100%", height: "350px" }}>
            {chartReady && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="spend" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryTable({ title, labelHeader, rows }) {
  return (
    <div style={panelStyle}>
      <SectionTitle title={title} />
      <Table>
        <thead>
          <tr>
            <Th>{labelHeader}</Th>
            <Th>Dépenses</Th>
            <Th>Leads Meta</Th>
            <Th>Leads validés</Th>
            <Th>CA</Th>
            <Th>Marge</Th>
            <Th>Marge %</Th>
            <Th>ROAS</Th>
            <Th>Coût réel / lead</Th>
            <Th>Alertes</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <Td strong>{row.label}</Td>
              <Td>{formatMoney(row.spend)}</Td>
              <Td>{formatNumber(row.leads)}</Td>
              <Td>{formatNumber(row.validatedLeads)}</Td>
              <Td>{formatMoney(row.revenue)}</Td>
              <Td danger={row.margin < 0}>{formatMoney(row.margin)}</Td>
              <Td danger={row.marginRate < 0}>
                {formatPercent(row.marginRate)}
              </Td>
              <Td>{formatRatio(row.roas)}</Td>
              <Td>{formatMoney(row.realCostPerLead)}</Td>
              <Td danger={row.alertCount > 0}>
                {formatNumber(row.alertCount)}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ padding: "60px", textAlign: "center" }}>
      <div style={spinnerStyle} />
      <div style={loaderTitleStyle}>Chargement des dépenses Meta...</div>
      <div style={loaderTextStyle}>
        Récupération des comptes, campagnes et leads
      </div>
    </div>
  );
}

function SectionTitle({ title }) {
  return <h2 style={sectionTitleStyle}>{title}</h2>;
}

function Table({ children }) {
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={tableStyle}>{children}</table>
    </div>
  );
}

function Th({ children }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong, danger }) {
  return (
    <td
      style={{
        ...tdStyle,
        fontWeight: strong ? "bold" : "normal",
        color: danger ? "#b91c1c" : "#111827",
      }}
    >
      {children}
    </td>
  );
}

function AlertBadges({ alerts }) {
  if (!alerts.length) {
    return <span style={quietBadgeStyle}>OK</span>;
  }

  return (
    <div style={alertListStyle}>
      {alerts.map((alert) => (
        <span key={alert} style={alertBadgeStyle}>
          {alert}
        </span>
      ))}
    </div>
  );
}

function Card({ title, value, danger }) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
      <div
        style={{
          ...cardValueStyle,
          color: danger ? "#b91c1c" : "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function rowKey(row) {
  return `${row.accountName}__${row.campaignName}__${row.date}`;
}

function mergeCampaignRows(currentRows, incomingRows) {
  const rowsByKey = new Map();

  currentRows.forEach((row) => {
    rowsByKey.set(rowKey(row), row);
  });

  incomingRows.forEach((row) => {
    rowsByKey.set(rowKey(row), row);
  });

  return [...rowsByKey.values()];
}

function findInheritedMarginFields(row, marginFields) {
  const prefix = `${row.accountName}__${row.campaignName}__`;
  const match = Object.entries(marginFields).find(([key, values]) => {
    return (
      key.startsWith(prefix) &&
      (values.client || asNumber(values.clientCpl) > 0)
    );
  });

  if (!match) {
    return {};
  }

  return {
    client: match[1].client || "",
    clientCpl: match[1].clientCpl || 0,
  };
}

function asNumber(value) {
  const number = Number.parseFloat(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function getProfitAlerts(row) {
  const alerts = [];

  if (row.margin < 0) {
    alerts.push("Marge négative");
  }

  if (row.spend > 0 && row.roas < 1) {
    alerts.push("ROAS < 1");
  }

  if (row.clientCpl > 0 && row.realCostPerLead > row.clientCpl) {
    alerts.push("Coût réel > CPL");
  }

  if (row.leads > 0 && row.validatedLeads === 0) {
    alerts.push("0 lead validé");
  }

  return alerts;
}

function summarize(items) {
  const totals = items.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.leads += row.leads;
      acc.validatedLeads += row.validatedLeads;
      acc.revenue += row.revenue;
      acc.margin += row.margin;
      acc.alertCount += row.alertCount || 0;
      return acc;
    },
    {
      spend: 0,
      leads: 0,
      validatedLeads: 0,
      revenue: 0,
      margin: 0,
      alertCount: 0,
    }
  );

  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  totals.marginRate =
    totals.revenue > 0 ? totals.margin / totals.revenue : 0;
  totals.realCostPerLead =
    totals.validatedLeads > 0
      ? totals.spend / totals.validatedLeads
      : 0;

  return totals;
}

function groupBy(items, key) {
  const groups = items.reduce((acc, row) => {
    const label = row[key] || "Non renseigné";
    acc[label] = acc[label] || [];
    acc[label].push(row);
    return acc;
  }, {});

  return Object.entries(groups)
    .map(([label, groupRows]) => ({
      label,
      ...summarize(groupRows),
    }))
    .sort((a, b) => b.margin - a.margin);
}

function buildChartData(items, mode) {
  const groups = items.reduce((acc, row) => {
    const date = groupDate(row.date, mode);
    acc[date] = acc[date] || { date, spend: 0 };
    acc[date].spend += row.spend;
    return acc;
  }, {});

  return Object.values(groups).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
}

function groupDate(date, mode) {
  if (!date) return "Sans date";
  const parsed = new Date(date);

  if (mode === "month") {
    return date.slice(0, 7);
  }

  if (mode === "week") {
    const firstDay = new Date(parsed);
    firstDay.setDate(parsed.getDate() - parsed.getDay() + 1);
    return firstDay.toISOString().slice(0, 10);
  }

  return date;
}

function formatMoney(value) {
  return `${asNumber(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function formatNumber(value) {
  return asNumber(value).toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  });
}

function formatRatio(value) {
  return asNumber(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  return asNumber(value).toLocaleString("fr-FR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function escapeCsvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function parseMarginCsv(text) {
  const rows = parseCsvRows(text).filter((row) => row.some(Boolean));
  const headers = rows.shift()?.map((header) => normalizeHeader(header)) || [];

  const campaignIndex = findHeaderIndex(headers, [
    "campagne",
    "campaign",
    "campaign_name",
    "campaignname",
  ]);
  const clientIndex = findHeaderIndex(headers, ["client"]);
  const clientCplIndex = findHeaderIndex(headers, [
    "cpl_client",
    "cpl client",
    "client_cpl",
    "clientcpl",
  ]);
  const validatedLeadsIndex = findHeaderIndex(headers, [
    "leads_valides",
    "leads valides",
    "leads_validés",
    "leads validés",
    "validated_leads",
    "validatedleads",
  ]);
  const dateIndex = findHeaderIndex(headers, ["date", "jour", "day"]);
  const accountIndex = findHeaderIndex(headers, [
    "compte",
    "account",
    "account_name",
    "accountname",
  ]);

  if (
    [campaignIndex, clientIndex, clientCplIndex, validatedLeadsIndex].some(
      (index) => index === -1
    )
  ) {
    throw new Error("Colonnes CSV manquantes");
  }

  return rows.map((row) => ({
    accountName: accountIndex >= 0 ? row[accountIndex]?.trim() : "",
    campaignName: row[campaignIndex]?.trim() || "",
    date: dateIndex >= 0 ? normalizeDate(row[dateIndex]) : "",
    client: row[clientIndex]?.trim() || "",
    clientCpl: asNumber(row[clientCplIndex]),
    validatedLeads: asNumber(row[validatedLeadsIndex]),
  }));
}

function parseCsvRows(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  rows.push(row);
  return rows;
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const semicolons = firstLine.split(";").length;
  const commas = firstLine.split(",").length;
  return semicolons >= commas ? ";" : ",";
}

function findHeaderIndex(headers, names) {
  return headers.findIndex((header) => names.includes(header));
}

function normalizeHeader(value) {
  return normalizeText(value).replaceAll("-", "_");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const frenchDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frenchDate) {
    return `${frenchDate[3]}-${frenchDate[2]}-${frenchDate[1]}`;
  }

  return text;
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f3f4f6",
  padding: "40px",
  fontFamily: "Arial",
};

const heroStyle = {
  background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
  borderRadius: "18px",
  padding: "22px 28px",
  color: "white",
  marginBottom: "22px",
};

const eyebrowStyle = {
  margin: "0 0 8px",
  fontSize: "14px",
  fontWeight: "bold",
  textTransform: "uppercase",
};

const titleStyle = {
  fontSize: "34px",
  fontWeight: "bold",
  margin: 0,
};

const panelStyle = {
  background: "white",
  borderRadius: "30px",
  padding: "30px",
  marginBottom: "30px",
};

const toolbarStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "15px",
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "20px",
  marginTop: "30px",
};

const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "20px",
  marginBottom: "30px",
};

const tabsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  marginBottom: "30px",
};

const activeTabStyle = {
  background: "#111827",
  color: "white",
  border: "none",
  padding: "14px 20px",
  borderRadius: "14px",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
};

const inactiveTabStyle = {
  ...activeTabStyle,
  background: "white",
  color: "#111827",
  border: "1px solid #d1d5db",
};

const primaryButtonStyle = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "18px 30px",
  borderRadius: "15px",
  fontSize: "20px",
  fontWeight: "bold",
  cursor: "pointer",
};

const darkButtonStyle = {
  ...primaryButtonStyle,
  background: "#111827",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "white",
  color: "#111827",
  border: "1px solid #d1d5db",
};

const dangerButtonStyle = {
  border: "1px solid #fecaca",
  borderRadius: "12px",
  background: "#fee2e2",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "bold",
  padding: "10px 12px",
};

const mutedTextStyle = {
  color: "#9ca3af",
  fontSize: "13px",
};

const inputStyle = {
  padding: "18px",
  borderRadius: "15px",
  border: "1px solid #d1d5db",
  fontSize: "18px",
  color: "#111827",
  background: "white",
};

const saveStatusStyle = {
  marginTop: "14px",
  color: "#6b7280",
  fontSize: "14px",
};

const smallInputStyle = {
  ...inputStyle,
  width: "150px",
  padding: "12px",
  fontSize: "15px",
};

const wideInputStyle = {
  ...smallInputStyle,
  width: "240px",
};

const alertListStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  minWidth: "170px",
};

const alertBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "26px",
  borderRadius: "999px",
  background: "#fee2e2",
  color: "#991b1b",
  padding: "0 10px",
  fontSize: "12px",
  fontWeight: "bold",
  whiteSpace: "nowrap",
};

const quietBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "26px",
  borderRadius: "999px",
  background: "#dcfce7",
  color: "#166534",
  padding: "0 10px",
  fontSize: "12px",
  fontWeight: "bold",
};

const tableStyle = {
  width: "100%",
  minWidth: "1280px",
  borderCollapse: "collapse",
};

const thStyle = {
  textAlign: "left",
  padding: "18px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "14px",
  color: "#374151",
  background: "white",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "18px",
  borderBottom: "1px solid #f3f4f6",
  color: "#111827",
  background: "white",
  fontSize: "15px",
  verticalAlign: "middle",
};

const emptyCellStyle = {
  ...tdStyle,
  color: "#6b7280",
  textAlign: "center",
  padding: "42px 18px",
};

const cardStyle = {
  background: "white",
  borderRadius: "25px",
  padding: "28px",
};

const cardTitleStyle = {
  fontSize: "17px",
  color: "#6b7280",
  marginBottom: "10px",
};

const cardValueStyle = {
  fontSize: "36px",
  fontWeight: "bold",
  color: "#111827",
};

const sectionTitleStyle = {
  fontSize: "30px",
  margin: "0 0 20px",
  color: "#111827",
};

const chartHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginBottom: "20px",
};

const spinnerStyle = {
  width: "60px",
  height: "60px",
  border: "6px solid #dbeafe",
  borderTop: "6px solid #2563eb",
  borderRadius: "50%",
  margin: "0 auto",
  animation: "spin 1s linear infinite",
};

const loaderTitleStyle = {
  marginTop: "20px",
  fontSize: "22px",
  fontWeight: "bold",
  color: "#111827",
};

const loaderTextStyle = {
  marginTop: "10px",
  color: "#6b7280",
  fontSize: "16px",
};
