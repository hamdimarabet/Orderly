"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Users, Send, Zap, Plus, X, Trash2, Play, Pause,
  Megaphone, Eye, CheckCircle2, AlertTriangle, Sparkles,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function money(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

interface Segment {
  id: string;
  name: string;
  description: string | null;
  rules: any;
  isSystem: boolean;
  size: number;
}

interface Campaign {
  id: string;
  name: string;
  message: string;
  storeId: string | null;
  recipients: { phone: string; name?: string }[] | null;
  segmentId: string | null;
  segment?: { name: string };
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string;
}

interface Flow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  triggerConfig: any;
  segmentId: string | null;
  segment?: { name: string };
  message: string;
  delayHours: number;
  isActive: boolean;
  totalSent: number;
}

const TRIGGERS = [
  { key: "LOW_STOCK", label: "Stock bientôt épuisé", desc: "Quand un produit passe sous le seuil" },
  { key: "NEW_PRODUCT", label: "Nouveau produit", desc: "Quand un produit est ajouté" },
  { key: "INACTIVE_CUSTOMER", label: "Client inactif", desc: "Après X jours sans commande" },
  { key: "AFTER_DELIVERY", label: "Après livraison", desc: "Message de satisfaction" },
  { key: "ABANDONED", label: "Commande non confirmée", desc: "Relance après tentatives" },
];

const VARIABLES = ["{{nom}}", "{{ville}}", "{{commandes}}", "{{valeur}}", "{{produit}}", "{{lien}}"];

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-surface-sunken text-muted",
  SCHEDULED: "bg-status-processing-bg text-status-processing",
  SENDING: "bg-status-shipped-bg text-status-shipped",
  SENT: "bg-status-delivered-bg text-status-delivered",
  FAILED: "bg-status-cancelled-bg text-status-cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Programmée",
  SENDING: "Envoi en cours",
  SENT: "Envoyée",
  FAILED: "Échec",
};

