"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const MARGIN_STORAGE_KEY = "meta-dashboard-margin-fields-v1";
const ROWS_STORAGE_KEY = "meta-dashboard-campaign-rows-v1";
const isDevelopment = process.env.NODE_ENV !== "production";

const demoRows = [
  { accountName: "Compte Meta - Demo Paris", campaignName: "Lead Gen - Paris - Audit solaire", spend: 1240.5, leads: 86, date: "2026-05-01" },
  { accountName: "Compte Meta - Demo Lyon", campaignName: "Conversion - Lyon - Devis isolation", spend: 890, leads: 58, date: "2026-05-02" },
  { accountName: "Compte Meta - Demo Bordeaux", campaignName: "Lead Gen - Bordeaux - Patrimoine", spend: 530.2, leads: 44, date: "2026-05-03" },
  { accountName: "Compte Meta - Demo Paris", campaignName: "Retargeting - Paris - Audit solaire", spend: 312.7, leads: 21, date: "2026-05-04" },
];

export default function Home() {
  const [token, setToken] = useState(null);
  const [rows, setRows] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = window.localStorage.getItem(ROWS_STORAGE_KEY);
    if (!saved) return [];
    try { const parsed = JSON.parse(saved); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  });
  const [loadStatus, setLoadStatus] = useState("");
  const [marginFields, setMarginFields] = useState(() => {
    if (typeof window === "undefined") return {};
    const saved = window.localStorage.getItem(MARGIN_STORAGE_KEY);
    if (!saved) return {};
    try { return JSON.parse(saved); } catch { return {}; }
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
  const [chartMetric, setChartMetric] = useState("spend");
  const [chartReady, setChartReady] = useState(false);
  const [savingMargins, setSavingMargins] = useState(false);
  const [marginStorage, setMarginStorage] = useState("local-file");
  const [exportStatus, setExportStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [teamOnline, setTeamOnline] = useState([]);
  const saveRequestRef = useRef(0);
  const importInputRef = useRef(null);

  useEffect(() => {
    async function loadSavedMargins() {
      try {
        const response = await fetch("/api/margins");
        const data = await response.json();
        if (data.margins) {
          setMarginFields(data.margins);
          window.localStorage.setItem(MARGIN_STORAGE_KEY, JSON.stringify(data.margins));
        }
        if (data.storage) setMarginStorage(data.storage);
        if (data.user) setCurrentUser(data.user);
        if (data.teamOnline) setTeamOnline(data.teamOnline);
      } catch (error) { console.log(error); }
    }

    const frame = window.requestAnimationFrame(() => setChartReady(true));
    window.fbAsyncInit = function () {
      FB.init({ appId: "1429673219178010", cookie: true, xfbml: true, version: "v19.0" });
    };
    (function (d, s, id) {
      let js; const fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = "https://connect.facebook.net/fr_FR/sdk.js";
      fjs.parentNode.insertBefore(js, fjs);
    })(document, "script", "facebook-jssdk");
    loadSavedMargins();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function saveMargins(nextFields) {
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setSavingMargins(true);
    window.localStorage.setItem(MARGIN_STORAGE_KEY, JSON.stringify(nextFields));
    try {
      const response = await fetch("/api/margins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ margins: nextFields }),
      });
      const data = await response.json();
      if (data.storage) setMarginStorage(data.storage);
    } catch (error) { console.log(error); }
    finally { if (saveRequestRef.current === requestId) setSavingMargins(false); }
  }

  function saveCampaignRows(nextRows) {
    setRows(nextRows);
    window.localStorage.setItem(ROWS_STORAGE_KEY, JSON.stringify(nextRows));
  }

  async function loginMeta() {
    if (window.location.protocol !== "https:") {
      alert("Meta bloque la connexion depuis http://. Utilise les données test en local, ou déploie en HTTPS.");
      return;
    }
    FB.login((response) => {
      if (response.authResponse) setToken(response.authResponse.accessToken);
      else alert("Connexion refusée");
    }, { scope: "ads_read,business_management" });
  }

  async function loadData() {
    if (!token) { alert("Connecte-toi à Meta"); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/meta-spend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, startDate, endDate }),
      });
      const data = await response.json();
      if (data.rows?.length > 0) {
        const nextRows = mergeCampaignRows(rows, data.rows);
        saveCampaignRows(nextRows);
        setLoadStatus(`${data.rows.length} campagne(s) chargée(s), ${nextRows.length} au total.`);
      } else {
        setLoadStatus("Aucune campagne trouvée. Les données précédentes sont conservées.");
      }
    } catch (err) {
      console.log(err);
      setLoadStatus("Erreur de chargement Meta. Les données précédentes sont conservées.");
    }
    setLoading(false);
  }

  function loadDemoData() {
    const nextRows = mergeCampaignRows(rows, demoRows);
    saveCampaignRows(nextRows);
    const demoMarginFields = {
      [rowKey(demoRows[0])]: { client: "Helio Conseil", clientCpl: 42, validatedLeads: 61 },
      [rowKey(demoRows[1])]: { client: "Maison Reno", clientCpl: 55, validatedLeads: 39 },
      [rowKey(demoRows[2])]: { client: "Atlas Finance", clientCpl: 38, validatedLeads: 26 },
      [rowKey(demoRows[3])]: { client: "Helio Conseil", clientCpl: 42, validatedLeads: 17 },
    };
    setMarginFields(demoMarginFields);
    saveMargins(demoMarginFields);
  }

  function addManualRow() {
    const today = new Date().toISOString().slice(0, 10);
    const manualRow = { accountName: "Ligne manuelle", campaignName: `Campagne manuelle ${rows.length + 1}`, spend: 0, leads: 0, date: startDate || today, isManual: true };
    saveCampaignRows(mergeCampaignRows(rows, [manualRow]));
    setActiveView("global");
    setLoadStatus("Ligne manuelle ajoutée.");
  }

  function updateManualRow(row, field, value) {
    const oldKey = rowKey(row);
    const nextValue = ["spend", "leads"].includes(field) ? asNumber(value) : value;
    const nextRow = { ...row, [field]: nextValue };
    const nextRows = rows.map((item) => rowKey(item) === oldKey ? nextRow : item);
    const newKey = rowKey(nextRow);
    saveCampaignRows(nextRows);
    if (oldKey !== newKey && marginFields[oldKey]) {
      const nextFields = { ...marginFields, [newKey]: marginFields[oldKey] };
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
    const nextValue = field === "client" ? value : Number.isFinite(numericValue) ? numericValue : "";
    const nextFields = { ...marginFields, [key]: { ...marginFields[key], [field]: nextValue } };
    setMarginFields(nextFields);
    saveMargins(nextFields);
  }

  async function importLeadsCsv(event) {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    if (rows.length === 0) { setImportStatus("Charge d'abord les campagnes Meta."); return; }
    try {
      const importedRows = parseMarginCsv(await file.text());
      let matchedRows = 0, unmatchedRows = 0;
      const nextFields = { ...marginFields };
      importedRows.forEach((importedRow) => {
        const matches = rows.filter((row) => {
          const campaignOk = normalizeText(row.campaignName) === normalizeText(importedRow.campaignName);
          const dateOk = importedRow.date ? row.date === importedRow.date : true;
          const accountOk = importedRow.accountName ? normalizeText(row.accountName) === normalizeText(importedRow.accountName) : true;
          return campaignOk && dateOk && accountOk;
        });
        if (matches.length === 0) { unmatchedRows += 1; return; }
        matches.forEach((row) => {
          const key = rowKey(row);
          nextFields[key] = { ...nextFields[key], client: importedRow.client, clientCpl: importedRow.clientCpl, validatedLeads: importedRow.validatedLeads };
          matchedRows += 1;
        });
      });
      setMarginFields(nextFields);
      saveMargins(nextFields);
      setImportStatus(`${matchedRows} campagne(s) mise(s) à jour${unmatchedRows > 0 ? ` · ${unmatchedRows} sans correspondance` : ""}.`);
    } catch (error) {
      console.log(error);
      setImportStatus("Import impossible. Colonnes attendues : campagne, client, cpl_client, leads_valides.");
    }
  }

  const enrichedRows = useMemo(() =>
    rows.map((row) => {
      const manual = marginFields[rowKey(row)] || {};
      const inherited = findInheritedMarginFields(row, marginFields);
      const client = manual.client || inherited.client || "";
      const clientCpl = asNumber(manual.clientCpl || inherited.clientCpl);
      const validatedLeads = asNumber(manual.validatedLeads);
      const spend = asNumber(row.spend);
      const leads = asNumber(row.leads);
      const revenue = clientCpl * validatedLeads;
      const margin = revenue - spend;
      const roas = spend > 0 ? revenue / spend : 0;
      const realCostPerLead = validatedLeads > 0 ? spend / validatedLeads : 0;
      const alerts = getProfitAlerts({ spend, leads, clientCpl, validatedLeads, margin, roas, realCostPerLead });
      return { ...row, spend, leads, client, clientCpl, validatedLeads, revenue, margin, marginRate: revenue > 0 ? margin / revenue : 0, roas, realCostPerLead, alerts, alertCount: alerts.length };
    }), [rows, marginFields]);

  const filteredRows = useMemo(() =>
    enrichedRows.filter((row) => {
      const bmOk = bmFilter ? row.accountName === bmFilter : true;
      const campaignOk = campaignFilter ? row.campaignName === campaignFilter : true;
      const clientOk = clientFilter ? row.client === clientFilter : true;
      const startOk = startDate ? row.date >= startDate : true;
      const endOk = endDate ? row.date <= endDate : true;
      const search = searchText.toLowerCase();
      const searchOk = search === "" || row.accountName.toLowerCase().includes(search) || row.campaignName.toLowerCase().includes(search) || row.client.toLowerCase().includes(search);
      return bmOk && campaignOk && clientOk && startOk && endOk && searchOk;
    }).sort((a, b) => b.spend - a.spend),
    [enrichedRows, bmFilter, campaignFilter, clientFilter, startDate, endDate, searchText]);

  const totals = summarize(filteredRows);
  const alertRows = filteredRows.filter((row) => row.alertCount > 0);
  const uniqueAccounts = [...new Set(rows.map((r) => r.accountName))];
  const uniqueCampaigns = [...new Set(rows.map((r) => r.campaignName))];
  const uniqueClients = [...new Set(enrichedRows.map((r) => r.client).filter(Boolean))].sort();
  const clientRows = groupBy(filteredRows, "client");
  const campaignRows = groupBy(filteredRows, "campaignName");
  const chartData = buildChartData(filteredRows, chartMode);

  const exportCsv = useCallback(async () => {
    if (filteredRows.length === 0) { setExportStatus("Aucune ligne à exporter."); return; }
    const headers = ["Compte", "Campagne", "Date", "Spend Meta", "Leads Meta", "Client", "CPL client", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût réel par lead", "Alertes"];
    const csvRows = filteredRows.map((row) => [row.accountName, row.campaignName, row.date, row.spend, row.leads, row.client, row.clientCpl, row.validatedLeads, row.revenue, row.margin, row.marginRate, row.roas, row.realCostPerLead, row.alerts.join(", ")]);
    const csv = [headers, ...csvRows].map((cells) => cells.map(escapeCsvCell).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `meta-marges-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    try {
      await navigator.clipboard.writeText(csv);
      setExportStatus(`${filteredRows.length} ligne(s) exportée(s). CSV copié dans le presse-papiers.`);
    } catch { setExportStatus(`${filteredRows.length} ligne(s) exportée(s).`); }
  }, [filteredRows]);

  const metricOptions = [
    { value: "spend", label: "Dépenses" },
    { value: "revenue", label: "CA" },
    { value: "margin", label: "Marge" },
    { value: "roas", label: "ROAS" },
    { value: "leads", label: "Leads Meta" },
    { value: "validatedLeads", label: "Leads validés" },
  ];

  const chartColor = { spend: "#6366f1", revenue: "#10b981", margin: "#f59e0b", roas: "#3b82f6", leads: "#8b5cf6", validatedLeads: "#14b8a6" };

  return (
    <div style={appStyle}>
      {/* Sidebar */}
      <aside style={{ ...sidebarStyle, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}>
        <div style={sidebarHeaderStyle}>
          <span style={logoTextStyle}>MetaBoard</span>
          <button onClick={() => setSidebarOpen(false)} style={iconButtonStyle}>✕</button>
        </div>
        <nav style={navStyle}>
          {[["global", "📊", "Vue globale"], ["client", "👤", "Par client"], ["campaign", "📢", "Par campagne"], ["charts", "📈", "Graphiques"]].map(([v, icon, label]) => (
            <button key={v} onClick={() => { setActiveView(v); setSidebarOpen(false); }} style={activeView === v ? activeNavItemStyle : navItemStyle}>
              <span style={{ marginRight: "10px" }}>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div style={sidebarFooterStyle}>
          <div style={teamSectionStyle}>
            <p style={teamLabelStyle}>Équipe connectée</p>
            {teamOnline.length > 0 ? teamOnline.map((member, i) => (
              <div key={i} style={teamMemberStyle}>
                <div style={{ ...avatarStyle, background: avatarColors[i % avatarColors.length] }}>{member[0]?.toUpperCase()}</div>
                <span style={memberNameStyle}>{member}</span>
                <span style={onlineDotStyle} />
              </div>
            )) : (
              <div style={teamMemberStyle}>
                <div style={{ ...avatarStyle, background: "#6366f1" }}>{currentUser?.[0]?.toUpperCase() || "M"}</div>
                <span style={memberNameStyle}>{currentUser || "Vous"}</span>
                <span style={onlineDotStyle} />
              </div>
            )}
          </div>
          <div style={storageBadgeStyle}>
            <span style={{ fontSize: "11px", color: marginStorage === "supabase" ? "#10b981" : "#f59e0b" }}>
              {marginStorage === "supabase" ? "● Supabase sync" : "● Local storage"}
            </span>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div style={overlayStyle} onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div style={mainStyle}>
        {/* Top bar */}
        <header style={topbarStyle}>
          <div style={topbarLeftStyle}>
            <button onClick={() => setSidebarOpen(true)} style={menuButtonStyle}>☰</button>
            <span style={brandStyle}>MetaBoard</span>
          </div>
          <div style={topbarCenterStyle}>
            {[["global", "Vue globale"], ["client", "Par client"], ["campaign", "Par campagne"], ["charts", "Graphiques"]].map(([v, label]) => (
              <button key={v} onClick={() => setActiveView(v)} style={activeView === v ? activeTabPillStyle : tabPillStyle}>{label}</button>
            ))}
          </div>
          <div style={topbarRightStyle}>
            <button onClick={loginMeta} style={token ? connectedBtnStyle : connectBtnStyle}>
              {token ? "✓ Meta connecté" : "Connecter Meta"}
            </button>
          </div>
        </header>

        <div style={contentStyle}>
          {/* Filters panel */}
          <div style={filterPanelStyle}>
            <div style={filterRowStyle}>
              <div style={filterGroupStyle}>
                <label style={filterLabelStyle}>Du</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={filterInputStyle} />
              </div>
              <div style={filterGroupStyle}>
                <label style={filterLabelStyle}>Au</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={filterInputStyle} />
              </div>
              <div style={filterGroupStyle}>
                <label style={filterLabelStyle}>Compte</label>
                <select value={bmFilter} onChange={(e) => setBmFilter(e.target.value)} style={filterInputStyle}>
                  <option value="">Tous</option>
                  {uniqueAccounts.map((acc) => <option key={acc}>{acc}</option>)}
                </select>
              </div>
              <div style={filterGroupStyle}>
                <label style={filterLabelStyle}>Client</label>
                <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={filterInputStyle}>
                  <option value="">Tous</option>
                  {uniqueClients.map((client) => <option key={client}>{client}</option>)}
                </select>
              </div>
              <div style={{ ...filterGroupStyle, flex: 2 }}>
                <label style={filterLabelStyle}>Recherche</label>
                <input type="text" placeholder="Compte, client, campagne..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={filterInputStyle} />
              </div>
            </div>
            <div style={actionRowStyle}>
              <button onClick={loadData} style={primaryActionStyle} disabled={loading}>
                {loading ? "⏳ Chargement..." : "⬇ Charger les campagnes"}
              </button>
              <button onClick={addManualRow} style={secondaryActionStyle}>+ Ajouter une ligne</button>
              {isDevelopment && <button onClick={loadDemoData} style={secondaryActionStyle}>🎯 Données test</button>}
              <button onClick={() => importInputRef.current?.click()} style={secondaryActionStyle}>📥 Import CSV</button>
              <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={importLeadsCsv} style={{ display: "none" }} />
              <button onClick={exportCsv} style={secondaryActionStyle}>📤 Export CSV</button>
              <span style={statusTextStyle}>
                {savingMargins ? "⏳ Sauvegarde..." : "✓ Sauvegardé"}
                {loadStatus ? ` · ${loadStatus}` : ""}
                {exportStatus ? ` · ${exportStatus}` : ""}
                {importStatus ? ` · ${importStatus}` : ""}
              </span>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={kpiGridStyle}>
            <KpiCard label="Spend Meta" value={formatMoney(totals.spend)} icon="💸" color="#6366f1" />
            <KpiCard label="CA généré" value={formatMoney(totals.revenue)} icon="💰" color="#10b981" />
            <KpiCard label="Marge" value={formatMoney(totals.margin)} icon="📈" color={totals.margin < 0 ? "#ef4444" : "#f59e0b"} danger={totals.margin < 0} />
            <KpiCard label="Marge %" value={formatPercent(totals.marginRate)} icon="%" color={totals.marginRate < 0 ? "#ef4444" : "#3b82f6"} danger={totals.marginRate < 0} />
            <KpiCard label="ROAS" value={formatRatio(totals.roas)} icon="🎯" color="#8b5cf6" />
            <KpiCard label="Leads Meta" value={formatNumber(totals.leads)} icon="👥" color="#14b8a6" />
            <KpiCard label="Leads validés" value={formatNumber(totals.validatedLeads)} icon="✅" color="#10b981" />
            <KpiCard label="Coût réel / lead" value={formatMoney(totals.realCostPerLead)} icon="🏷" color="#f59e0b" />
            <KpiCard label="Alertes" value={formatNumber(alertRows.length)} icon="⚠️" color={alertRows.length > 0 ? "#ef4444" : "#10b981"} danger={alertRows.length > 0} />
          </div>

          {/* Vue globale */}
          {activeView === "global" && (
            <div style={tableCardStyle}>
              <div style={tableHeaderStyle}>
                <h2 style={sectionTitleStyle}>Campagnes enrichies</h2>
                <span style={rowCountStyle}>{filteredRows.length} ligne{filteredRows.length > 1 ? "s" : ""}</span>
              </div>
              {loading ? <Loader /> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={theadRowStyle}>
                        {["Compte", "Campagne", "Date", "Dépenses", "Leads Meta", "Client", "CPL client", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût / lead", "Alertes", "Action"].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr><td colSpan="15" style={emptyRowStyle}>Aucune campagne avec les filtres actuels.</td></tr>
                      ) : filteredRows.map((row, index) => (
                        <tr key={`${rowKey(row)}-${index}`} style={index % 2 === 0 ? trEvenStyle : trOddStyle}>
                          <td style={tdStyle}>{row.isManual ? <input value={row.accountName} onChange={(e) => updateManualRow(row, "accountName", e.target.value)} style={cellInputStyle} /> : <span style={accountBadgeStyle}>{row.accountName}</span>}</td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{row.isManual ? <input value={row.campaignName} onChange={(e) => updateManualRow(row, "campaignName", e.target.value)} style={{ ...cellInputStyle, width: "220px" }} /> : row.campaignName}</td>
                          <td style={tdStyle}>{row.isManual ? <input type="date" value={row.date} onChange={(e) => updateManualRow(row, "date", e.target.value)} style={cellInputStyle} /> : <span style={dateBadgeStyle}>{row.date}</span>}</td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{row.isManual ? <input type="number" min="0" step="0.01" value={row.spend || ""} onChange={(e) => updateManualRow(row, "spend", e.target.value)} placeholder="0" style={cellInputStyle} /> : formatMoney(row.spend)}</td>
                          <td style={tdStyle}>{row.isManual ? <input type="number" min="0" step="1" value={row.leads || ""} onChange={(e) => updateManualRow(row, "leads", e.target.value)} placeholder="0" style={cellInputStyle} /> : formatNumber(row.leads)}</td>
                          <td style={tdStyle}><input value={row.client} onChange={(e) => updateMarginField(row, "client", e.target.value)} placeholder="Client" style={cellInputStyle} /></td>
                          <td style={tdStyle}><input type="number" min="0" step="0.01" value={row.clientCpl || ""} onChange={(e) => updateMarginField(row, "clientCpl", e.target.value)} placeholder="0" style={cellInputStyle} /></td>
                          <td style={tdStyle}><input type="number" min="0" step="1" value={row.validatedLeads || ""} onChange={(e) => updateMarginField(row, "validatedLeads", e.target.value)} placeholder="0" style={cellInputStyle} /></td>
                          <td style={{ ...tdStyle, color: "#10b981", fontWeight: 600 }}>{formatMoney(row.revenue)}</td>
                          <td style={{ ...tdStyle, color: row.margin < 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>{formatMoney(row.margin)}</td>
                          <td style={{ ...tdStyle, color: row.marginRate < 0 ? "#ef4444" : "#374151" }}>{formatPercent(row.marginRate)}</td>
                          <td style={tdStyle}><RoasBadge value={row.roas} /></td>
                          <td style={tdStyle}>{formatMoney(row.realCostPerLead)}</td>
                          <td style={tdStyle}><AlertBadges alerts={row.alerts} /></td>
                          <td style={tdStyle}>{row.isManual ? <button type="button" onClick={() => deleteManualRow(row)} style={deleteBtnStyle}>Supprimer</button> : <span style={metaTagStyle}>Meta</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeView === "client" && <SummaryTable title="Performance par client" labelHeader="Client" rows={clientRows} />}
          {activeView === "campaign" && <SummaryTable title="Performance par campagne" labelHeader="Campagne" rows={campaignRows} />}

          {/* Charts view */}
          {activeView === "charts" && (
            <div style={chartsGridStyle}>
              <div style={chartCardStyle}>
                <div style={chartCardHeaderStyle}>
                  <h2 style={sectionTitleStyle}>Évolution dans le temps</h2>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={filterInputStyle}>
                      {metricOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <select value={chartMode} onChange={(e) => setChartMode(e.target.value)} style={filterInputStyle}>
                      <option value="day">Jour</option>
                      <option value="week">Semaine</option>
                      <option value="month">Mois</option>
                    </select>
                  </div>
                </div>
                <div style={{ height: "300px" }}>
                  {chartReady && chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => chartMetric === "roas" ? formatRatio(v) : chartMetric.includes("leads") || chartMetric === "leads" ? formatNumber(v) : formatMoney(v)} />
                        <Bar dataKey={chartMetric} fill={chartColor[chartMetric]} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div style={chartCardStyle}>
                <div style={chartCardHeaderStyle}>
                  <h2 style={sectionTitleStyle}>Spend vs CA vs Marge</h2>
                </div>
                <div style={{ height: "300px" }}>
                  {chartReady && chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={buildMultiChartData(filteredRows, chartMode)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => formatMoney(v)} />
                        <Legend />
                        <Line type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} dot={false} name="Spend" />
                        <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="CA" />
                        <Line type="monotone" dataKey="margin" stroke="#f59e0b" strokeWidth={2} dot={false} name="Marge" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div style={chartCardStyle}>
                <div style={chartCardHeaderStyle}>
                  <h2 style={sectionTitleStyle}>ROAS par client</h2>
                </div>
                <div style={{ height: "300px" }}>
                  {chartReady && clientRows.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={clientRows.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip formatter={(v) => formatRatio(v)} />
                        <Bar dataKey="roas" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="ROAS" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div style={chartCardStyle}>
                <div style={chartCardHeaderStyle}>
                  <h2 style={sectionTitleStyle}>Marge par client</h2>
                </div>
                <div style={{ height: "300px" }}>
                  {chartReady && clientRows.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={clientRows.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip formatter={(v) => formatMoney(v)} />
                        <Bar dataKey="margin" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Marge" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoasBadge({ value }) {
  const v = asNumber(value);
  const color = v >= 3 ? "#10b981" : v >= 1 ? "#f59e0b" : "#ef4444";
  return <span style={{ color, fontWeight: 600 }}>{formatRatio(v)}</span>;
}

function SummaryTable({ title, labelHeader, rows }) {
  return (
    <div style={tableCardStyle}>
      <div style={tableHeaderStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <span style={rowCountStyle}>{rows.length} ligne{rows.length > 1 ? "s" : ""}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              {[labelHeader, "Dépenses", "Leads Meta", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût / lead", "Alertes"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} style={i % 2 === 0 ? trEvenStyle : trOddStyle}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label || "Non renseigné"}</td>
                <td style={tdStyle}>{formatMoney(row.spend)}</td>
                <td style={tdStyle}>{formatNumber(row.leads)}</td>
                <td style={tdStyle}>{formatNumber(row.validatedLeads)}</td>
                <td style={{ ...tdStyle, color: "#10b981", fontWeight: 600 }}>{formatMoney(row.revenue)}</td>
                <td style={{ ...tdStyle, color: row.margin < 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>{formatMoney(row.margin)}</td>
                <td style={{ ...tdStyle, color: row.marginRate < 0 ? "#ef4444" : "#374151" }}>{formatPercent(row.marginRate)}</td>
                <td style={tdStyle}><RoasBadge value={row.roas} /></td>
                <td style={tdStyle}>{formatMoney(row.realCostPerLead)}</td>
                <td style={tdStyle}><span style={row.alertCount > 0 ? alertCountBadgeStyle : okBadgeStyle}>{formatNumber(row.alertCount)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color, danger }) {
  return (
    <div style={{ ...kpiCardStyle, borderTop: `3px solid ${color}` }}>
      <div style={kpiIconStyle}>{icon}</div>
      <div style={kpiLabelStyle}>{label}</div>
      <div style={{ ...kpiValueStyle, color: danger ? "#ef4444" : "#111827" }}>{value}</div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ padding: "60px", textAlign: "center" }}>
      <div style={spinnerStyle} />
      <div style={{ marginTop: "20px", fontSize: "18px", fontWeight: 600, color: "#111827" }}>Chargement des dépenses Meta...</div>
      <div style={{ marginTop: "8px", color: "#6b7280", fontSize: "14px" }}>Récupération des comptes, campagnes et leads</div>
    </div>
  );
}

function AlertBadges({ alerts }) {
  if (!alerts.length) return <span style={okBadgeStyle}>OK</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", minWidth: "150px" }}>
      {alerts.map((alert) => <span key={alert} style={alertBadgeStyle}>{alert}</span>)}
    </div>
  );
}

// --- helpers ---
function rowKey(row) { return `${row.accountName}__${row.campaignName}__${row.date}`; }
function mergeCampaignRows(currentRows, incomingRows) {
  const map = new Map();
  currentRows.forEach((r) => map.set(rowKey(r), r));
  incomingRows.forEach((r) => map.set(rowKey(r), r));
  return [...map.values()];
}
function findInheritedMarginFields(row, marginFields) {
  const prefix = `${row.accountName}__${row.campaignName}__`;
  const match = Object.entries(marginFields).find(([key, values]) => key.startsWith(prefix) && (values.client || asNumber(values.clientCpl) > 0));
  if (!match) return {};
  return { client: match[1].client || "", clientCpl: match[1].clientCpl || 0 };
}
function asNumber(value) { const n = Number.parseFloat(value || 0); return Number.isFinite(n) ? n : 0; }
function getProfitAlerts(row) {
  const alerts = [];
  if (row.margin < 0) alerts.push("Marge négative");
  if (row.spend > 0 && row.roas < 1) alerts.push("ROAS < 1");
  if (row.clientCpl > 0 && row.realCostPerLead > row.clientCpl) alerts.push("Coût réel > CPL");
  if (row.leads > 0 && row.validatedLeads === 0) alerts.push("0 lead validé");
  return alerts;
}
function summarize(items) {
  const totals = items.reduce((acc, row) => {
    acc.spend += row.spend; acc.leads += row.leads; acc.validatedLeads += row.validatedLeads;
    acc.revenue += row.revenue; acc.margin += row.margin; acc.alertCount += row.alertCount || 0;
    return acc;
  }, { spend: 0, leads: 0, validatedLeads: 0, revenue: 0, margin: 0, alertCount: 0 });
  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  totals.marginRate = totals.revenue > 0 ? totals.margin / totals.revenue : 0;
  totals.realCostPerLead = totals.validatedLeads > 0 ? totals.spend / totals.validatedLeads : 0;
  return totals;
}
function groupBy(items, key) {
  const groups = items.reduce((acc, row) => {
    const label = row[key] || "Non renseigné";
    acc[label] = acc[label] || [];
    acc[label].push(row);
    return acc;
  }, {});
  return Object.entries(groups).map(([label, groupRows]) => ({ label, ...summarize(groupRows) })).sort((a, b) => b.margin - a.margin);
}
function buildChartData(items, mode) {
  const groups = items.reduce((acc, row) => {
    const date = groupDate(row.date, mode);
    acc[date] = acc[date] || { date, spend: 0, revenue: 0, margin: 0, roas: 0, leads: 0, validatedLeads: 0 };
    acc[date].spend += row.spend;
    acc[date].revenue += row.revenue;
    acc[date].margin += row.margin;
    acc[date].leads += row.leads;
    acc[date].validatedLeads += row.validatedLeads;
    return acc;
  }, {});
  return Object.values(groups).map((d) => ({ ...d, roas: d.spend > 0 ? d.revenue / d.spend : 0 })).sort((a, b) => new Date(a.date) - new Date(b.date));
}
function buildMultiChartData(items, mode) { return buildChartData(items, mode); }
function groupDate(date, mode) {
  if (!date) return "Sans date";
  const parsed = new Date(date);
  if (mode === "month") return date.slice(0, 7);
  if (mode === "week") { const d = new Date(parsed); d.setDate(parsed.getDate() - parsed.getDay() + 1); return d.toISOString().slice(0, 10); }
  return date;
}
function formatMoney(value) { return `${asNumber(value).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function formatNumber(value) { return asNumber(value).toLocaleString("fr-FR", { maximumFractionDigits: 0 }); }
function formatRatio(value) { return asNumber(value).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatPercent(value) { return asNumber(value).toLocaleString("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function escapeCsvCell(value) { const text = String(value ?? "").replaceAll('"', '""'); return `"${text}"`; }
function parseMarginCsv(text) {
  const rows = parseCsvRows(text).filter((row) => row.some(Boolean));
  const headers = rows.shift()?.map((h) => normalizeHeader(h)) || [];
  const campaignIndex = findHeaderIndex(headers, ["campagne", "campaign", "campaign_name", "campaignname"]);
  const clientIndex = findHeaderIndex(headers, ["client"]);
  const clientCplIndex = findHeaderIndex(headers, ["cpl_client", "cpl client", "client_cpl", "clientcpl"]);
  const validatedLeadsIndex = findHeaderIndex(headers, ["leads_valides", "leads valides", "leads_validés", "leads validés", "validated_leads", "validatedleads"]);
  const dateIndex = findHeaderIndex(headers, ["date", "jour", "day"]);
  const accountIndex = findHeaderIndex(headers, ["compte", "account", "account_name", "accountname"]);
  if ([campaignIndex, clientIndex, clientCplIndex, validatedLeadsIndex].some((i) => i === -1)) throw new Error("Colonnes CSV manquantes");
  return rows.map((row) => ({ accountName: accountIndex >= 0 ? row[accountIndex]?.trim() : "", campaignName: row[campaignIndex]?.trim() || "", date: dateIndex >= 0 ? normalizeDate(row[dateIndex]) : "", client: row[clientIndex]?.trim() || "", clientCpl: asNumber(row[clientCplIndex]), validatedLeads: asNumber(row[validatedLeadsIndex]) }));
}
function parseCsvRows(text) {
  const delimiter = detectCsvDelimiter(text);
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i++; row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell.trim()); rows.push(row); return rows;
}
function detectCsvDelimiter(text) { const l = text.split(/\r?\n/)[0] || ""; return l.split(";").length >= l.split(",").length ? ";" : ","; }
function findHeaderIndex(headers, names) { return headers.findIndex((h) => names.includes(h)); }
function normalizeHeader(value) { return normalizeText(value).replaceAll("-", "_"); }
function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const fr = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return text;
}

// --- styles ---
const avatarColors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

const appStyle = { display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" };
const sidebarStyle = { position: "fixed", top: 0, left: 0, height: "100vh", width: "260px", background: "#111827", zIndex: 100, display: "flex", flexDirection: "column", transition: "transform 0.25s ease", boxShadow: "4px 0 24px rgba(0,0,0,0.15)" };
const sidebarHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" };
const logoTextStyle = { fontSize: "20px", fontWeight: 700, color: "white", letterSpacing: "-0.5px" };
const iconButtonStyle = { background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "18px", padding: "4px" };
const navStyle = { flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "4px" };
const navItemBase = { display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 500, textAlign: "left", width: "100%", transition: "background 0.15s" };
const navItemStyle = { ...navItemBase, background: "transparent", color: "rgba(255,255,255,0.6)" };
const activeNavItemStyle = { ...navItemBase, background: "rgba(99,102,241,0.2)", color: "white" };
const sidebarFooterStyle = { padding: "16px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)" };
const teamSectionStyle = { marginBottom: "12px" };
const teamLabelStyle = { fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px", fontWeight: 600 };
const teamMemberStyle = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" };
const avatarStyle = { width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "white" };
const memberNameStyle = { fontSize: "13px", color: "rgba(255,255,255,0.8)", flex: 1 };
const onlineDotStyle = { width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" };
const storageBadgeStyle = { padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: "8px" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 99 };
const mainStyle = { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 };
const topbarStyle = { display: "flex", alignItems: "center", gap: "16px", padding: "0 24px", height: "64px", background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 50 };
const topbarLeftStyle = { display: "flex", alignItems: "center", gap: "12px", minWidth: "140px" };
const menuButtonStyle = { background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#374151", padding: "4px 8px" };
const brandStyle = { fontSize: "18px", fontWeight: 700, color: "#111827", letterSpacing: "-0.5px" };
const topbarCenterStyle = { display: "flex", gap: "6px", flex: 1, justifyContent: "center" };
const tabPillStyle = { padding: "7px 16px", borderRadius: "20px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: "13px", fontWeight: 500, cursor: "pointer" };
const activeTabPillStyle = { ...tabPillStyle, background: "#111827", color: "white", border: "1px solid #111827" };
const topbarRightStyle = { minWidth: "140px", display: "flex", justifyContent: "flex-end" };
const connectBtnStyle = { padding: "8px 16px", borderRadius: "10px", background: "#4f46e5", color: "white", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const connectedBtnStyle = { ...connectBtnStyle, background: "#10b981" };
const contentStyle = { padding: "24px", flex: 1 };
const filterPanelStyle = { background: "white", borderRadius: "14px", padding: "20px", marginBottom: "20px", border: "1px solid #e5e7eb" };
const filterRowStyle = { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px" };
const filterGroupStyle = { display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "140px" };
const filterLabelStyle = { fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" };
const filterInputStyle = { padding: "8px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px", color: "#111827", background: "white", outline: "none" };
const actionRowStyle = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" };
const primaryActionStyle = { padding: "9px 18px", borderRadius: "9px", background: "#4f46e5", color: "white", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const secondaryActionStyle = { padding: "9px 14px", borderRadius: "9px", background: "white", color: "#374151", border: "1px solid #e5e7eb", fontSize: "13px", fontWeight: 500, cursor: "pointer" };
const statusTextStyle = { fontSize: "12px", color: "#9ca3af", marginLeft: "4px" };
const kpiGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "20px" };
const kpiCardStyle = { background: "white", borderRadius: "12px", padding: "16px 18px", border: "1px solid #e5e7eb" };
const kpiIconStyle = { fontSize: "20px", marginBottom: "8px" };
const kpiLabelStyle = { fontSize: "12px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" };
const kpiValueStyle = { fontSize: "22px", fontWeight: 700, color: "#111827" };
const tableCardStyle = { background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", marginBottom: "20px", overflow: "hidden" };
const tableHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid #f3f4f6" };
const sectionTitleStyle = { fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 };
const rowCountStyle = { fontSize: "13px", color: "#9ca3af", background: "#f3f4f6", padding: "4px 10px", borderRadius: "20px" };
const tableStyle = { width: "100%", minWidth: "1400px", borderCollapse: "collapse" };
const theadRowStyle = { background: "#f9fafb" };
const thStyle = { padding: "12px 14px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" };
const trEvenStyle = { background: "white" };
const trOddStyle = { background: "#fafafa" };
const tdStyle = { padding: "12px 14px", fontSize: "13px", color: "#374151", verticalAlign: "middle", borderBottom: "1px solid #f3f4f6" };
const emptyRowStyle = { ...tdStyle, textAlign: "center", padding: "40px", color: "#9ca3af" };
const cellInputStyle = { padding: "7px 10px", borderRadius: "7px", border: "1px solid #e5e7eb", fontSize: "13px", color: "#111827", background: "white", width: "120px", outline: "none" };
const accountBadgeStyle = { fontSize: "12px", color: "#6b7280" };
const dateBadgeStyle = { fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" };
const alertBadgeStyle = { display: "inline-block", padding: "2px 8px", borderRadius: "20px", background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" };
const okBadgeStyle = { display: "inline-block", padding: "2px 8px", borderRadius: "20px", background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 600 };
const alertCountBadgeStyle = { display: "inline-block", padding: "2px 8px", borderRadius: "20px", background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 600 };
const deleteBtnStyle = { padding: "5px 10px", borderRadius: "7px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const metaTagStyle = { fontSize: "11px", color: "#9ca3af", background: "#f3f4f6", padding: "3px 8px", borderRadius: "20px" };
const chartsGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "20px" };
const chartCardStyle = { background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "20px" };
const chartCardHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" };
const spinnerStyle = { width: "48px", height: "48px", border: "4px solid #e5e7eb", borderTop: "4px solid #4f46e5", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" };
