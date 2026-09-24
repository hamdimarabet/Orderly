"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Plus, X, Zap, Clock, GitBranch, MessageSquare, Tag as TagIcon,
  Star, Bell, Trash2, Play, Pause, Settings2, ChevronRight,
  Package, TrendingUp, Users,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

const TRIGGERS = [
  { key: "order_status_changed", label: "Statut de commande", icon: Package, color: "bg-blue-100 text-blue-700" },
  { key: "review_received", label: "Avis reçu", icon: Star, color: "bg-amber-100 text-amber-700" },
  { key: "order_created", label: "Nouvelle commande", icon: Plus, color: "bg-emerald-100 text-emerald-700" },
  { key: "customer_inactive", label: "Client inactif", icon: Users, color: "bg-purple-100 text-purple-700" },
];

const NODE_TYPES = [
  { key: "delay", label: "Attendre", icon: Clock, color: "bg-slate-100 text-slate-700" },
  { key: "condition", label: "Condition", icon: GitBranch, color: "bg-orange-100 text-orange-700" },
  { key: "sms", label: "SMS", icon: MessageSquare, color: "bg-green-100 text-green-700" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "bg-emerald-100 text-emerald-700" },
  { key: "review", label: "Demander avis", icon: Star, color: "bg-amber-100 text-amber-700" },
  { key: "tag", label: "Ajouter tag", icon: TagIcon, color: "bg-indigo-100 text-indigo-700" },
  { key: "notify", label: "Notifier équipe", icon: Bell, color: "bg-rose-100 text-rose-700" },
];

const TEMPLATES = [
  {
    name: "Demande d'avis après livraison",
    description: "2h après la livraison, envoie un SMS avec un lien d'avis",
    triggerType: "order_status_changed",
    triggerConfig: { statuses: ["LIVRE"] },
    nodes: [
      { id: "t1", type: "trigger", data: { label: "Commande livrée" }, position: { x: 100, y: 100 } },
      { id: "d1", type: "delay", data: { value: 2, unit: "hours" }, position: { x: 100, y: 220 } },
      { id: "r1", type: "review", data: {}, position: { x: 100, y: 340 } },
      { id: "s1", type: "sms", data: { message: "Bonjour {{customerName}}, merci pour votre commande ! Notez-nous : {{reviewLink}}" }, position: { x: 100, y: 460 } },
    ],
    edges: [
      { id: "e1", source: "t1", target: "d1" },
      { id: "e2", source: "d1", target: "r1" },
      { id: "e3", source: "r1", target: "s1" },
    ],
  },
  {
    name: "Suivi des avis négatifs",
    description: "Note ≤ 3 → alerte équipe immédiate",
    triggerType: "review_received",
    triggerConfig: { maxRating: 3 },
    nodes: [
      { id: "t1", type: "trigger", data: { label: "Avis reçu" }, position: { x: 100, y: 100 } },
      { id: "c1", type: "condition", data: { field: "rating", operator: "lte", value: 3 }, position: { x: 100, y: 220 } },
      { id: "n1", type: "notify", data: { title: "Avis négatif", message: "{{customerName}} a noté {{rating}}/5" }, position: { x: 50, y: 340 } },
      { id: "g1", type: "tag", data: { tag: "Réclamation" }, position: { x: 50, y: 460 } },
    ],
    edges: [
      { id: "e1", source: "t1", target: "c1" },
      { id: "e2", source: "c1", target: "n1", label: "yes" },
      { id: "e3", source: "n1", target: "g1" },
    ],
  },
  {
    name: "Récupération commande refusée",
    description: "24h après un refus, relance avec une offre",
    triggerType: "order_status_changed",
    triggerConfig: { statuses: ["ANNULE"] },
    nodes: [
      { id: "t1", type: "trigger", data: { label: "Commande annulée" }, position: { x: 100, y: 100 } },
      { id: "d1", type: "delay", data: { value: 24, unit: "hours" }, position: { x: 100, y: 220 } },
      { id: "s1", type: "sms", data: { message: "{{customerName}}, votre commande vous attend toujours ! -10% avec le code RETOUR10" }, position: { x: 100, y: 340 } },
    ],
    edges: [
      { id: "e1", source: "t1", target: "d1" },
      { id: "e2", source: "d1", target: "s1" },
    ],
  },
];

function FlowsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editFlow, setEditFlow] = useState<any>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/flows`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setFlows(Array.isArray(data) ? data : []);
    } catch {
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  async function toggleFlow(flow: any) {
    await fetch(`${API}/flows/${flow.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive: !flow.isActive }),
    });
    fetchFlows();
  }

  async function removeFlow(id: string) {
    if (!window.confirm("Supprimer ce flow ?")) return;
    await fetch(`${API}/flows/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchFlows();
  }

  async function createFromTemplate(tpl: any) {
    await fetch(`${API}/flows`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: tpl.name,
        description: tpl.description,
        triggerType: tpl.triggerType,
        triggerConfig: tpl.triggerConfig,
        nodes: tpl.nodes,
        edges: tpl.edges,
      }),
    });
    setShowTemplates(false);
    fetchFlows();
  }

  async function createBlank() {
    const res = await fetch(`${API}/flows`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Nouveau flow",
        triggerType: "order_status_changed",
        triggerConfig: {},
        nodes: [
          { id: "t1", type: "trigger", data: { label: "Déclencheur" }, position: { x: 100, y: 100 } },
        ],
        edges: [],
      }),
    });
    const flow = await res.json();
    setShowTemplates(false);
    fetchFlows();
    setEditFlow(flow);
  }

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
            <h1 className="text-base font-semibold">Automatisations</h1>
            <p className="text-xs text-muted">Flows marketing déclenchés automatiquement</p>
          </div>
          <Button size="sm" onClick={() => setShowTemplates(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nouveau flow
          </Button>
        </header>

        <div className="flex-1 p-3 md:overflow-y-auto md:p-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : flows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Zap className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune automatisation</p>
              <p className="mt-1 text-center text-xs text-muted max-w-sm">
                Créez un flow pour envoyer des messages automatiques, demander des avis
                ou relancer vos clients.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setShowTemplates(true)}>
                <Plus className="h-3.5 w-3.5" />
                Créer un flow
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.map((f) => {
                const trigger = TRIGGERS.find((t) => t.key === f.triggerType);
                const TriggerIcon = trigger?.icon ?? Zap;
                const nodeCount = (f.nodes?.length ?? 1) - 1;

                return (
                  <div
                    key={f.id}
                    className={cn(
                      "rounded-xl border bg-surface p-4 transition-colors",
                      f.isActive ? "border-primary/30" : "border-border opacity-70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          trigger?.color ?? "bg-surface-sunken"
                        )}>
                          <TriggerIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{f.name}</p>
                          <p className="truncate text-xs text-muted">
                            {f.description || trigger?.label}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                            <span className="rounded bg-surface-sunken px-2 py-0.5">
                              {nodeCount} étape{nodeCount > 1 ? "s" : ""}
                            </span>
                            <span className="rounded bg-surface-sunken px-2 py-0.5">
                              {f._count?.runs ?? 0} exécution{(f._count?.runs ?? 0) > 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => toggleFlow(f)}
                          className={cn(
                            "flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium",
                            f.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {f.isActive ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                          {f.isActive ? "Actif" : "Inactif"}
                        </button>
                        <button
                          onClick={() => setEditFlow(f)}
                          className="rounded-md p-1.5 text-muted hover:bg-surface-sunken"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeFlow(f.id)}
                          className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Node preview */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                      {(f.nodes ?? []).map((n: any, i: number) => {
                        const meta = n.type === "trigger"
                          ? { label: n.data?.label ?? "Déclencheur", icon: TriggerIcon, color: trigger?.color }
                          : NODE_TYPES.find((t) => t.key === n.type);
                        const Icon = meta?.icon ?? Zap;
                        return (
                          <div key={n.id} className="flex items-center gap-1.5">
                            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-light" />}
                            <span className={cn(
                              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium",
                              meta?.color ?? "bg-surface-sunken text-muted"
                            )}>
                              <Icon className="h-3 w-3" />
                              {meta?.label ?? n.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onPick={createFromTemplate}
          onBlank={createBlank}
        />
      )}

      {editFlow && (
        <FlowEditor
          flow={editFlow}
          onClose={() => setEditFlow(null)}
          onSaved={fetchFlows}
        />
      )}
    </div>
  );
}

function TemplatesModal({
  onClose,
  onPick,
  onBlank,
}: {
  onClose: () => void;
  onPick: (tpl: any) => void;
  onBlank: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col border-border bg-surface shadow-2xl md:h-auto md:max-h-[85vh] md:max-w-2xl md:rounded-xl md:border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Choisir un modèle</h2>
            <p className="text-xs text-muted">Démarrez vite avec un flow prêt à l'emploi</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {TEMPLATES.map((tpl) => {
            const trigger = TRIGGERS.find((t) => t.key === tpl.triggerType);
            const Icon = trigger?.icon ?? Zap;
            return (
              <button
                key={tpl.name}
                onClick={() => onPick(tpl)}
                className="flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft/30"
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  trigger?.color ?? "bg-surface-sunken"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{tpl.name}</p>
                  <p className="text-xs text-muted">{tpl.description}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tpl.nodes.filter((n: any) => n.type !== "trigger").map((n: any) => {
                      const meta = NODE_TYPES.find((t) => t.key === n.type);
                      return (
                        <span key={n.id} className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          meta?.color ?? "bg-surface-sunken text-muted"
                        )}>
                          {meta?.label ?? n.type}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </button>
            );
          })}

          <button
            onClick={onBlank}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-4 text-left transition-colors hover:border-primary"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
              <Plus className="h-5 w-5 text-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold">Partir de zéro</p>
              <p className="text-xs text-muted">Construire votre propre flow</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function FlowEditor({
  flow,
  onClose,
  onSaved,
}: {
  flow: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(flow.name);
  const [triggerType, setTriggerType] = useState(flow.triggerType);
  const [triggerConfig, setTriggerConfig] = useState<any>(flow.triggerConfig ?? {});
  const [nodes, setNodes] = useState<any[]>(flow.nodes ?? []);
  const [edges, setEdges] = useState<any[]>(flow.edges ?? []);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const current = nodes.find((n) => n.id === selectedNode);

  function addNode(type: string) {
    const id = `n${Date.now()}`;
    const last = nodes[nodes.length - 1];

    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        data: defaultData(type),
        position: { x: 100, y: (last?.position?.y ?? 100) + 120 },
      },
    ]);

    if (last) {
      setEdges((prev) => [...prev, { id: `e${Date.now()}`, source: last.id, target: id }]);
    }
    setSelectedNode(id);
  }

  function defaultData(type: string) {
    switch (type) {
      case "delay": return { value: 1, unit: "hours" };
      case "condition": return { field: "rating", operator: "gte", value: 4 };
      case "sms":
      case "whatsapp": return { message: "" };
      case "tag": return { tag: "" };
      case "notify": return { title: "", message: "" };
      default: return {};
    }
  }

  function updateNodeData(id: string, patch: any) {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
  }

  function removeNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    setSelectedNode(null);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`${API}/flows/${flow.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, triggerType, triggerConfig, nodes, edges }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col bg-surface">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-64 text-sm font-semibold"
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" disabled={saving} onClick={save}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Canvas */}
          <div className="flex-1 overflow-y-auto bg-surface-sunken/30 p-6">
            <div className="mx-auto max-w-md space-y-0">
              {nodes.map((n, i) => {
                const isTrigger = n.type === "trigger";
                const trigger = TRIGGERS.find((t) => t.key === triggerType);
                const meta = isTrigger
                  ? { label: trigger?.label ?? "Déclencheur", icon: trigger?.icon ?? Zap, color: trigger?.color }
                  : NODE_TYPES.find((t) => t.key === n.type);
                const Icon = meta?.icon ?? Zap;

                return (
                  <div key={n.id}>
                    {i > 0 && (
                      <div className="mx-auto h-6 w-px bg-border-strong" />
                    )}
                    <button
                      onClick={() => setSelectedNode(n.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border-2 bg-surface p-3 text-left transition-all",
                        selectedNode === n.id
                          ? "border-primary shadow-md"
                          : "border-border hover:border-border-strong"
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        meta?.color ?? "bg-surface-sunken"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{meta?.label ?? n.type}</p>
                        <p className="truncate text-[11px] text-muted">
                          {describeNode(n)}
                        </p>
                      </div>
                    </button>
                  </div>
                );
              })}

              {/* Add node */}
              <div className="mx-auto h-6 w-px bg-border-strong" />
              <div className="rounded-xl border-2 border-dashed border-border p-3">
                <p className="mb-2 text-center text-[11px] text-muted">Ajouter une étape</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {NODE_TYPES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => addNode(t.key)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium hover:border-primary hover:bg-primary-soft/30"
                    >
                      <t.icon className="h-3 w-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Inspector */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-border p-4">
            {!current ? (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Déclencheur
                </p>
                <div className="space-y-1.5">
                  {TRIGGERS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTriggerType(t.key)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border-2 p-2.5 text-left transition-colors",
                        triggerType === t.key ? "border-primary bg-primary-soft/30" : "border-border"
                      )}
                    >
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.color)}>
                        <t.icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>

                {triggerType === "order_status_changed" && (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs font-medium text-muted">
                      Statuts déclencheurs
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {["LIVRE", "PAYE", "ANNULE", "RETOUR", "A_PREPARER"].map((s) => {
                        const active = (triggerConfig.statuses ?? []).includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              const list = triggerConfig.statuses ?? [];
                              setTriggerConfig({
                                ...triggerConfig,
                                statuses: active ? list.filter((x: string) => x !== s) : [...list, s],
                              });
                            }}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-medium",
                              active ? "bg-primary text-white" : "bg-surface-sunken text-muted"
                            )}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="mt-6 text-[11px] text-muted">
                  Cliquez sur une étape du flow pour la configurer.
                </p>
              </div>
            ) : (
              <NodeInspector
                node={current}
                onChange={(patch) => updateNodeData(current.id, patch)}
                onRemove={() => removeNode(current.id)}
                onClose={() => setSelectedNode(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function describeNode(n: any): string {
  const d = n.data ?? {};
  switch (n.type) {
    case "trigger": return "Point de départ";
    case "delay": return `${d.value} ${d.unit === "minutes" ? "minutes" : d.unit === "days" ? "jours" : "heures"}`;
    case "condition": return `${d.field} ${d.operator} ${d.value}`;
    case "sms":
    case "whatsapp": return d.message?.slice(0, 40) || "Message vide";
    case "tag": return d.tag || "Tag non défini";
    case "notify": return d.title || "Notification";
    case "review": return "Génère un lien d'avis";
    default: return "";
  }
}

function NodeInspector({
  node,
  onChange,
  onRemove,
  onClose,
}: {
  node: any;
  onChange: (patch: any) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const d = node.data ?? {};
  const meta = NODE_TYPES.find((t) => t.key === node.type);

  if (node.type === "trigger") {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Déclencheur</p>
        <p className="mt-2 text-xs text-muted">
          Configurez le déclencheur dans le panneau principal.
        </p>
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={onClose}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {meta?.label ?? node.type}
        </p>
        <button onClick={onClose} className="rounded p-1 hover:bg-surface-sunken">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {node.type === "delay" && (
        <div className="flex gap-2">
          <Input
            type="number"
            value={d.value ?? 1}
            onChange={(e) => onChange({ value: parseInt(e.target.value) || 1 })}
            min={1}
            className="h-8 w-20 text-xs"
          />
          <select
            value={d.unit ?? "hours"}
            onChange={(e) => onChange({ unit: e.target.value })}
            className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Heures</option>
            <option value="days">Jours</option>
          </select>
        </div>
      )}

      {node.type === "condition" && (
        <div className="space-y-2">
          <select
            value={d.field ?? "rating"}
            onChange={(e) => onChange({ field: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs"
          >
            <option value="rating">Note de l'avis</option>
            <option value="total">Montant commande</option>
            <option value="orderCount">Nombre de commandes</option>
            <option value="city">Gouvernorat</option>
            <option value="status">Statut</option>
          </select>
          <select
            value={d.operator ?? "gte"}
            onChange={(e) => onChange({ operator: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs"
          >
            <option value="eq">Égal à</option>
            <option value="ne">Différent de</option>
            <option value="gt">Supérieur à</option>
            <option value="gte">Supérieur ou égal</option>
            <option value="lt">Inférieur à</option>
            <option value="lte">Inférieur ou égal</option>
            <option value="contains">Contient</option>
          </select>
          <Input
            value={d.value ?? ""}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Valeur"
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted">
            La branche "oui" suit la première étape ajoutée après cette condition.
          </p>
        </div>
      )}

      {(node.type === "sms" || node.type === "whatsapp") && (
        <div className="space-y-2">
          <textarea
            value={d.message ?? ""}
            onChange={(e) => onChange({ message: e.target.value })}
            rows={5}
            placeholder="Bonjour {{customerName}}, ..."
            className="w-full rounded-md border border-border bg-surface p-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="flex flex-wrap gap-1">
            {["customerName", "orderNumber", "total", "rating"].map((v) => (
              <button
                key={v}
                onClick={() => onChange({ message: (d.message ?? "") + `{{${v}}}` })}
                className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted hover:bg-primary-soft hover:text-primary"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {node.type === "tag" && (
        <Input
          value={d.tag ?? ""}
          onChange={(e) => onChange({ tag: e.target.value })}
          placeholder="ex: VIP"
          className="h-8 text-xs"
        />
      )}

      {node.type === "notify" && (
        <div className="space-y-2">
          <Input
            value={d.title ?? ""}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Titre"
            className="h-8 text-xs"
          />
          <textarea
            value={d.message ?? ""}
            onChange={(e) => onChange({ message: e.target.value })}
            rows={3}
            placeholder="Message"
            className="w-full rounded-md border border-border bg-surface p-2 text-xs focus-visible:outline-none"
          />
        </div>
      )}

      {node.type === "review" && (
        <p className="text-[11px] text-muted">
          Génère un lien unique d'avis pour ce client. Utilisez ensuite un SMS
          avec la variable du lien.
        </p>
      )}

      <Button variant="destructive" size="sm" className="w-full" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
        Supprimer cette étape
      </Button>
    </div>
  );
}

export default function FlowsPage() {
  return (
    <RouteGuard>
      <FlowsContent />
    </RouteGuard>
  );
}