function SegmentModal({
  stores,
  onClose,
  onSaved,
}: {
  stores: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minOrders, setMinOrders] = useState("");
  const [minLtv, setMinLtv] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [maxReturnRate, setMaxReturnRate] = useState("");
  const [minConfirmationRate, setMinConfirmationRate] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  function buildRules() {
    const r: any = {};
    if (minOrders) r.minOrders = parseInt(minOrders);
    if (minLtv) r.minLtv = parseFloat(minLtv);
    if (inactiveDays) r.inactiveDays = parseInt(inactiveDays);
    if (maxReturnRate) r.maxReturnRate = parseInt(maxReturnRate);
    if (minConfirmationRate) r.minConfirmationRate = parseInt(minConfirmationRate);
    return r;
  }

  async function doPreview() {
    try {
      const res = await fetch(`${API}/marketing/segments/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rules: buildRules(), storeIds }),
      });
      setPreview(await res.json());
    } catch {}
  }

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/marketing/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, rules: buildRules(), storeIds }),
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouveau segment</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Magasins</label>
            <div className="flex flex-wrap gap-2">
              {stores.map((s) => {
                const active = storeIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setStoreIds((prev) =>
                        active ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                      )
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-white"
                        : "bg-surface-sunken text-muted hover:bg-border"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Aucun sélectionné = tous les magasins. Chaque client reçoit
              le SMS avec l'expéditeur de son magasin.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom du segment</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Gros acheteurs Tunis" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
          </div>

          <div className="rounded-lg border border-border p-3.5 space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Critères</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Commandes min.</label>
                <Input type="number" value={minOrders} onChange={(e) => setMinOrders(e.target.value)} placeholder="ex: 2" className="h-8 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Valeur min. (TND)</label>
                <Input type="number" value={minLtv} onChange={(e) => setMinLtv(e.target.value)} placeholder="ex: 500" className="h-8 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Inactif depuis (jours)</label>
                <Input type="number" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} placeholder="ex: 30" className="h-8 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Retours max. (%)</label>
                <Input type="number" value={maxReturnRate} onChange={(e) => setMaxReturnRate(e.target.value)} placeholder="ex: 20" className="h-8 text-xs" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-[11px] text-muted">Taux confirmation min. (%)</label>
                <Input type="number" value={minConfirmationRate} onChange={(e) => setMinConfirmationRate(e.target.value)} placeholder="ex: 70" className="h-8 text-xs" />
              </div>
            </div>
            <Button size="sm" variant="secondary" className="w-full" onClick={doPreview}>
              <Eye className="h-3.5 w-3.5" />
              Aperçu du segment
            </Button>
          </div>

          {preview && (
            <div className="rounded-lg border-2 border-primary bg-primary-soft p-3.5">
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-primary">{preview.size}</p>
                <p className="text-xs text-primary">clients correspondent</p>
              </div>
              <p className="mt-1 text-[11px] text-primary/70">
                Valeur cumulée : {money(preview.totalValue)} TND
              </p>
              {preview.sample?.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {preview.sample.slice(0, 4).map((s: any, i: number) => (
                    <p key={i} className="text-[11px] text-primary/80">
                      {s.name} · {s.totalOrders} cmd · {money(s.lifetimeValue)} TND
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !name.trim()} onClick={save}>
            {loading ? "Création..." : "Créer le segment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CampaignModal({
  segments,
  stores,
  defaultStoreId,
  onClose,
  onSaved,
}: {
  segments: Segment[];
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [mode, setMode] = useState<"segment" | "manual">("segment");
  const [segmentId, setSegmentId] = useState("");
  const [numbers, setNumbers] = useState<{ phone: string; name?: string }[]>([]);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = segments.find((s) => s.id === segmentId);
  const count = mode === "manual" ? numbers.length : selected?.size ?? 0;

  function addNumber() {
    const p = newNumber.trim();
    if (!p) return;
    if (numbers.some((n) => n.phone === p)) { setNewNumber(""); return; }
    setNumbers((prev) => [...prev, { phone: p, name: newName.trim() || undefined }]);
    setNewNumber("");
    setNewName("");
  }

  function removeNumber(phone: string) {
    setNumbers((prev) => prev.filter((n) => n.phone !== phone));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed: { phone: string; name?: string }[] = [];
    const seen = new Set(numbers.map((n) => n.phone));

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      const phoneCell = cells.find((c) => c.replace(/\D/g, "").length >= 8);
      if (!phoneCell) continue;                       // ligne d'en-tête ou vide
      const phone = phoneCell.replace(/\s/g, "");
      if (seen.has(phone)) continue;
      seen.add(phone);
      const nameCell = cells.find((c) => c !== phoneCell && /[a-zA-Zأ-ي]/.test(c));
      parsed.push({ phone, name: nameCell || undefined });
    }

    setNumbers((prev) => [...prev, ...parsed]);
    setFileInfo(`${file.name} — ${parsed.length} numéros importés`);
    setMode("manual");
    e.target.value = "";
  }

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/marketing/campaigns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          message,
          storeId: storeId || undefined,
          linkUrl: linkUrl.trim() || undefined,
          segmentId: mode === "segment" ? segmentId : undefined,
          recipients: mode === "manual" ? numbers : undefined,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const canSave =
    name.trim() &&
    message.trim() &&
    (mode === "segment" ? !!segmentId : numbers.length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col border-border bg-surface shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl md:border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouvelle campagne SMS</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Magasin</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none"
            >
              <option value="">Tous les magasins</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">
              Détermine l'expéditeur SMS et le magasin auquel la campagne appartient.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom de la campagne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Promo Ramadan" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Destinataires</label>
            <div className="flex gap-1.5">
              {[
                { key: "segment", label: "Un segment" },
                { key: "manual", label: "Numéros / fichier" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key as any)}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    mode === m.key ? "bg-primary text-white" : "bg-surface-sunken text-muted hover:bg-border"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "segment" ? (
            <select
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none"
            >
              <option value="">Choisir un segment...</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.size} clients)</option>
              ))}
            </select>
          ) : (
            <div className="space-y-3 rounded-lg border border-border p-3.5">
              <div className="flex gap-2">
                <Input
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }}
                  placeholder="20 123 456"
                  className="h-8 flex-1 text-xs"
                />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNumber(); } }}
                  placeholder="Nom (optionnel)"
                  className="h-8 w-32 text-xs"
                />
                <Button size="sm" variant="secondary" onClick={addNumber} disabled={!newNumber.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-primary hover:text-primary">
                <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
                Importer un fichier CSV
              </label>
              <p className="text-[10px] text-muted-light">
                Une ligne par contact : numéro, nom. Les fichiers Excel : « Enregistrer sous » → CSV.
              </p>

              {fileInfo && (
                <p className="text-[11px] font-medium text-status-delivered">{fileInfo}</p>
              )}

              {numbers.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {numbers.map((n) => (
                    <div key={n.phone} className="flex items-center justify-between rounded bg-surface-sunken px-2 py-1">
                      <span className="font-mono text-[11px]">{n.phone}</span>
                      <div className="flex items-center gap-2">
                        {n.name && <span className="text-[11px] text-muted">{n.name}</span>}
                        <button onClick={() => removeNumber(n.phone)} className="text-muted hover:text-status-cancelled">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {count > 0 && (
            <p className="rounded-md bg-primary-soft px-3 py-2 text-[11px] font-medium text-primary">
              {count} destinataire{count > 1 ? "s" : ""} recevront ce message
            </p>
          )}

<div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Lien (optionnel)
            </label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://meday.tn/promo"
            />
            <p className="mt-1 text-[11px] text-muted">
              Insérez {"{{lien}}"} dans le message. Orderly ajoute un tag pour compter les visites.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">Message</label>
              <span className={cn("text-[10px]", message.length > 160 ? "text-status-cancelled" : "text-muted")}>
                {message.length}/160
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Bonjour {{nom}}, profitez de -20% sur votre prochaine commande !"
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => setMessage((m) => m + v)}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted hover:border-primary hover:text-primary"
                >
                  {v}
                </button>
              ))}
            </div>
            {mode === "manual" && (
              <p className="mt-1 text-[10px] text-muted-light">
                Sur une liste importée, seul {"{{nom}}"} fonctionne — et uniquement si le fichier contient les noms.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !canSave} onClick={save}>
            {loading ? "Création..." : "Créer la campagne"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FlowModal({
  segments,
  onClose,
  onSaved,
}: {
  segments: Segment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/marketing/flows`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trigger,
          triggerConfig: { days: parseInt(days) || 30 },
          segmentId: segmentId || undefined,
          message,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Nouveau flow automatisé</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom du flow</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Relance clients inactifs" autoFocus />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted">Déclencheur</label>
            <div className="space-y-1.5">
              {TRIGGERS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTrigger(t.key)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border-2 px-3 py-2 text-left transition-colors",
                    trigger === t.key
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-border-strong"
                  )}
                >
                  <Zap className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", trigger === t.key ? "text-primary" : "text-muted")} />
                  <div>
                    <p className={cn("text-xs font-medium", trigger === t.key && "text-primary")}>{t.label}</p>
                    <p className="text-[11px] text-muted">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {trigger === "INACTIVE_CUSTOMER" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Après combien de jours ?</label>
              <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} min={1} />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Segment (optionnel)</label>
            <select
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Tous les clients concernés</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Bonjour {{nom}}, ça fait longtemps ! -15% sur votre retour."
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => setMessage((m) => m + v)}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted hover:border-primary hover:text-primary"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading || !name.trim() || !trigger || !message.trim()} onClick={save}>
            {loading ? "Création..." : "Créer le flow"}
          </Button>
        </div>
      </div>
    </div>
  );
}
function CampaignDetailModal({
  campaign,
  storeLabel,
  onClose,
}: {
  campaign: Campaign;
  storeLabel: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const h = { Authorization: `Bearer ${getToken()}` };

        fetch(`${API}/marketing/campaigns/${campaign.id}/stats`, { headers: h })
          .then((r) => r.json())
          .then((d) => setStats(d))
          .catch(() => {});
  
        const sends = await fetch(`${API}/marketing/campaigns/${campaign.id}/sends`, { headers: h })
          .then((r) => r.json());

        if (Array.isArray(sends) && sends.length > 0) {
          setRows(sends.map((s: any) => ({
            phone: s.phone,
            name: s.name,
            status: s.status,
            error: s.error,
            sentAt: s.sentAt,
          })));
          return;
        }

        // Pas encore envoyee : on montre les destinataires prevus
        if (campaign.recipients?.length) {
          setRows(campaign.recipients.map((r) => ({
            phone: r.phone,
            name: r.name ?? null,
            status: "PENDING",
          })));
          return;
        }

        if (campaign.segmentId) {
          const data = await fetch(
            `${API}/marketing/segments/${campaign.segmentId}/customers`,
            { headers: h },
          ).then((r) => r.json());
          setRows((data?.customers ?? []).map((c: any) => ({
            phone: c.phone,
            name: c.name,
            status: "PENDING",
          })));
        }
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [campaign.id]);

  const sent = rows.filter((r) => r.status === "SENT").length;
  const failed = rows.filter((r) => r.status === "FAILED").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col border-border bg-surface shadow-2xl md:h-auto md:max-h-[88vh] md:max-w-3xl md:rounded-xl md:border">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{campaign.name}</h2>
              <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[campaign.status])}>
                {STATUS_LABEL[campaign.status] ?? campaign.status}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {storeLabel}
              {" · "}
              {campaign.segment?.name ?? (campaign.recipients?.length ? "Liste importée" : "—")}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Message</p>
          <p className="whitespace-pre-wrap rounded-lg bg-surface-sunken px-3 py-2.5 text-sm">
            {campaign.message}
          </p>
          <div className="mt-3 flex gap-4 text-xs">
            <span className="text-muted">
              Destinataires : <span className="font-mono font-semibold text-foreground">{rows.length || campaign.recipientCount}</span>
            </span>
            {campaign.status !== "DRAFT" && (
              <>
                <span className="text-status-delivered">Envoyés : <span className="font-mono font-semibold">{sent}</span></span>
                {failed > 0 && (
                  <span className="text-status-cancelled">Échecs : <span className="font-mono font-semibold">{failed}</span></span>
                )}
              </>
            )}
          </div>
        </div>

        {stats && campaign.status !== "DRAFT" && (
          <div className="border-b border-border px-5 py-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Résultats — {stats.windowDays} jours après l'envoi
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <div className="rounded-lg bg-surface-sunken px-3 py-2">
                <p className="text-[10px] text-muted">Destinataires</p>
                <p className="mt-0.5 text-lg font-bold">{stats.recipients}</p>
              </div>
              <div className="rounded-lg bg-surface-sunken px-3 py-2">
                <p className="text-[10px] text-muted">Visites</p>
                <p className="mt-0.5 text-lg font-bold">{stats.visits ?? 0}</p>
              </div>
              <div className="rounded-lg bg-primary-soft px-3 py-2">
                <p className="text-[10px] text-primary">Commandes</p>
                <p className="mt-0.5 text-lg font-bold text-primary">{stats.orders}</p>
                <p className="text-[10px] text-primary/70">{stats.rate}% des destinataires</p>
              </div>
              <div className="rounded-lg bg-status-delivered-bg px-3 py-2">
                <p className="text-[10px] text-status-delivered">CA commandé</p>
                <p className="mt-0.5 text-lg font-bold text-status-delivered">
                  {money(stats.revenue)}
                </p>
                <p className="text-[10px] text-status-delivered/70">TND</p>
              </div>
              <div className="rounded-lg bg-purple-50 px-3 py-2">
                <p className="text-[10px] text-purple-600">CA livré</p>
                <p className="mt-0.5 text-lg font-bold text-purple-600">
                  {money(stats.deliveredRevenue ?? 0)}
                </p>
                <p className="text-[10px] text-purple-600/70">{stats.delivered ?? 0} livrées</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-light">
              Commandes passées par un destinataire, depuis le même numéro, dans les {stats.windowDays} jours.
              Sur la même période le magasin a reçu {stats.storeOrdersInWindow} commandes au total.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">Aucun destinataire</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-sunken">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Numéro</th>
                  <th className="px-4 py-2.5">Nom</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="px-4 py-2.5">Détail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.phone}-${i}`} className="border-b border-border">
                    <td className="px-5 py-2.5 font-mono text-xs">{r.phone}</td>
                    <td className="px-4 py-2.5 text-xs">{r.name ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-medium",
                        r.status === "SENT"
                          ? "bg-status-delivered-bg text-status-delivered"
                          : r.status === "FAILED"
                          ? "bg-status-cancelled-bg text-status-cancelled"
                          : "bg-surface-sunken text-muted"
                      )}>
                        {r.status === "SENT" ? "Envoyé" : r.status === "FAILED" ? "Échec" : "En attente"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-muted">
                      {r.error ?? (r.sentAt ? new Date(r.sentAt).toLocaleString("fr-FR") : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" className="w-full" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
function MarketingContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [tab, setTab] = useState<"segments" | "campaigns" | "test">("segments");

  const [smsStatus, setSmsStatus] = useState<{ configured: boolean; defaultSender: string | null } | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testName, setTestName] = useState("");
  const [testNumbers, setTestNumbers] = useState<{ phone: string; name?: string }[]>([]);
  const [testFileInfo, setTestFileInfo] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testStore, setTestStore] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSegment, setShowSegment] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [viewSegment, setViewSegment] = useState<any>(null);
  const [viewCampaign, setViewCampaign] = useState<Campaign | null>(null);
  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchAll = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const h = { Authorization: `Bearer ${getToken()}` };
      const q = `?storeIds=${selectedStoreIds.join(",")}`;
      const [s, c, f] = await Promise.all([
        fetch(`${API}/marketing/segments${q}`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/marketing/campaigns${q}`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/marketing/flows${q}`, { headers: h }).then((r) => r.json()),
      ]);
      setSegments(Array.isArray(s) ? s : []);
      setCampaigns(Array.isArray(c) ? c : []);
      setFlows(Array.isArray(f) ? f : []);

      fetch(`${API}/marketing/sms-status`, { headers: h })
        .then((r) => r.json())
        .then((d) => setSmsStatus(d))
        .catch(() => {});
    } catch {
      setSegments([]); setCampaigns([]); setFlows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreIds]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const storeName = (id?: string | null) =>
    id ? (stores.find((s) => s.id === id)?.name ?? "—") : "Tous les magasins";

  function addTestNumber() {
    const p = testPhone.trim();
    if (!p) return;
    if (testNumbers.some((n) => n.phone === p)) { setTestPhone(""); return; }
    setTestNumbers((prev) => [...prev, { phone: p, name: testName.trim() || undefined }]);
    setTestPhone("");
    setTestName("");
  }

  async function handleTestFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed: { phone: string; name?: string }[] = [];
    const seen = new Set(testNumbers.map((n) => n.phone));

    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      const phoneCell = cells.find((c) => c.replace(/\D/g, "").length >= 8);
      if (!phoneCell) continue;
      const phone = phoneCell.replace(/\s/g, "");
      if (seen.has(phone)) continue;
      seen.add(phone);
      const nameCell = cells.find((c) => c !== phoneCell && /[a-zA-Zأ-ي]/.test(c));
      parsed.push({ phone, name: nameCell || undefined });
    }

    setTestNumbers((prev) => [...prev, ...parsed]);
    setTestFileInfo(`${file.name} — ${parsed.length} numéros importés`);
    e.target.value = "";
  }

  async function sendTestSms() {
    const list = testPhone.trim()
      ? [...testNumbers, { phone: testPhone.trim(), name: testName.trim() || undefined }]
      : testNumbers;
    if (list.length === 0) return;

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/marketing/test-sms`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: list,
          message: testMessage,
          storeId: testStore || undefined,
        }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, error: "Erreur réseau" });
    } finally {
      setTesting(false);
    }
  }

  async function seedSegments() {
    await fetch(`${API}/marketing/segments/seed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchAll();
  }

  async function sendCampaign(id: string) {
    if (!window.confirm("Envoyer cette campagne maintenant ?")) return;
    setSending(id);
    try {
      const res = await fetch(`${API}/marketing/campaigns/${id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      alert(`Campagne traitée.\nEnvoyés : ${data.sentCount}\nÉchecs : ${data.failedCount}\n\nNote : configurez SMS_API_KEY et SMS_API_URL sur Railway pour l'envoi réel.`);
      fetchAll();
    } finally {
      setSending(null);
    }
  }

  async function toggleFlow(id: string) {
    await fetch(`${API}/marketing/flows/${id}/toggle`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchAll();
  }

  async function del(kind: string, id: string) {
    if (!window.confirm("Supprimer ?")) return;
    await fetch(`${API}/marketing/${kind}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchAll();
  }

  const totalReach = segments.reduce((s, x) => s + x.size, 0);
  const activeFlows = flows.filter((f) => f.isActive).length;
  const totalSent = campaigns.reduce((s, c) => s + c.sentCount, 0);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

<div className="flex min-w-0 max-w-full flex-1 flex-col overflow-y-auto overflow-x-hidden pt-14 md:overflow-y-hidden md:pt-0">
        <header className="flex min-h-14 w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-border bg-surface px-3 py-2 md:h-14 md:flex-nowrap md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Marketing</h1>
          <div className="flex items-center gap-2">
            {segments.length === 0 && (
              <Button size="sm" variant="secondary" onClick={seedSegments}>
                <Sparkles className="h-3.5 w-3.5" />
                Créer les segments par défaut
              </Button>
            )}
                      {tab !== "test" && (
              <Button size="sm" onClick={() => {
                if (tab === "segments") setShowSegment(true);
                else setShowCampaign(true);
              }}>
                <Plus className="h-3.5 w-3.5" />
                {tab === "segments" ? "Segment" : "Campagne"}
              </Button>
            )}
          </div>
        </header>

            

            
               {/* Magasins */}
               <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-surface px-3 py-2 md:px-5">
          <button
            onClick={() => setSelectedStoreIds(stores.map((s) => s.id))}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              selectedStoreIds.length === stores.length
                ? "bg-primary text-white"
                : "bg-surface-sunken text-muted hover:bg-border"
            )}
          >
            Tous les magasins
          </button>
          {accessibleStores.map((s) => {
            const only = selectedStoreIds.length === 1 && selectedStoreIds[0] === s.id;
            return (
              <button
                key={s.id}
                onClick={() => { setSelectedStoreIds([s.id]); setTestStore(s.id); }}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  only ? "bg-primary text-white" : "bg-surface-sunken text-muted hover:bg-border"
                )}
              >
                {s.name}
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-1.5 border-b border-border bg-surface p-2 md:grid-cols-4 md:gap-3 md:p-4">
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-[11px] font-medium text-muted">Segments</p>
            <p className="mt-1 text-2xl font-bold">{segments.length}</p>
          </div>
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <p className="text-[11px] font-medium text-primary">Portée cumulée</p>
            <p className="mt-1 text-2xl font-bold text-primary">{totalReach}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-[11px] font-medium text-status-delivered">SMS envoyés</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{totalSent}</p>
          </div>
          <div className="rounded-lg bg-purple-50 px-4 py-3">
            <p className="text-[11px] font-medium text-purple-600">Flows actifs</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{activeFlows}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border bg-surface px-5 py-2">
          {[
            { key: "segments", label: "Segments", icon: Users, count: segments.length },
            { key: "campaigns", label: "Campagnes", icon: Megaphone, count: campaigns.length },
            { key: "test", label: "Envoi de test", icon: Send, count: 0 },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors md:gap-1.5 md:rounded-md md:px-3 md:py-1.5 md:text-xs",
                  tab === t.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  tab === t.key ? "bg-primary text-white" : "bg-surface-sunken"
                )}>{t.count}</span>
              </button>
            );
          })}

          <a
            href="/flows"
            className="ml-auto flex items-center gap-1.5 self-center text-xs font-medium text-primary hover:underline"
          >
            <Zap className="h-3.5 w-3.5" />
            Automatisations
          </a>
        </div>

        <div className="flex-1 p-3 md:overflow-auto md:p-5">
        {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : tab === "test" ? (
            <div className="mx-auto max-w-lg space-y-4">
              <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold">Envoi de test</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Envoyez un SMS immédiatement à un numéro, avec l'expéditeur du magasin choisi.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Magasin (expéditeur)</label>
                  <select
                    value={testStore}
                    onChange={(e) => setTestStore(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none"
                  >
                    <option value="">Expéditeur par défaut</option>
                    {accessibleStores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 rounded-lg border border-border p-3.5">
                  <label className="block text-xs font-medium text-muted">Numéros</label>
                  <div className="flex gap-2">
                    <Input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTestNumber(); } }}
                      placeholder="20 123 456"
                      className="h-8 flex-1 text-xs"
                    />
                    <Input
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTestNumber(); } }}
                      placeholder="Nom (optionnel)"
                      className="h-8 w-32 text-xs"
                    />
                    <Button size="sm" variant="secondary" onClick={addTestNumber} disabled={!testPhone.trim()}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-primary hover:text-primary">
                    <input type="file" accept=".csv,.txt" onChange={handleTestFile} className="hidden" />
                    Importer un fichier CSV
                  </label>
                  <p className="text-[10px] text-muted-light">
                    Une ligne par contact : numéro, nom. Excel : « Enregistrer sous » → CSV.
                  </p>
                  {testFileInfo && (
                    <p className="text-[11px] font-medium text-status-delivered">{testFileInfo}</p>
                  )}

                  {testNumbers.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-primary">
                          {testNumbers.length} destinataire{testNumbers.length > 1 ? "s" : ""}
                        </span>
                        <button
                          onClick={() => { setTestNumbers([]); setTestFileInfo(""); }}
                          className="text-[11px] text-muted hover:text-status-cancelled"
                        >
                          Tout effacer
                        </button>
                      </div>
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {testNumbers.map((n) => (
                          <div key={n.phone} className="flex items-center justify-between rounded bg-surface-sunken px-2 py-1">
                            <span className="font-mono text-[11px]">{n.phone}</span>
                            <div className="flex items-center gap-2">
                              {n.name && <span className="text-[11px] text-muted">{n.name}</span>}
                              <button
                                onClick={() => setTestNumbers((prev) => prev.filter((x) => x.phone !== n.phone))}
                                className="text-muted hover:text-status-cancelled"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted">Message</label>
                    <span className={cn("text-[10px]", testMessage.length > 160 ? "text-status-cancelled" : "text-muted")}>
                      {testMessage.length}/160
                    </span>
                  </div>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows={3}
                    placeholder="Ceci est un test depuis Orderly."
                    className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={
                    testing ||
                    !testMessage.trim() ||
                    (testNumbers.length === 0 && !testPhone.trim())
                  }
                  onClick={sendTestSms}
                >
                  <Send className="h-3.5 w-3.5" />
                  {testing
                    ? "Envoi..."
                    : `Envoyer à ${testNumbers.length + (testPhone.trim() ? 1 : 0)} numéro(s)`}
                </Button>
              </div>

              {testResult && (
                <div className={cn(
                  "rounded-xl border-2 p-4",
                  testResult.ok && !testResult.simulated
                    ? "border-status-delivered/40 bg-status-delivered-bg"
                    : testResult.simulated
                    ? "border-status-processing/40 bg-status-processing-bg"
                    : "border-status-cancelled/40 bg-status-cancelled-bg"
                )}>
                  <p className={cn(
                    "text-sm font-semibold",
                    testResult.ok && !testResult.simulated
                      ? "text-status-delivered"
                      : testResult.simulated
                      ? "text-status-processing"
                      : "text-status-cancelled"
                  )}>
                    {testResult.simulated
                      ? "Simulé — fournisseur SMS non configuré"
                      : testResult.ok
                      ? "SMS envoyé"
                      : "Échec de l'envoi"}
                  </p>
                  <div className="mt-1.5 space-y-0.5 text-[11px] text-muted">
                  {testResult.total === 1 && (
                      <p>Destinataire : <span className="font-mono">{testResult.results?.[0]?.phone}</span></p>
                    )}
                    {testResult.sender && <p>Expéditeur : {testResult.sender}</p>}
                    {testResult.storeName && <p>Magasin : {testResult.storeName}</p>}
                    {testResult.error && <p className="text-status-cancelled">{testResult.error}</p>}
                    {testResult.total > 1 && (
                      <p>{testResult.sent} envoyés · {testResult.failed} échecs sur {testResult.total}</p>
                    )}
                  </div>
                  {testResult.results?.length > 1 && (
                    <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                      {testResult.results.map((r: any) => (
                        <div key={r.phone} className="flex items-center justify-between text-[11px]">
                          <span className="font-mono">{r.phone}</span>
                          <span className={r.ok ? "text-status-delivered" : "text-status-cancelled"}>
                            {r.ok ? "envoyé" : "échec"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {testResult.simulated && (
                    <p className="mt-2 text-[11px] text-status-processing">
                      Le message n'a pas quitté la plateforme. Ajoutez SMS_API_KEY sur Railway pour l'envoi réel.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : tab === "segments" ? (
            segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Users className="h-8 w-8 text-muted-light" />
                <p className="mt-2 text-sm font-medium">Aucun segment</p>
                <p className="mt-1 text-xs text-muted">Créez des listes dynamiques de clients ciblés.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {segments.map((s) => (
                                  <div
                                  key={s.id}
                                  onClick={() => setViewSegment(s)}
                                  className="cursor-pointer rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary"
                                >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{s.name}</p>
                        {s.description && (
                          <p className="mt-0.5 text-[11px] text-muted">{s.description}</p>
                        )}
                      </div>
                      {!s.isSystem && (
                                               <button onClick={(e) => { e.stopPropagation(); del("segments", s.id); }} className="text-muted hover:text-status-cancelled">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <p className="text-2xl font-bold text-primary">{s.size}</p>
                      <p className="text-xs text-muted">clients</p>
                    </div>
                    {s.isSystem && (
                      <span className="mt-2 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
                        Système
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : tab === "campaigns" ? (
            campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Megaphone className="h-8 w-8 text-muted-light" />
                <p className="mt-2 text-sm font-medium">Aucune campagne</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken text-left text-xs font-medium text-muted">
                    <th className="px-5 py-3">Campagne</th>
                      <th className="px-4 py-3">Magasin</th>
                      <th className="px-4 py-3">Destinataires de</th>
                      <th className="px-4 py-3">Destinataires</th>
                      <th className="px-4 py-3">Envoyés</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                                     <tr
                                     key={c.id}
                                     onClick={() => setViewCampaign(c)}
                                     className="cursor-pointer border-b border-border hover:bg-surface-sunken transition-colors"
                                   >
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="mt-0.5 truncate max-w-[280px] text-[11px] text-muted">{c.message}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium">{storeName(c.storeId)}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {c.segment?.name ?? (c.recipients?.length ? "Liste importée" : "—")}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{c.recipientCount}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-status-delivered">{c.sentCount}</span>
                          {c.failedCount > 0 && (
                            <span className="ml-1 font-mono text-xs text-status-cancelled">/{c.failedCount} échecs</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded px-2 py-1 text-xs font-medium", STATUS_STYLE[c.status])}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
                              <Button size="sm" disabled={sending === c.id} onClick={() => sendCampaign(c.id)}>
                                <Send className="h-3.5 w-3.5" />
                                {sending === c.id ? "Envoi..." : "Envoyer"}
                              </Button>
                            )}
                            <button onClick={() => del("campaigns", c.id)} className="rounded-md p-1.5 text-muted hover:text-status-cancelled">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            flows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <Zap className="h-8 w-8 text-muted-light" />
                <p className="mt-2 text-sm font-medium">Aucune automatisation</p>
                <p className="mt-1 text-xs text-muted">Créez des flows déclenchés automatiquement.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {flows.map((f) => {
                  const trig = TRIGGERS.find((t) => t.key === f.trigger);
                  return (
                    <div key={f.id} className={cn(
                      "flex items-center gap-4 rounded-xl border-2 bg-surface p-4",
                      f.isActive ? "border-status-delivered/40" : "border-border"
                    )}>
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        f.isActive ? "bg-status-delivered-bg" : "bg-surface-sunken"
                      )}>
                        <Zap className={cn("h-5 w-5", f.isActive ? "text-status-delivered" : "text-muted")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{f.name}</p>
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            f.isActive ? "bg-status-delivered-bg text-status-delivered" : "bg-surface-sunken text-muted"
                          )}>
                            {f.isActive ? "Actif" : "Inactif"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Déclencheur : {trig?.label ?? f.trigger}
                          {f.segment && ` · Segment : ${f.segment.name}`}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-light">{f.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs text-muted">{f.totalSent} envoyés</span>
                        <Button size="sm" variant={f.isActive ? "secondary" : "default"} onClick={() => toggleFlow(f.id)}>
                          {f.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          {f.isActive ? "Pause" : "Activer"}
                        </Button>
                        <button onClick={() => del("flows", f.id)} className="rounded-md p-1.5 text-muted hover:text-status-cancelled">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

                  {/* SMS config warning */}
                  {smsStatus && !smsStatus.configured && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-status-processing/30 bg-status-processing-bg px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-processing" />
            <div className="text-xs text-status-processing">
              <p className="font-semibold">Fournisseur SMS non configuré</p>
              <p className="mt-0.5">
                Ajoutez <span className="font-mono">SMS_API_KEY</span> et <span className="font-mono">SMS_API_URL</span> dans
                les variables Railway pour activer l'envoi réel. En attendant, les envois sont simulés.
              </p>
            </div>
          </div>
          )}
        </div>
      </div>
      {viewCampaign && (
        <CampaignDetailModal
          campaign={viewCampaign}
          storeLabel={storeName(viewCampaign.storeId)}
          onClose={() => setViewCampaign(null)}
        />
      )}
      {viewSegment && (
        <SegmentCustomersModal
          segment={viewSegment}
          onClose={() => setViewSegment(null)}
        />
      )}
      {showSegment && <SegmentModal stores={accessibleStores} onClose={() => setShowSegment(false)} onSaved={fetchAll} />}
      {showCampaign && (
        <CampaignModal
          segments={segments}
          stores={accessibleStores}
          defaultStoreId={selectedStoreIds.length === 1 ? selectedStoreIds[0] : ""}
          onClose={() => setShowCampaign(false)}
          onSaved={fetchAll}
        />
      )}
      {showFlow && <FlowModal segments={segments} onClose={() => setShowFlow(false)} onSaved={fetchAll} />}
    </div>
  );
}
function SegmentCustomersModal({
  segment,
  onClose,
}: {
  segment: any;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/marketing/segments/${segment.id}/customers`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [segment.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col border-border bg-surface shadow-2xl md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-xl md:border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{segment.name}</h2>
            <p className="text-xs text-muted">
              {loading ? "Chargement..." : `${data?.total ?? 0} clients`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">Chargement...</p>
          ) : (data?.customers ?? []).length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              Aucun client ne correspond à ce segment
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-sunken">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Téléphone</th>
                  <th className="px-4 py-2.5">Gouvernorat</th>
                  <th className="px-4 py-2.5">Commandes</th>
                  <th className="px-4 py-2.5">Valeur</th>
                  <th className="px-4 py-2.5">Dernier achat</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-2.5 text-xs font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.phone}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{c.city ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.totalOrders}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {Math.round(c.lifetimeValue)} TND
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {c.daysSinceLast != null ? `il y a ${c.daysSinceLast}j` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
export default function MarketingPage() {
  return (
    <RouteGuard>
      <MarketingContent />
    </RouteGuard>
  );
}