"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodFilter, getPeriodRange, type Period } from "@/components/stats/period-filter";
import { cn } from "@/lib/utils";
import {
  Plus, X, Users, Play, Pause, Trash2, Shuffle,
  Store as StoreIcon, Package, Coins, MapPin, Settings2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
  isAvailable: boolean;
  note: string | null;
  todayCount: number;
  rules: any[];
}

function DispatchContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<"CONFIRMATION" | "PREPARATION" | "SCAN">("CONFIRMATION");
  const [period, setPeriod] = useState<Period>(getPeriodRange("all"));
  const [redistributing, setRedistributing] = useState(false);
  const [ruleAgent, setRuleAgent] = useState<Agent | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("stage", stage);
      if (period.from) params.set("from", period.from.toISOString());
      if (period.to) params.set("to", period.to.toISOString());

      const res = await fetch(`${API}/dispatch/agents?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [period, stage]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function toggleAvailability(a: Agent) {
    await fetch(`${API}/dispatch/agents/${a.id}/availability`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive: !a.isAvailable, stage }),
    });
    fetchAgents();
  }
  async function redistribute() {
    setRedistributing(true);
    try {
      const res = await fetch(`${API}/dispatch/redistribute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      alert(`${data.moved} commandes redistribuées.`);
      fetchAgents();
    } finally {
      setRedistributing(false);
    }
  }
  async function runDispatch() {
    setRunning(true);
    try {
      const res = await fetch(`${API}/dispatch/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storeIds: selectedStoreIds }),
      });
      const data = await res.json();

      let msg = `${data.assigned} commandes réparties.`;
      if (data.unassigned > 0) {
        msg += `\n${data.unassigned} non assignées (aucun agent correspondant).`;
      }
      alert(msg);
      fetchAgents();
    } finally {
      setRunning(false);
    }
  }

  const available = agents.filter((a) => a.isAvailable);
  const paused = agents.filter((a) => !a.isAvailable);
  const totalToday = agents.reduce((s, a) => s + ((a as any).stats?.total ?? 0), 0);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-y-auto overflow-x-hidden pt-14 md:overflow-y-hidden md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <div>
            <h1 className="text-base font-semibold">Répartition</h1>
            <p className="text-xs text-muted">
              {available.length} agent{available.length > 1 ? "s" : ""} actif
              {available.length > 1 ? "s" : ""} · {totalToday} commandes aujourd'hui
            </p>
          </div>
          <Button size="sm" disabled={running} onClick={runDispatch}>
            <Shuffle className={cn("h-3.5 w-3.5", running && "animate-spin")} />
            {running ? "Répartition..." : "Répartir maintenant"}
          </Button>
        </header>
        <div className="flex gap-1 border-b border-border bg-surface px-3 py-2 md:px-5">
          {[
            { key: "CONFIRMATION", label: "Confirmation" },
            { key: "PREPARATION", label: "Préparation" },
            { key: "SCAN", label: "Scan retours" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setStage(t.key as any)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                stage === t.key
                  ? "bg-primary text-white"
                  : "text-muted hover:bg-surface-sunken"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 md:px-5 md:py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
          <Button size="sm" variant="secondary" disabled={redistributing} onClick={redistribute}>
            <Shuffle className={cn("h-3.5 w-3.5", redistributing && "animate-spin")} />
            Redistribuer les non traitées
          </Button>
        </div>

        <div className="flex-1 p-3 md:overflow-y-auto md:p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Users className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun agent</p>
              <p className="mt-1 text-xs text-muted">
                Invitez des membres depuis la page Utilisateurs.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Active agents */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  En service ({available.length})
                </p>
                <div className="space-y-2.5">
                  {available.map((a) => (
                    <AgentCard
                      key={a.id}
                      agent={a}
                      stores={accessibleStores}
                      onToggle={() => toggleAvailability(a)}
                      onRules={() => setRuleAgent(a)}
                      onRefresh={fetchAgents}
                    />
                  ))}
                  {available.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
                      Aucun agent en service. Les commandes ne seront pas réparties.
                    </p>
                  )}
                </div>
              </div>

              {/* Paused agents */}
              {paused.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    En pause ({paused.length})
                  </p>
                  <div className="space-y-2.5">
                    {paused.map((a) => (
                      <AgentCard
                        key={a.id}
                        agent={a}
                        stores={accessibleStores}
                        onToggle={() => toggleAvailability(a)}
                        onRules={() => setRuleAgent(a)}
                        onRefresh={fetchAgents}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {ruleAgent && (
        <RulesModal
          agent={ruleAgent}
          stores={accessibleStores}
          stage={stage}
          onClose={() => setRuleAgent(null)}
          onSaved={fetchAgents}
        />
      )}
    </div>
  );
}

function AgentCard({
    agent,
    stores,
    onToggle,
    onRules,
    onRefresh,
  }: {
    agent: any;
    stores: { id: string; name: string }[];
    onToggle: () => void;
    onRules: () => void;
    onRefresh: () => void;
  }) {
    const s = agent.stats ?? { total: 0, confirmed: 0, refused: 0, pending: 0, treatedRate: 0 };
  
    return (
      <div
        className={cn(
          "rounded-xl border bg-surface p-3.5",
          agent.isAvailable ? "border-border" : "border-border opacity-60"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                agent.isAvailable ? "bg-primary" : "bg-slate-400"
              )}
            >
              {agent.name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{agent.name}</p>
              <p className="truncate text-xs text-muted">{agent.email}</p>
            </div>
          </div>
  
          <div className="flex shrink-0 items-center gap-2">
            <div className="text-right">
              <p className="font-mono text-lg font-bold text-primary">{s.total}</p>
              <p className="text-[10px] text-muted">assignées</p>
            </div>
            <button
              onClick={onToggle}
              className={cn(
                "flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium",
                agent.isAvailable
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              {agent.isAvailable ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {agent.isAvailable ? "Actif" : "Pause"}
            </button>
          </div>
        </div>
  
        {/* Stats */}
        {s.total > 0 && (
          <div className="mt-3 rounded-lg bg-surface-sunken p-2.5">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-status-delivered">
                <span className="font-mono font-bold">{s.confirmed}</span> confirmées
              </span>
              <span className="text-status-cancelled">
                <span className="font-mono font-bold">{s.refused}</span> refusées
              </span>
              <span className="text-status-processing">
                <span className="font-mono font-bold">{s.pending}</span> en attente
              </span>
            </div>
  
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-white">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    s.treatedRate >= 80 ? "bg-status-delivered" :
                    s.treatedRate >= 50 ? "bg-status-processing" :
                    "bg-status-cancelled"
                  )}
                  style={{ width: `${s.treatedRate}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-medium text-muted">
                {s.treatedRate}% traité
              </span>
            </div>
          </div>
        )}
  
        {/* Rules */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {agent.rules.length === 0 ? (
            <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] text-muted">
              Reçoit de tout
            </span>
          ) : (
            agent.rules.map((r: any) => (
              <RuleBadge key={r.id} rule={r} stores={stores} />
            ))
          )}
          <button
            onClick={onRules}
            className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted hover:border-primary hover:text-primary"
          >
            <Settings2 className="h-3 w-3" />
            Règles
          </button>
        </div>
      </div>
    );
  }

