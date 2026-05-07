"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const isDevelopment = process.env.NODE_ENV !== "production";

const demoRows = [
  { businessName: "BM Helio", accountName: "Compte Meta - Demo Paris", campaignName: "Lead Gen - Paris - Audit solaire", spend: 1240.5, leads: 86, date: "2026-05-01" },
  { businessName: "BM Helio", accountName: "Compte Meta - Demo Lyon", campaignName: "Conversion - Lyon - Devis isolation", spend: 890, leads: 58, date: "2026-05-02" },
  { businessName: "BM Reno", accountName: "Compte Meta - Demo Bordeaux", campaignName: "Lead Gen - Bordeaux - Patrimoine", spend: 530.2, leads: 44, date: "2026-05-03" },
  { businessName: "BM Reno", accountName: "Compte Meta - Demo Paris", campaignName: "Retargeting - Paris - Audit solaire", spend: 312.7, leads: 21, date: "2026-05-04" },
];

function getStorageKey(userId, type) {
  return `meta-dashboard-${type}-${userId}`;
}

// Composant filtre multi-sélection avec dropdown checkboxes
function MultiSelect({ label, options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (value) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const count = selected.length;

  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: "140px" }}>
      <label style={filterLabelStyle}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          ...filterInputStyle,
          width: "100%",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          background: count > 0 ? "#eef2ff" : "white",
          borderColor: count > 0 ? "#6366f1" : "#e5e7eb",
          color: count > 0 ? "#4338ca" : "#6b7280",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px" }}>
          {count === 0 ? placeholder : count === 1 ? selected[0] : `${count} sélectionnés`}
        </span>
        <span style={{ marginLeft: "6px", fontSize: "10px", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={dropdownStyle}>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={clearBtnStyle}
            >
              ✕ Effacer la sélection
            </button>
          )}
          {options.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: "12px", color: "#9ca3af" }}>Aucune option</div>
          )}
          {options.map((opt) => (
            <label key={opt} style={dropdownItemStyle}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ marginRight: "8px", accentColor: "#6366f1" }}
              />
              <span style={{ fontSize: "13px", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [token, setToken] = useState(null);
  const [metaUserId, setMetaUserId] = useState(null);
  const [metaUserName, setMetaUserName] = useState(null);

  const [rows, setRows] = useState([]);
  const [accountList, setAccountList] = useState([]); // tous les comptes/BM même sans dépenses
  const [marginFields, setMarginFields] = useState({});
  const [loadStatus, setLoadStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingMargins, setSavingMargins] = useState(false);
  const [marginStorage, setMarginStorage] = useState("local");

  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Filtres multi-sélection
  const [bmFilter, setBmFilter] = useState([]);
  const [accountFilter, setAccountFilter] = useState([]);
  const [campaignFilter, setCampaignFilter] = useState([]);
  const [clientFilter, setClientFilter] = useState([]);

  const [chartMode, setChartMode] = useState("day");
  const [activeView, setActiveView] = useState("global");
  const [chartMetric, setChartMetric] = useState("spend");
  const [chartReady, setChartReady] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const PAGE_SIZE = 20;
  const [showAll, setShowAll] = useState(false);
  const [globalPage, setGlobalPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(null);
  const autoRefreshRef = useRef(null);
  const countdownRef = useRef(null);
  const [clientPage, setClientPage] = useState(1);
  const [campaignPage, setCampaignPage] = useState(1);

  const saveRequestRef = useRef(0);
  const importInputRef = useRef(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setChartReady(true));
    window.fbAsyncInit = function () {
      FB.init({ appId: "1429673219178010", cookie: true, xfbml: true, version: "v19.0" });
      FB.getLoginStatus((response) => {
        if (response.status === "connected") handleFbAuth(response.authResponse);
      });
    };
    (function (d, s, id) {
      let js; const fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = "https://connect.facebook.net/fr_FR/sdk.js";
      fjs.parentNode.insertBefore(js, fjs);
    })(document, "script", "facebook-jssdk");
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!metaUserId) return;
    loadUserData(metaUserId);
  }, [metaUserId]);

  // Auto-refresh toutes les heures
  useEffect(() => {
    if (!token || !autoRefresh) {
      clearInterval(autoRefreshRef.current);
      clearInterval(countdownRef.current);
      setNextRefreshIn(null);
      return;
    }

    const INTERVAL_MS = 60 * 60 * 1000; // 1 heure
    let remaining = INTERVAL_MS;

    autoRefreshRef.current = setInterval(() => {
      loadData();
      setLastRefresh(new Date());
      remaining = INTERVAL_MS;
    }, INTERVAL_MS);

    countdownRef.current = setInterval(() => {
      remaining -= 60000;
      const mins = Math.max(0, Math.round(remaining / 60000));
      setNextRefreshIn(mins);
    }, 60000);

    setNextRefreshIn(60);

    return () => {
      clearInterval(autoRefreshRef.current);
      clearInterval(countdownRef.current);
    };
  }, [token, autoRefresh]);

  function loadUserData(userId) {
    const OLD_MARGINS_KEY = "meta-dashboard-margin-fields-v1";
    const OLD_ROWS_KEY = "meta-dashboard-campaign-rows-v1";

    try {
      const savedRows = window.localStorage.getItem(getStorageKey(userId, "rows"));
      if (savedRows) {
        setRows(JSON.parse(savedRows));
      } else {
        // Essaie l'ancienne clé localStorage
        const oldRows = window.localStorage.getItem(OLD_ROWS_KEY);
        if (oldRows) {
          const parsed = JSON.parse(oldRows);
          setRows(parsed);
          window.localStorage.setItem(getStorageKey(userId, "rows"), oldRows);
        } else {
          // Essaie Supabase en dernier recours
          fetch(`/api/margins?type=rows&userId=${userId}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.rows?.length > 0) {
                setRows(data.rows);
                window.localStorage.setItem(getStorageKey(userId, "rows"), JSON.stringify(data.rows));
                setLoadStatus(`${data.rows.length} campagne(s) restaurée(s) depuis Supabase.`);
              }
            })
            .catch(console.log);
        }
      }
    } catch { setRows([]); }

    try {
      const savedMargins = window.localStorage.getItem(getStorageKey(userId, "margins"));
      if (savedMargins) {
        setMarginFields(JSON.parse(savedMargins));
      } else {
        const oldMargins = window.localStorage.getItem(OLD_MARGINS_KEY);
        if (oldMargins) {
          const parsed = JSON.parse(oldMargins);
          setMarginFields(parsed);
          window.localStorage.setItem(getStorageKey(userId, "margins"), oldMargins);
          fetch("/api/margins", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ margins: parsed, userId }),
          }).catch(console.log);
        } else { setMarginFields({}); }
      }
    } catch { setMarginFields({}); }

    try {
      const savedAL = window.localStorage.getItem(getStorageKey(userId, "accountList"));
      if (savedAL) setAccountList(JSON.parse(savedAL));
    } catch { setAccountList([]); }

    fetch(`/api/margins?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.margins) {
          setMarginFields(data.margins);
          window.localStorage.setItem(getStorageKey(userId, "margins"), JSON.stringify(data.margins));
        }
        if (data.storage) setMarginStorage(data.storage);
      })
      .catch(console.log);
  }

  function handleFbAuth(authResponse) {
    setToken(authResponse.accessToken);
    FB.api("/me", { fields: "id,name" }, (response) => {
      setMetaUserId(response.id);
      setMetaUserName(response.name);
    });
  }

  async function loginMeta() {
    if (window.location.protocol !== "https:") {
      alert("Meta bloque la connexion depuis http://. Utilise les données test ou déploie en HTTPS.");
      return;
    }
    FB.login((response) => {
      if (response.authResponse) handleFbAuth(response.authResponse);
      else alert("Connexion refusée");
    }, { scope: "ads_read,business_management" });
  }

  function logoutMeta() {
    if (typeof FB !== "undefined") FB.logout(() => {});
    setToken(null); setMetaUserId(null); setMetaUserName(null);
    setRows([]); setMarginFields({}); setLoadStatus("");
  }

  async function saveMargins(nextFields) {
    if (!metaUserId) return;
    const requestId = ++saveRequestRef.current;
    setSavingMargins(true);
    window.localStorage.setItem(getStorageKey(metaUserId, "margins"), JSON.stringify(nextFields));
    try {
      const res = await fetch("/api/margins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ margins: nextFields, userId: metaUserId }),
      });
      const data = await res.json();
      if (data.storage) setMarginStorage(data.storage);
    } catch (e) { console.log(e); }
    finally { if (saveRequestRef.current === requestId) setSavingMargins(false); }
  }

  function saveCampaignRows(nextRows) {
    setRows(nextRows);
    if (metaUserId) {
      window.localStorage.setItem(getStorageKey(metaUserId, "rows"), JSON.stringify(nextRows));
      // Sauvegarde aussi dans Supabase
      fetch("/api/margins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "rows", rows: nextRows, userId: metaUserId }),
      }).catch(console.log);
    }
  }

  async function loadData() {
    if (!token) { alert("Connecte-toi à Meta"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/meta-spend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, startDate, endDate }),
      });
      const data = await res.json();

      // Mettre à jour la liste exhaustive des comptes/BM
      if (data.accountList?.length > 0) {
        setAccountList(data.accountList);
        if (metaUserId) window.localStorage.setItem(getStorageKey(metaUserId, "accountList"), JSON.stringify(data.accountList));
      }

      if (data.rows?.length > 0) {
        const nextRows = mergeCampaignRows(rows, data.rows);
        saveCampaignRows(nextRows);
        setLoadStatus(`${data.rows.length} campagne(s) chargée(s) · ${data.accountList?.length || 0} compte(s) trouvé(s).`);
      } else {
        setLoadStatus(`Aucune dépense sur cette période · ${data.accountList?.length || 0} compte(s) trouvé(s).`);
      }
    } catch (e) { console.log(e); setLoadStatus("Erreur de chargement. Les données précédentes sont conservées."); }
    setLoading(false);
  }

  function loadDemoData() {
    const nextRows = mergeCampaignRows(rows, demoRows);
    saveCampaignRows(nextRows);
    const demo = {
      [rowKey(demoRows[0])]: { client: "Helio Conseil", clientCpl: 42, validatedLeads: 61 },
      [rowKey(demoRows[1])]: { client: "Maison Reno", clientCpl: 55, validatedLeads: 39 },
      [rowKey(demoRows[2])]: { client: "Atlas Finance", clientCpl: 38, validatedLeads: 26 },
      [rowKey(demoRows[3])]: { client: "Helio Conseil", clientCpl: 42, validatedLeads: 17 },
    };
    setMarginFields(demo);
    saveMargins(demo);
  }

  function addManualRow() {
    const today = new Date().toISOString().slice(0, 10);
    saveCampaignRows(mergeCampaignRows(rows, [{
      businessName: "Sans BM", accountName: "Ligne manuelle",
      campaignName: `Campagne manuelle ${rows.length + 1}`,
      spend: 0, leads: 0, date: startDate || today, isManual: true,
    }]));
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
      const nf = { ...marginFields, [newKey]: marginFields[oldKey] };
      delete nf[oldKey];
      setMarginFields(nf); saveMargins(nf);
    }
  }

  function deleteManualRow(row) {
    const key = rowKey(row);
    const nf = { ...marginFields }; delete nf[key];
    saveCampaignRows(rows.filter((item) => rowKey(item) !== key));
    setMarginFields(nf); saveMargins(nf);
    setLoadStatus("Ligne manuelle supprimée.");
  }

  function updateMarginField(row, field, value) {
    const key = rowKey(row);
    const num = Number.parseFloat(value || 0);
    const nextValue = field === "client" ? value : Number.isFinite(num) ? num : "";
    const nf = { ...marginFields, [key]: { ...marginFields[key], [field]: nextValue } };
    setMarginFields(nf); saveMargins(nf);
  }

  async function importLeadsCsv(event) {
    const [file] = event.target.files; event.target.value = "";
    if (!file) return;
    if (rows.length === 0) { setImportStatus("Charge d'abord les campagnes Meta."); return; }
    try {
      const importedRows = parseMarginCsv(await file.text());
      let matched = 0, unmatched = 0;
      const nf = { ...marginFields };
      importedRows.forEach((ir) => {
        const matches = rows.filter((row) =>
          normalizeText(row.campaignName) === normalizeText(ir.campaignName) &&
          (ir.date ? row.date === ir.date : true) &&
          (ir.accountName ? normalizeText(row.accountName) === normalizeText(ir.accountName) : true)
        );
        if (!matches.length) { unmatched++; return; }
        matches.forEach((row) => {
          nf[rowKey(row)] = { ...nf[rowKey(row)], client: ir.client, clientCpl: ir.clientCpl, validatedLeads: ir.validatedLeads };
          matched++;
        });
      });
      setMarginFields(nf); saveMargins(nf);
      setImportStatus(`${matched} campagne(s) mise(s) à jour${unmatched > 0 ? ` · ${unmatched} sans correspondance` : ""}.`);
    } catch (e) { console.log(e); setImportStatus("Import impossible. Colonnes : campagne, client, cpl_client, leads_valides."); }
  }

  const enrichedRows = useMemo(() => rows.map((row) => {
    const manual = marginFields[rowKey(row)] || {};
    const inherited = findInheritedMarginFields(row, marginFields);
    const client = manual.client || inherited.client || "";
    const clientCpl = asNumber(manual.clientCpl || inherited.clientCpl);
    const validatedLeads = asNumber(manual.validatedLeads);
    const spend = asNumber(row.spend); const leads = asNumber(row.leads);
    const revenue = clientCpl * validatedLeads;
    const margin = revenue - spend;
    const roas = spend > 0 ? revenue / spend : 0;
    const realCostPerLead = validatedLeads > 0 ? spend / validatedLeads : 0;
    const alerts = getProfitAlerts({ spend, leads, clientCpl, validatedLeads, margin, roas, realCostPerLead });
    return { ...row, spend, leads, client, clientCpl, validatedLeads, revenue, margin, marginRate: revenue > 0 ? margin / revenue : 0, roas, realCostPerLead, alerts, alertCount: alerts.length };
  }), [rows, marginFields]);

  // Options de filtre — combine les données chargées + tous les comptes connus
  const uniqueBms = useMemo(() => {
    const fromRows = rows.map((r) => r.businessName).filter(Boolean);
    const fromList = accountList.map((a) => a.businessName).filter(Boolean);
    return [...new Set([...fromRows, ...fromList])].sort();
  }, [rows, accountList]);

  const uniqueAccounts = useMemo(() => {
    const validBms = bmFilter.length > 0 ? bmFilter : null;
    const fromRows = rows
      .filter((r) => !validBms || validBms.includes(r.businessName))
      .map((r) => r.accountName).filter(Boolean);
    const fromList = accountList
      .filter((a) => !validBms || validBms.includes(a.businessName))
      .map((a) => a.accountName).filter(Boolean);
    return [...new Set([...fromRows, ...fromList])].sort();
  }, [rows, accountList, bmFilter]);
  const uniqueCampaigns = useMemo(() => {
    const filtered = rows.filter((r) =>
      (bmFilter.length === 0 || bmFilter.includes(r.businessName)) &&
      (accountFilter.length === 0 || accountFilter.includes(r.accountName))
    );
    return [...new Set(filtered.map((r) => r.campaignName).filter(Boolean))].sort();
  }, [rows, bmFilter, accountFilter]);
  const uniqueClients = useMemo(() => [...new Set(enrichedRows.map((r) => r.client).filter(Boolean))].sort(), [enrichedRows]);

  // Quand on change le BM, on réinitialise les filtres enfants si nécessaire
  function handleBmChange(newBm) {
    setBmFilter(newBm);
    // Retire les comptes qui n'appartiennent plus aux BM sélectionnés
    if (newBm.length > 0) {
      const validAccounts = rows.filter((r) => newBm.includes(r.businessName)).map((r) => r.accountName);
      setAccountFilter((prev) => prev.filter((a) => validAccounts.includes(a)));
    }
  }

  function handleAccountChange(newAccount) {
    setAccountFilter(newAccount);
    if (newAccount.length > 0) {
      const validCampaigns = rows.filter((r) => newAccount.includes(r.accountName)).map((r) => r.campaignName);
      setCampaignFilter((prev) => prev.filter((c) => validCampaigns.includes(c)));
    }
  }

  const filteredRows = useMemo(() =>
    enrichedRows.filter((row) => {
      const s = searchText.toLowerCase();
      return (bmFilter.length === 0 || bmFilter.includes(row.businessName)) &&
        (accountFilter.length === 0 || accountFilter.includes(row.accountName)) &&
        (campaignFilter.length === 0 || campaignFilter.includes(row.campaignName)) &&
        (clientFilter.length === 0 || clientFilter.includes(row.client)) &&
        (startDate ? row.date >= startDate : true) &&
        (endDate ? row.date <= endDate : true) &&
        (s === "" || (row.businessName || "").toLowerCase().includes(s) || row.accountName.toLowerCase().includes(s) || row.campaignName.toLowerCase().includes(s) || row.client.toLowerCase().includes(s));
    }).sort((a, b) => b.spend - a.spend),
    [enrichedRows, bmFilter, accountFilter, campaignFilter, clientFilter, startDate, endDate, searchText]);

  const activeFilterCount = bmFilter.length + accountFilter.length + campaignFilter.length + clientFilter.length;

  // Reset pagination quand les filtres changent
  useEffect(() => { setGlobalPage(1); setClientPage(1); setCampaignPage(1); }, [bmFilter, accountFilter, campaignFilter, clientFilter, startDate, endDate, searchText]);

  const totals = summarize(filteredRows);
  const alertRows = filteredRows.filter((r) => r.alertCount > 0);
  const clientRows = groupBy(filteredRows, "client");
  const campaignRows = groupBy(filteredRows, "campaignName");
  const bmRows = groupByBm(filteredRows);
  const chartData = buildChartData(filteredRows, chartMode);

  // Pagination
  const paginatedRows = showAll ? filteredRows : filteredRows.slice((globalPage - 1) * PAGE_SIZE, globalPage * PAGE_SIZE);
  const paginatedClientRows = showAll ? clientRows : clientRows.slice((clientPage - 1) * PAGE_SIZE, clientPage * PAGE_SIZE);
  const paginatedCampaignRows = showAll ? campaignRows : campaignRows.slice((campaignPage - 1) * PAGE_SIZE, campaignPage * PAGE_SIZE);
  const totalGlobalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const totalClientPages = Math.ceil(clientRows.length / PAGE_SIZE);
  const totalCampaignPages = Math.ceil(campaignRows.length / PAGE_SIZE);

  const exportCsv = useCallback(async () => {
    if (!filteredRows.length) { setExportStatus("Aucune ligne à exporter."); return; }
    const headers = ["BM", "Compte", "Campagne", "Date", "Spend Meta", "Leads Meta", "Client", "CPL client", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût réel par lead", "Alertes"];
    const csv = [headers, ...filteredRows.map((r) => [r.businessName || "", r.accountName, r.campaignName, r.date, r.spend, r.leads, r.client, r.clientCpl, r.validatedLeads, r.revenue, r.margin, r.marginRate, r.roas, r.realCostPerLead, r.alerts.join(", ")])].map((cells) => cells.map(escapeCsvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `meta-marges-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    try { await navigator.clipboard.writeText(csv); setExportStatus(`${filteredRows.length} ligne(s) exportée(s). CSV copié.`); }
    catch { setExportStatus(`${filteredRows.length} ligne(s) exportée(s).`); }
  }, [filteredRows]);

  const metricOptions = [
    { value: "spend", label: "Dépenses" }, { value: "revenue", label: "CA" }, { value: "margin", label: "Marge" },
    { value: "roas", label: "ROAS" }, { value: "leads", label: "Leads Meta" }, { value: "validatedLeads", label: "Leads validés" },
  ];
  const chartColor = { spend: "#6366f1", revenue: "#10b981", margin: "#f59e0b", roas: "#3b82f6", leads: "#8b5cf6", validatedLeads: "#14b8a6" };

  // ─── SPLASH ───────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={splashWrapStyle}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap');
          @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
          .splash-btn:hover { background:#3730a3!important; transform:translateY(-2px); box-shadow:0 8px 32px rgba(99,102,241,.35)!important; }
          .feature-card:hover { border-color:rgba(99,102,241,.4)!important; background:rgba(99,102,241,.05)!important; }
        `}</style>
        <div style={splashGridStyle} />
        <div style={splashContentStyle}>
          <div style={{ animation: "fadeUp .5s ease both", animationDelay: ".05s" }}>
            <span style={splashBadgeStyle}>Meta Ads · Dashboard</span>
          </div>
          <div style={{ animation: "fadeUp .5s ease both", animationDelay: ".15s" }}>
            <h1 style={splashTitleStyle}>Pilotez vos marges<br /><span style={{ color: "#6366f1" }}>en temps réel</span></h1>
          </div>
          <div style={{ animation: "fadeUp .5s ease both", animationDelay: ".25s" }}>
            <p style={splashSubtitleStyle}>Connectez votre compte Meta Ads et visualisez instantanément vos dépenses, CA, marges et alertes — données isolées par compte, synchronisées pour votre équipe.</p>
          </div>
          <div style={{ ...splashFeaturesStyle, animation: "fadeUp .5s ease both", animationDelay: ".35s" }}>
            {[["📊", "Dépenses & ROAS", "Toutes vos campagnes en un coup d'œil"], ["💰", "Calcul de marge", "CA, marge nette et alertes automatiques"], ["🔒", "Données isolées", "Chaque compte Meta voit ses propres données"]].map(([icon, title, desc]) => (
              <div key={title} className="feature-card" style={featureCardStyle}>
                <div style={{ fontSize: "24px", marginBottom: "10px" }}>{icon}</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,.85)", marginBottom: "6px" }}>{title}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,.35)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{ animation: "fadeUp .5s ease both", animationDelay: ".45s", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <button className="splash-btn" onClick={loginMeta} style={splashBtnStyle}>
              <svg style={{ width: "22px", height: "22px", flexShrink: 0 }} viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              Connecter avec Meta
            </button>
            {isDevelopment && (
              <button onClick={() => { setToken("demo"); setMetaUserId("demo-user"); setMetaUserName("Demo User"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,.35)", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }}>
                Voir les données de démonstration →
              </button>
            )}
          </div>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,.2)", margin: 0 }}>Vos données restent privées — aucun partage sans votre accord.</p>
        </div>
      </div>
    );
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────
  return (
    <div style={appStyle}>
      <aside style={{ ...sidebarStyle, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}>
        <div style={sidebarHeaderStyle}>
          <span style={logoTextStyle}>MetaBoard</span>
          <button onClick={() => setSidebarOpen(false)} style={iconButtonStyle}>✕</button>
        </div>
        <nav style={navStyle}>
          {[["global", "📊", "Vue globale"], ["bm", "🏢", "Par BM"], ["client", "👤", "Par client"], ["campaign", "📢", "Par campagne"], ["charts", "📈", "Graphiques"]].map(([v, icon, label]) => (
            <button key={v} onClick={() => { setActiveView(v); setSidebarOpen(false); }} style={activeView === v ? activeNavStyle : navItemStyle}>
              <span style={{ marginRight: "10px" }}>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div style={sidebarFooterStyle}>
          <div style={userCardStyle}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "white", flexShrink: 0 }}>{metaUserName?.[0]?.toUpperCase() || "M"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,.85)", fontWeight: 500 }}>{metaUserName || "Utilisateur Meta"}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ID: {metaUserId}</div>
            </div>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
          </div>
          <button onClick={logoutMeta} style={{ padding: "7px 12px", borderRadius: "8px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#fca5a5", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}>Déconnecter</button>
          <div style={{ padding: "6px 10px", background: "rgba(255,255,255,.05)", borderRadius: "8px" }}>
            <span style={{ fontSize: "11px", color: marginStorage === "supabase" ? "#10b981" : "#f59e0b" }}>{marginStorage === "supabase" ? "● Supabase sync" : "● Local storage"}</span>
          </div>
        </div>
      </aside>
      {sidebarOpen && <div style={overlayStyle} onClick={() => setSidebarOpen(false)} />}

      <div style={mainStyle}>
        <header style={topbarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "140px" }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#374151", padding: "4px 8px" }}>☰</button>
            <span style={{ fontSize: "18px", fontWeight: 700, color: "#111827", letterSpacing: "-0.5px" }}>MetaBoard</span>
          </div>
          <div style={{ display: "flex", gap: "6px", flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
            {[["global", "Vue globale"], ["bm", "Par BM"], ["client", "Par client"], ["campaign", "Par campagne"], ["charts", "Graphiques"]].map(([v, label]) => (
              <button key={v} onClick={() => setActiveView(v)} style={activeView === v ? activeTabStyle : tabStyle}>{label}</button>
            ))}
          </div>
          <div style={{ minWidth: "220px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? `Prochain refresh dans ${nextRefreshIn ?? "…"} min` : "Auto-refresh désactivé"}
              style={{ ...autoRefreshBtnStyle, background: autoRefresh ? "#f0fdf4" : "#f9fafb", borderColor: autoRefresh ? "#86efac" : "#e5e7eb", color: autoRefresh ? "#166534" : "#9ca3af" }}
            >
              <span style={{ fontSize: "10px" }}>{autoRefresh ? "●" : "○"}</span>
              {autoRefresh ? `Refresh ${nextRefreshIn ?? "…"}min` : "Auto-refresh off"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderRadius: "20px", background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#6366f1", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>{metaUserName?.[0]?.toUpperCase() || "M"}</div>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#374151" }}>{metaUserName || "Connecté"}</span>
            </div>
          </div>
        </header>

        <div style={contentStyle}>
          {/* Filtres */}
          <div style={filterPanelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Filtres</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setBmFilter([]); setAccountFilter([]); setCampaignFilter([]); setClientFilter([]); }}
                  style={{ fontSize: "12px", color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                >
                  ✕ Effacer tous les filtres ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Raccourcis de période */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
              {[
                { label: "Aujourd'hui", fn: () => { const d = today(); setStartDate(d); setEndDate(d); } },
                { label: "Hier", fn: () => { const d = daysAgo(1); setStartDate(d); setEndDate(d); } },
                { label: "7 derniers jours", fn: () => { setStartDate(daysAgo(6)); setEndDate(today()); } },
                { label: "30 derniers jours", fn: () => { setStartDate(daysAgo(29)); setEndDate(today()); } },
                { label: "Ce mois", fn: () => { setStartDate(firstOfMonth()); setEndDate(today()); } },
                { label: "Mois dernier", fn: () => { const d = lastMonth(); setStartDate(d.start); setEndDate(d.end); } },
                { label: "Tout effacer", fn: () => { setStartDate(""); setEndDate(""); } },
              ].map(({ label, fn }) => (
                <button key={label} type="button" onClick={fn} style={shortcutBtnStyle}>{label}</button>
              ))}
            </div>

            {/* Ligne 1 : dates + recherche */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "140px" }}>
                <label style={filterLabelStyle}>Du</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={filterInputStyle} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "140px" }}>
                <label style={filterLabelStyle}>Au</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={filterInputStyle} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 2, minWidth: "200px" }}>
                <label style={filterLabelStyle}>Recherche</label>
                <input type="text" placeholder="BM, compte, client, campagne..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={filterInputStyle} />
              </div>
            </div>

            {/* Ligne 2 : filtres multi-sélection en cascade */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
              <MultiSelect label="Business Manager" options={uniqueBms} selected={bmFilter} onChange={handleBmChange} placeholder="Tous les BM" />
              <MultiSelect label="Compte publicitaire" options={uniqueAccounts} selected={accountFilter} onChange={handleAccountChange} placeholder="Tous les comptes" />
              <MultiSelect label="Campagne" options={uniqueCampaigns} selected={campaignFilter} onChange={setCampaignFilter} placeholder="Toutes les campagnes" />
              <MultiSelect label="Client" options={uniqueClients} selected={clientFilter} onChange={setClientFilter} placeholder="Tous les clients" />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={loadData} style={primaryActionStyle} disabled={loading}>{loading ? "⏳ Chargement..." : "⬇ Charger les campagnes"}</button>
              <button onClick={addManualRow} style={secondaryActionStyle}>+ Ajouter une ligne</button>
              {isDevelopment && <button onClick={loadDemoData} style={secondaryActionStyle}>🎯 Données test</button>}
              <button onClick={() => importInputRef.current?.click()} style={secondaryActionStyle}>📥 Import CSV</button>
              <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={importLeadsCsv} style={{ display: "none" }} />
              <button onClick={exportCsv} style={secondaryActionStyle}>📤 Export CSV</button>
              <span style={{ fontSize: "12px", color: "#9ca3af", marginLeft: "4px" }}>
                {savingMargins ? "⏳ Sauvegarde..." : "✓ Sauvegardé"}
                {loadStatus ? ` · ${loadStatus}` : ""}
                {exportStatus ? ` · ${exportStatus}` : ""}
                {importStatus ? ` · ${importStatus}` : ""}
              </span>
            </div>
          </div>

          {/* KPIs */}
          <div style={kpiGridStyle}>
            {[
              ["💸", "Spend Meta", formatMoney(totals.spend), "#6366f1", false],
              ["💰", "CA généré", formatMoney(totals.revenue), "#10b981", false],
              ["📈", "Marge", formatMoney(totals.margin), totals.margin < 0 ? "#ef4444" : "#f59e0b", totals.margin < 0],
              ["%", "Marge %", formatPercent(totals.marginRate), totals.marginRate < 0 ? "#ef4444" : "#3b82f6", totals.marginRate < 0],
              ["🎯", "ROAS", formatRatio(totals.roas), "#8b5cf6", false],
              ["👥", "Leads Meta", formatNumber(totals.leads), "#14b8a6", false],
              ["✅", "Leads validés", formatNumber(totals.validatedLeads), "#10b981", false],
              ["🏷", "Coût réel / lead", formatMoney(totals.realCostPerLead), "#f59e0b", false],
              ["⚠️", "Alertes", formatNumber(alertRows.length), alertRows.length > 0 ? "#ef4444" : "#10b981", alertRows.length > 0],
            ].map(([icon, label, value, color, danger]) => (
              <div key={label} style={{ ...kpiCardStyle, borderTop: `3px solid ${color}` }}>
                <div style={{ fontSize: "20px", marginBottom: "8px" }}>{icon}</div>
                <div style={kpiLabelStyle}>{label}</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: danger ? "#ef4444" : "#111827" }}>{value}</div>
              </div>
            ))}
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
                    <thead><tr style={{ background: "#f9fafb" }}>
                      {["BM", "Compte", "Campagne", "Date", "Dépenses", "Leads Meta", "Client", "CPL client", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût / lead", "Alertes", "Action"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr><td colSpan="16" style={{ ...tdStyle, textAlign: "center", padding: "40px", color: "#9ca3af" }}>Aucune campagne avec les filtres actuels.</td></tr>
                      ) : paginatedRows.map((row, i) => (
                        <tr key={`${rowKey(row)}-${i}`} style={i % 2 === 0 ? { background: "white" } : { background: "#fafafa" }}>
                          <td style={tdStyle}><span style={bmBadgeStyle}>{row.businessName || "—"}</span></td>
                          <td style={tdStyle}>{row.isManual ? <input value={row.accountName} onChange={(e) => updateManualRow(row, "accountName", e.target.value)} style={cellInputStyle} /> : <span style={{ fontSize: "12px", color: "#6b7280" }}>{row.accountName}</span>}</td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{row.isManual ? <input value={row.campaignName} onChange={(e) => updateManualRow(row, "campaignName", e.target.value)} style={{ ...cellInputStyle, width: "200px" }} /> : row.campaignName}</td>
                          <td style={tdStyle}>{row.isManual ? <input type="date" value={row.date} onChange={(e) => updateManualRow(row, "date", e.target.value)} style={cellInputStyle} /> : <span style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" }}>{row.date}</span>}</td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{row.isManual ? <input type="number" min="0" step="0.01" value={row.spend || ""} onChange={(e) => updateManualRow(row, "spend", e.target.value)} placeholder="0" style={cellInputStyle} /> : formatMoney(row.spend)}</td>
                          <td style={tdStyle}>{row.isManual ? <input type="number" min="0" step="1" value={row.leads || ""} onChange={(e) => updateManualRow(row, "leads", e.target.value)} placeholder="0" style={cellInputStyle} /> : formatNumber(row.leads)}</td>
                          <td style={tdStyle}><input value={row.client} onChange={(e) => updateMarginField(row, "client", e.target.value)} placeholder="Client" style={cellInputStyle} /></td>
                          <td style={tdStyle}><input type="number" min="0" step="0.01" value={row.clientCpl || ""} onChange={(e) => updateMarginField(row, "clientCpl", e.target.value)} placeholder="0" style={cellInputStyle} /></td>
                          <td style={tdStyle}><input type="number" min="0" step="1" value={row.validatedLeads || ""} onChange={(e) => updateMarginField(row, "validatedLeads", e.target.value)} placeholder="0" style={cellInputStyle} /></td>
                          <td style={{ ...tdStyle, color: "#10b981", fontWeight: 600 }}>{formatMoney(row.revenue)}</td>
                          <td style={{ ...tdStyle, color: row.margin < 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>{formatMoney(row.margin)}</td>
                          <td style={{ ...tdStyle, color: row.marginRate < 0 ? "#ef4444" : "#374151" }}>{formatPercent(row.marginRate)}</td>
                          <td style={tdStyle}><span style={{ color: asNumber(row.roas) >= 3 ? "#10b981" : asNumber(row.roas) >= 1 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{formatRatio(row.roas)}</span></td>
                          <td style={tdStyle}>{formatMoney(row.realCostPerLead)}</td>
                          <td style={tdStyle}><AlertBadges alerts={row.alerts} /></td>
                          <td style={tdStyle}>{row.isManual ? <button type="button" onClick={() => deleteManualRow(row)} style={{ padding: "5px 10px", borderRadius: "7px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Supprimer</button> : <span style={{ fontSize: "11px", color: "#9ca3af", background: "#f3f4f6", padding: "3px 8px", borderRadius: "20px" }}>Meta</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {totalGlobalPages > 1 && (
                <Pagination current={globalPage} total={totalGlobalPages} onChange={setGlobalPage} count={filteredRows.length} showAll={showAll} onToggleAll={() => { setShowAll(!showAll); setGlobalPage(1); }} />
              )}
            </div>
          )}

          {activeView === "bm" && <BmTable rows={bmRows} />}

          {activeView === "client" && <SummaryTable title="Performance par client" labelHeader="Client" rows={paginatedClientRows} totalRows={clientRows.length} currentPage={clientPage} totalPages={totalClientPages} onPageChange={setClientPage} showAll={showAll} onToggleAll={() => { setShowAll(!showAll); setClientPage(1); }} />}
          {activeView === "campaign" && <SummaryTable title="Performance par campagne" labelHeader="Campagne" rows={paginatedCampaignRows} totalRows={campaignRows.length} currentPage={campaignPage} totalPages={totalCampaignPages} onPageChange={setCampaignPage} showAll={showAll} onToggleAll={() => { setShowAll(!showAll); setCampaignPage(1); }} />}

          {activeView === "charts" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "20px" }}>
              {[
                { title: "Évolution dans le temps", controls: true, isBar: true },
                { title: "Spend vs CA vs Marge", isLine: true },
                { title: "ROAS par client", isVertical: true, dataKey: "roas", fill: "#8b5cf6", fmt: formatRatio, data: clientRows },
                { title: "Marge par client", isVertical: true, dataKey: "margin", fill: "#f59e0b", fmt: formatMoney, data: clientRows },
              ].map(({ title, controls, isBar, isLine, isVertical, dataKey, fill, fmt, data }) => (
                <div key={title} style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
                    <h2 style={sectionTitleStyle}>{title}</h2>
                    {controls && (
                      <div style={{ display: "flex", gap: "10px" }}>
                        <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={filterInputStyle}>
                          {metricOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <select value={chartMode} onChange={(e) => setChartMode(e.target.value)} style={filterInputStyle}>
                          <option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div style={{ height: "300px" }}>
                    {chartReady && (isVertical ? data?.length > 0 : chartData.length > 0) && (
                      <ResponsiveContainer width="100%" height="100%">
                        {isVertical ? (
                          <BarChart data={data.slice(0, 8)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" tick={{ fontSize: 12 }} />
                            <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={120} />
                            <Tooltip formatter={(v) => fmt(v)} />
                            <Bar dataKey={dataKey} fill={fill} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        ) : isLine ? (
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(v) => formatMoney(v)} />
                            <Legend />
                            <Line type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2} dot={false} name="Spend" />
                            <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} name="CA" />
                            <Line type="monotone" dataKey="margin" stroke="#f59e0b" strokeWidth={2} dot={false} name="Marge" />
                          </LineChart>
                        ) : (
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(v) => chartMetric === "roas" ? formatRatio(v) : chartMetric.includes("lead") ? formatNumber(v) : formatMoney(v)} />
                            <Bar dataKey={chartMetric} fill={chartColor[chartMetric]} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Composants ──────────────────────────────────────────────────────────────

function SummaryTable({ title, labelHeader, rows, totalRows, currentPage, totalPages, onPageChange, showAll, onToggleAll }) {
  const count = totalRows ?? rows.length;
  return (
    <div style={tableCardStyle}>
      <div style={tableHeaderStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <span style={rowCountStyle}>{count} ligne{count > 1 ? "s" : ""}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead><tr style={{ background: "#f9fafb" }}>
            {[labelHeader, "Dépenses", "Leads Meta", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût / lead", "Alertes"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} style={i % 2 === 0 ? { background: "white" } : { background: "#fafafa" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label || "Non renseigné"}</td>
                <td style={tdStyle}>{formatMoney(row.spend)}</td>
                <td style={tdStyle}>{formatNumber(row.leads)}</td>
                <td style={tdStyle}>{formatNumber(row.validatedLeads)}</td>
                <td style={{ ...tdStyle, color: "#10b981", fontWeight: 600 }}>{formatMoney(row.revenue)}</td>
                <td style={{ ...tdStyle, color: row.margin < 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>{formatMoney(row.margin)}</td>
                <td style={{ ...tdStyle, color: row.marginRate < 0 ? "#ef4444" : "#374151" }}>{formatPercent(row.marginRate)}</td>
                <td style={tdStyle}><span style={{ color: asNumber(row.roas) >= 3 ? "#10b981" : asNumber(row.roas) >= 1 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{formatRatio(row.roas)}</span></td>
                <td style={tdStyle}>{formatMoney(row.realCostPerLead)}</td>
                <td style={tdStyle}><span style={row.alertCount > 0 ? alertBadgeStyle : okBadgeStyle}>{formatNumber(row.alertCount)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination current={currentPage} total={totalPages} onChange={onPageChange} count={count} showAll={showAll} onToggleAll={onToggleAll} />
      )}
    </div>
  );
}

function Pagination({ current, total, onChange, count, showAll, onToggleAll }) {
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return (
    <div style={paginationStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={paginationInfoStyle}>
          {showAll ? `Toutes les ${count} lignes affichées` : `Page ${current} / ${total} · ${count} ligne${count > 1 ? "s" : ""}`}
        </span>
        <button onClick={onToggleAll} style={toggleAllBtnStyle}>
          {showAll ? "⊟ Paginer" : "⊞ Tout afficher"}
        </button>
      </div>
      {!showAll && (
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button onClick={() => onChange(current - 1)} disabled={current === 1} style={current === 1 ? pageNavDisabledStyle : pageNavStyle}>← Préc.</button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} style={{ padding: "0 4px", color: "#9ca3af", fontSize: "13px" }}>…</span>
            ) : (
              <button key={p} onClick={() => onChange(p)} style={p === current ? pageActiveBtnStyle : pageBtnStyle}>{p}</button>
            )
          )}
          <button onClick={() => onChange(current + 1)} disabled={current === total} style={current === total ? pageNavDisabledStyle : pageNavStyle}>Suiv. →</button>
        </div>
      )}
    </div>
  );
}

function BmTable({ rows }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (label) => setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  if (!rows.length) return (
    <div style={tableCardStyle}>
      <div style={tableHeaderStyle}><h2 style={sectionTitleStyle}>Performance par BM</h2></div>
      <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>Aucune donnée disponible.</div>
    </div>
  );
  return (
    <div style={tableCardStyle}>
      <div style={tableHeaderStyle}>
        <h2 style={sectionTitleStyle}>Performance par BM</h2>
        <span style={rowCountStyle}>{rows.length} BM</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead><tr style={{ background: "#f9fafb" }}>
            {["BM / Compte pub", "Dépenses", "Leads Meta", "Leads validés", "CA", "Marge", "Marge %", "ROAS", "Coût / lead", "Alertes"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((bm) => (
              <>
                <tr key={bm.label} style={{ background: "#f0f4ff", cursor: "pointer" }} onClick={() => toggle(bm.label)}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    <span style={{ marginRight: "8px", fontSize: "11px", color: "#6366f1" }}>{expanded[bm.label] ? "▼" : "▶"}</span>
                    <span style={bmBadgeStyle}>{bm.label}</span>
                    <span style={{ marginLeft: "8px", fontSize: "11px", color: "#9ca3af" }}>{bm.accounts.length} compte{bm.accounts.length > 1 ? "s" : ""}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{formatMoney(bm.spend)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{formatNumber(bm.leads)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{formatNumber(bm.validatedLeads)}</td>
                  <td style={{ ...tdStyle, color: "#10b981", fontWeight: 700 }}>{formatMoney(bm.revenue)}</td>
                  <td style={{ ...tdStyle, color: bm.margin < 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{formatMoney(bm.margin)}</td>
                  <td style={{ ...tdStyle, color: bm.marginRate < 0 ? "#ef4444" : "#374151", fontWeight: 700 }}>{formatPercent(bm.marginRate)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}><span style={{ color: asNumber(bm.roas) >= 3 ? "#10b981" : asNumber(bm.roas) >= 1 ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>{formatRatio(bm.roas)}</span></td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{formatMoney(bm.realCostPerLead)}</td>
                  <td style={tdStyle}><span style={bm.alertCount > 0 ? alertBadgeStyle : okBadgeStyle}>{formatNumber(bm.alertCount)}</span></td>
                </tr>
                {expanded[bm.label] && bm.accounts.map((acc) => (
                  <tr key={`${bm.label}-${acc.label}`} style={{ background: "white" }}>
                    <td style={{ ...tdStyle, paddingLeft: "36px", color: "#6b7280", fontSize: "12px" }}>↳ {acc.label}</td>
                    <td style={tdStyle}>{formatMoney(acc.spend)}</td>
                    <td style={tdStyle}>{formatNumber(acc.leads)}</td>
                    <td style={tdStyle}>{formatNumber(acc.validatedLeads)}</td>
                    <td style={{ ...tdStyle, color: "#10b981" }}>{formatMoney(acc.revenue)}</td>
                    <td style={{ ...tdStyle, color: acc.margin < 0 ? "#ef4444" : "#10b981" }}>{formatMoney(acc.margin)}</td>
                    <td style={{ ...tdStyle, color: acc.marginRate < 0 ? "#ef4444" : "#374151" }}>{formatPercent(acc.marginRate)}</td>
                    <td style={tdStyle}><span style={{ color: asNumber(acc.roas) >= 3 ? "#10b981" : asNumber(acc.roas) >= 1 ? "#f59e0b" : "#ef4444" }}>{formatRatio(acc.roas)}</span></td>
                    <td style={tdStyle}>{formatMoney(acc.realCostPerLead)}</td>
                    <td style={tdStyle}><span style={acc.alertCount > 0 ? alertBadgeStyle : okBadgeStyle}>{formatNumber(acc.alertCount)}</span></td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertBadges({ alerts }) {
  if (!alerts.length) return <span style={okBadgeStyle}>OK</span>;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", minWidth: "150px" }}>{alerts.map((a) => <span key={a} style={alertBadgeStyle}>{a}</span>)}</div>;
}

function Loader() {
  return (
    <div style={{ padding: "60px", textAlign: "center" }}>
      <div style={spinnerStyle} />
      <div style={{ marginTop: "20px", fontSize: "18px", fontWeight: 600, color: "#111827" }}>Chargement des dépenses Meta...</div>
      <div style={{ marginTop: "8px", color: "#6b7280", fontSize: "14px" }}>Récupération des BM, comptes et campagnes</div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rowKey(row) { return `${row.accountName}__${row.campaignName}__${row.date}`; }
function mergeCampaignRows(cur, inc) { const m = new Map(); cur.forEach((r) => m.set(rowKey(r), r)); inc.forEach((r) => m.set(rowKey(r), r)); return [...m.values()]; }
function findInheritedMarginFields(row, mf) { const p = `${row.accountName}__${row.campaignName}__`; const match = Object.entries(mf).find(([k, v]) => k.startsWith(p) && (v.client || asNumber(v.clientCpl) > 0)); return match ? { client: match[1].client || "", clientCpl: match[1].clientCpl || 0 } : {}; }
function asNumber(v) { const n = Number.parseFloat(v || 0); return Number.isFinite(n) ? n : 0; }
function getProfitAlerts(row) { const a = []; if (row.margin < 0) a.push("Marge négative"); if (row.spend > 0 && row.roas < 1) a.push("ROAS < 1"); if (row.clientCpl > 0 && row.realCostPerLead > row.clientCpl) a.push("Coût réel > CPL"); if (row.leads > 0 && row.validatedLeads === 0) a.push("0 lead validé"); return a; }
function summarize(items) { const t = items.reduce((a, r) => { a.spend += r.spend; a.leads += r.leads; a.validatedLeads += r.validatedLeads; a.revenue += r.revenue; a.margin += r.margin; a.alertCount += r.alertCount || 0; return a; }, { spend: 0, leads: 0, validatedLeads: 0, revenue: 0, margin: 0, alertCount: 0 }); t.roas = t.spend > 0 ? t.revenue / t.spend : 0; t.marginRate = t.revenue > 0 ? t.margin / t.revenue : 0; t.realCostPerLead = t.validatedLeads > 0 ? t.spend / t.validatedLeads : 0; return t; }
function groupBy(items, key) { const g = items.reduce((a, r) => { const l = r[key] || "Non renseigné"; a[l] = a[l] || []; a[l].push(r); return a; }, {}); return Object.entries(g).map(([l, rows]) => ({ label: l, ...summarize(rows) })).sort((a, b) => b.margin - a.margin); }
function groupByBm(items) {
  const bms = {};
  items.forEach((r) => {
    const bm = r.businessName || "Sans BM";
    const acc = r.accountName || "Sans compte";
    if (!bms[bm]) bms[bm] = { label: bm, accounts: {}, rows: [] };
    bms[bm].rows.push(r);
    if (!bms[bm].accounts[acc]) bms[bm].accounts[acc] = [];
    bms[bm].accounts[acc].push(r);
  });
  return Object.values(bms).map((bm) => ({
    ...bm,
    ...summarize(bm.rows),
    accounts: Object.entries(bm.accounts).map(([name, rows]) => ({ label: name, ...summarize(rows) })).sort((a, b) => b.spend - a.spend),
  })).sort((a, b) => b.spend - a.spend);
}
function buildChartData(items, mode) { const g = items.reduce((a, r) => { const d = groupDate(r.date, mode); a[d] = a[d] || { date: d, spend: 0, revenue: 0, margin: 0, leads: 0, validatedLeads: 0 }; a[d].spend += r.spend; a[d].revenue += r.revenue; a[d].margin += r.margin; a[d].leads += r.leads; a[d].validatedLeads += r.validatedLeads; return a; }, {}); return Object.values(g).map((d) => ({ ...d, roas: d.spend > 0 ? d.revenue / d.spend : 0 })).sort((a, b) => new Date(a.date) - new Date(b.date)); }
function groupDate(date, mode) { if (!date) return "Sans date"; const p = new Date(date); if (mode === "month") return date.slice(0, 7); if (mode === "week") { const d = new Date(p); d.setDate(p.getDate() - p.getDay() + 1); return d.toISOString().slice(0, 10); } return date; }
function formatMoney(v) { return `${asNumber(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function formatNumber(v) { return asNumber(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 }); }
function formatRatio(v) { return asNumber(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatPercent(v) { return asNumber(v).toLocaleString("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function escapeCsvCell(v) { return `"${String(v ?? "").replaceAll('"', '""')}"`; }
function parseMarginCsv(text) {
  const rows = parseCsvRows(text).filter((r) => r.some(Boolean));
  const headers = rows.shift()?.map(normalizeHeader) || [];
  const ci = findHeaderIndex(headers, ["campagne", "campaign", "campaign_name", "campaignname"]);
  const cli = findHeaderIndex(headers, ["client"]);
  const cpli = findHeaderIndex(headers, ["cpl_client", "cpl client", "client_cpl", "clientcpl"]);
  const vli = findHeaderIndex(headers, ["leads_valides", "leads valides", "leads_validés", "validated_leads", "validatedleads"]);
  const di = findHeaderIndex(headers, ["date", "jour", "day"]);
  const ai = findHeaderIndex(headers, ["compte", "account", "account_name", "accountname"]);
  if ([ci, cli, cpli, vli].some((i) => i === -1)) throw new Error("Colonnes manquantes");
  return rows.map((r) => ({ accountName: ai >= 0 ? r[ai]?.trim() : "", campaignName: r[ci]?.trim() || "", date: di >= 0 ? normalizeDate(r[di]) : "", client: r[cli]?.trim() || "", clientCpl: asNumber(r[cpli]), validatedLeads: asNumber(r[vli]) }));
}
function parseCsvRows(text) {
  const delim = text.split(/\r?\n/)[0]?.split(";").length >= text.split(/\r?\n/)[0]?.split(",").length ? ";" : ",";
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === delim && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && n === "\n") i++; row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell.trim()); rows.push(row); return rows;
}
function findHeaderIndex(headers, names) { return headers.findIndex((h) => names.includes(h)); }
function normalizeHeader(v) { return normalizeText(v).replaceAll("-", "_"); }
function normalizeText(v) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function normalizeDate(v) { const t = String(v || "").trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; const fr = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : t; }

// ─── Styles ───────────────────────────────────────────────────────────────────
const splashWrapStyle = { minHeight: "100vh", background: "#0f0f13", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", fontFamily: "'DM Sans', -apple-system, sans-serif", position: "relative", overflow: "hidden" };
const splashGridStyle = { position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(99,102,241,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.07) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" };
const splashContentStyle = { position: "relative", zIndex: 1, maxWidth: "620px", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "28px" };
const splashBadgeStyle = { display: "inline-block", padding: "6px 14px", borderRadius: "20px", background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.3)", fontSize: "12px", fontWeight: 600, color: "#a5b4fc", letterSpacing: "0.05em", textTransform: "uppercase" };
const splashTitleStyle = { fontFamily: "'Syne', sans-serif", fontSize: "clamp(38px, 7vw, 58px)", fontWeight: 800, color: "white", lineHeight: 1.1, margin: 0, letterSpacing: "-1px" };
const splashSubtitleStyle = { fontSize: "17px", color: "rgba(255,255,255,.5)", lineHeight: 1.7, margin: 0, maxWidth: "480px" };
const splashFeaturesStyle = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", width: "100%" };
const featureCardStyle = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "14px", padding: "18px 14px", textAlign: "center", transition: "all .2s ease" };
const splashBtnStyle = { display: "flex", alignItems: "center", gap: "12px", padding: "16px 32px", borderRadius: "14px", background: "#4f46e5", color: "white", border: "none", fontSize: "16px", fontWeight: 600, cursor: "pointer", transition: "all .2s ease", boxShadow: "0 4px 20px rgba(99,102,241,.25)" };
const appStyle = { display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" };
const sidebarStyle = { position: "fixed", top: 0, left: 0, height: "100vh", width: "260px", background: "#111827", zIndex: 100, display: "flex", flexDirection: "column", transition: "transform .25s ease", boxShadow: "4px 0 24px rgba(0,0,0,.15)" };
const sidebarHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px", borderBottom: "1px solid rgba(255,255,255,.08)" };
const logoTextStyle = { fontSize: "20px", fontWeight: 700, color: "white", letterSpacing: "-0.5px" };
const iconButtonStyle = { background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: "18px", padding: "4px" };
const navStyle = { flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "4px" };
const navBase = { display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: "10px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 500, textAlign: "left", width: "100%" };
const navItemStyle = { ...navBase, background: "transparent", color: "rgba(255,255,255,.6)" };
const activeNavStyle = { ...navBase, background: "rgba(99,102,241,.2)", color: "white" };
const sidebarFooterStyle = { padding: "16px", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: "10px" };
const userCardStyle = { display: "flex", alignItems: "center", gap: "10px", padding: "8px", background: "rgba(255,255,255,.05)", borderRadius: "10px" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 99 };
const mainStyle = { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 };
const topbarStyle = { display: "flex", alignItems: "center", gap: "16px", padding: "0 24px", height: "64px", background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 50 };
const tabStyle = { padding: "7px 16px", borderRadius: "20px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: "13px", fontWeight: 500, cursor: "pointer" };
const activeTabStyle = { ...tabStyle, background: "#111827", color: "white", border: "1px solid #111827" };
const contentStyle = { padding: "24px", flex: 1 };
const filterPanelStyle = { background: "white", borderRadius: "14px", padding: "20px", marginBottom: "20px", border: "1px solid #e5e7eb" };
const filterLabelStyle = { fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" };
const filterInputStyle = { padding: "8px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px", color: "#111827", background: "white", outline: "none" };
const dropdownStyle = { position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 200, maxHeight: "240px", overflowY: "auto", marginTop: "4px" };
const dropdownItemStyle = { display: "flex", alignItems: "center", padding: "8px 12px", cursor: "pointer", fontSize: "13px", color: "#111827" };
const clearBtnStyle = { display: "block", width: "100%", padding: "8px 12px", background: "#f3f4f6", border: "none", borderBottom: "1px solid #e5e7eb", fontSize: "12px", color: "#6366f1", fontWeight: 600, cursor: "pointer", textAlign: "left" };
const primaryActionStyle = { padding: "9px 18px", borderRadius: "9px", background: "#4f46e5", color: "white", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const secondaryActionStyle = { padding: "9px 14px", borderRadius: "9px", background: "white", color: "#374151", border: "1px solid #e5e7eb", fontSize: "13px", fontWeight: 500, cursor: "pointer" };
const kpiGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "20px" };
const kpiCardStyle = { background: "white", borderRadius: "12px", padding: "16px 18px", border: "1px solid #e5e7eb" };
const kpiLabelStyle = { fontSize: "12px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" };
const tableCardStyle = { background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", marginBottom: "20px", overflow: "hidden" };
const tableHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid #f3f4f6" };
const sectionTitleStyle = { fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 };
const rowCountStyle = { fontSize: "13px", color: "#9ca3af", background: "#f3f4f6", padding: "4px 10px", borderRadius: "20px" };
const tableStyle = { width: "100%", minWidth: "1500px", borderCollapse: "collapse" };
const thStyle = { padding: "12px 14px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" };
const tdStyle = { padding: "12px 14px", fontSize: "13px", color: "#374151", verticalAlign: "middle", borderBottom: "1px solid #f3f4f6" };
const cellInputStyle = { padding: "7px 10px", borderRadius: "7px", border: "1px solid #e5e7eb", fontSize: "13px", color: "#111827", background: "white", width: "120px", outline: "none" };
const bmBadgeStyle = { display: "inline-block", padding: "2px 8px", borderRadius: "20px", background: "#eef2ff", color: "#4338ca", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" };
const alertBadgeStyle = { display: "inline-block", padding: "2px 8px", borderRadius: "20px", background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" };
const okBadgeStyle = { display: "inline-block", padding: "2px 8px", borderRadius: "20px", background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 600 };
const spinnerStyle = { width: "48px", height: "48px", border: "4px solid #e5e7eb", borderTop: "4px solid #4f46e5", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" };
// ─── Utilitaires date ────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function lastMonth() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const start = d.toISOString().slice(0, 10); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); return { start, end: last.toISOString().slice(0, 10) }; }

const shortcutBtnStyle = { padding: "5px 10px", borderRadius: "20px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "12px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" };
const autoRefreshBtnStyle = { display: "flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "20px", border: "1px solid", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: "none" };
const toggleAllBtnStyle = { padding: "4px 10px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "white", color: "#6366f1", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const paginationStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: "1px solid #f3f4f6", flexWrap: "wrap", gap: "10px" };
const paginationInfoStyle = { fontSize: "13px", color: "#9ca3af" };
const pageBtnStyle = { width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "13px", cursor: "pointer", fontWeight: 500 };
const pageActiveBtnStyle = { ...pageBtnStyle, background: "#111827", color: "white", border: "1px solid #111827" };
const pageNavStyle = { padding: "0 12px", height: "34px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "white", color: "#374151", fontSize: "13px", cursor: "pointer", fontWeight: 500 };
const pageNavDisabledStyle = { ...pageNavStyle, color: "#d1d5db", cursor: "not-allowed" };