function RuleBadge({ rule, stores }: { rule: any; stores: { id: string; name: string }[] }) {
  const parts: { icon: any; text: string }[] = [];

  if (rule.storeId) {
    parts.push({
      icon: StoreIcon,
      text: stores.find((s) => s.id === rule.storeId)?.name ?? "Magasin",
    });
  }
  if (rule.productSku) parts.push({ icon: Package, text: rule.productSku });
  if (rule.minTotal) parts.push({ icon: Coins, text: `> ${Number(rule.minTotal)} TND` });
  if (rule.maxTotal) parts.push({ icon: Coins, text: `< ${Number(rule.maxTotal)} TND` });
  if (rule.city) parts.push({ icon: MapPin, text: rule.city });

  if (parts.length === 0) return null;

  return (
    <span className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-primary/40">+</span>}
          <p.icon className="h-3 w-3" />
          {p.text}
        </span>
      ))}
    </span>
  );
}

function RulesModal({
  agent,
  stores,
  stage,
  onClose,
  onSaved,
}: {
  agent: Agent;
  stores: { id: string; name: string }[];
  stage: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState("");
  const [productSku, setProductSku] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(agent.rules);

  async function addRule() {
    if (!storeId && !productSku && !minTotal && !maxTotal && !city) return;

    setBusy(true);
    try {
      const res = await fetch(`${API}/dispatch/rules`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: agent.id,
          stage,
          storeId: storeId || undefined,
          productSku: productSku || undefined,
          minTotal: minTotal ? parseFloat(minTotal) : undefined,
          maxTotal: maxTotal ? parseFloat(maxTotal) : undefined,
          city: city || undefined,
        }),
      });
      const created = await res.json();
      setRules((prev) => [...prev, created]);

      setStoreId(""); setProductSku(""); setMinTotal(""); setMaxTotal(""); setCity("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(id: string) {
    await fetch(`${API}/dispatch/rules/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setRules((prev) => prev.filter((r) => r.id !== id));
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col border-border bg-surface shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-md md:rounded-xl md:border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Règles — {agent.name}</h2>
            <p className="text-xs text-muted">
              Ce que cet agent doit recevoir
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-[11px] text-primary">
            <p className="font-semibold">Comment ça marche</p>
            <p className="mt-0.5">
              Sans règle, l'agent reçoit de tout. Avec une ou plusieurs règles,
              il ne reçoit que les commandes qui correspondent. Si plusieurs agents
              ont la même règle, les commandes se répartissent équitablement.
            </p>
          </div>

          {rules.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Règles actives
              </p>
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <RuleBadge rule={r} stores={stores} />
                  <button
                    onClick={() => removeRule(r.id)}
                    className="shrink-0 text-muted hover:text-status-cancelled"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Ajouter une règle
            </p>

            <div>
              <label className="mb-1 block text-[11px] text-muted">Magasin</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs focus-visible:outline-none"
              >
                <option value="">Tous les magasins</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-muted">SKU produit (optionnel)</label>
              <Input
                value={productSku}
                onChange={(e) => setProductSku(e.target.value)}
                placeholder="ex: masquecollagene"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Montant min</label>
                <Input
                  type="number"
                  value={minTotal}
                  onChange={(e) => setMinTotal(e.target.value)}
                  placeholder="TND"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Montant max</label>
                <Input
                  type="number"
                  value={maxTotal}
                  onChange={(e) => setMaxTotal(e.target.value)}
                  placeholder="TND"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-muted">Gouvernorat (optionnel)</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="ex: Tunis"
                className="h-8 text-xs"
              />
            </div>

            <Button size="sm" className="w-full" disabled={busy} onClick={addRule}>
              <Plus className="h-3.5 w-3.5" />
              {busy ? "Ajout..." : "Ajouter la règle"}
            </Button>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DispatchPage() {
  return (
    <RouteGuard>
      <DispatchContent />
    </RouteGuard>
  );
}