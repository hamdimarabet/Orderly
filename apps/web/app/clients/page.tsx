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
  Search, ChevronLeft, ChevronRight, Users, X, Package,
  AlertTriangle, Star, Cake, Clock, Save, Plus, SlidersHorizontal,
  Gift, UserPlus, Moon, HeartCrack, PhoneCall,
} from "lucide-react";
import { ORDER_STATUS_LABELS, OrderStatus } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const PAGE_SIZE = 50;

function getToken() {
  return window.localStorage.getItem("orderly_token");
}
function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}
function formatDate(iso: string | Date | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function money(n: any) {
  return Number(n ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}
function daysSince(iso: string | Date | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const TIERS: Record<string, { label: string; cls: string }> = {
  GOLD:   { label: "Gold",   cls: "bg-yellow-100 text-yellow-700" },
  SILVER: { label: "Silver", cls: "bg-slate-200 text-slate-700" },
  WATCH:  { label: "Risque", cls: "bg-status-cancelled-bg text-status-cancelled" },
  NEW:    { label: "Nouveau", cls: "bg-surface-sunken text-muted" },
};

const BUCKETS = [
  {
    key: "due",
    label: "À relancer",
    hint: "Elle a dépassé son propre cycle d'achat",
    icon: Clock,
    cls: "bg-primary-soft text-primary",
    active: "bg-primary text-white",
  },
  {
    key: "birthdays",
    label: "Anniversaires",
    hint: "Anniversaire aujourd'hui ou dans les 7 jours",
    icon: Gift,
    cls: "bg-pink-50 text-pink-600",
    active: "bg-pink-600 text-white",
  },
  {
    key: "sleeping",
    label: "Bons clients endormis",
    hint: "Gold ou Silver, plus de 30 jours de retard",
    icon: Moon,
    cls: "bg-yellow-50 text-yellow-700",
    active: "bg-yellow-600 text-white",
  },
  {
    key: "newbie",
    label: "Nouveaux à fidéliser",
    hint: "1ère livraison reçue il y a moins de 21 jours",
    icon: UserPlus,
    cls: "bg-status-delivered-bg text-status-delivered",
    active: "bg-status-delivered text-white",
  },
  {
    key: "lost",
    label: "Jamais revenus",
    hint: "Une seule commande livrée, plus de 60 jours",
    icon: HeartCrack,
    cls: "bg-purple-50 text-purple-600",
    active: "bg-purple-600 text-white",
  },
] as const;

function reasonFor(bucket: string, c: Customer): string {
  const since = daysSince(c.lastOrderAt);
  switch (bucket) {
    case "due":
      return `rythme ${c.rhythmDays}j · dernière commande il y a ${since}j`;
    case "birthdays":
      return c.birthday
        ? `anniversaire le ${new Date(c.birthday).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
        : "";
    case "lost":
      return `1 seule commande · il y a ${since}j`;
    case "sleeping":
      return `${since}j sans commande (rythme ${c.rhythmDays}j)`;
    case "newbie":
      return `1ère livraison il y a ${since}j`;
    default:
      return "";
  }
}

interface FieldDef {
  id: string; key: string; label: string; type: string; options: string[];
  helpText?: string | null; showInList: boolean; showOnOrder: boolean;
  askOnConfirm: boolean; isFilterable: boolean; position: number;
}

interface Customer {
  id: string;
  phone: string; displayPhone: string; phone2: string | null;
  name: string; email: string | null; city: string | null; address: string | null;
  storeIds: string[];
  birthday: string | null; gender: string | null; language: string | null;
  callFrom: string | null; callTo: string | null;
  custom: Record<string, any>;
  totalOrders: number; delivered: number; returned: number;
  confirmationRate: number; deliveryRate: number; returnRate: number;
  lifetimeValue: any; avgBasket: any;
  firstOrderAt: string | null; lastOrderAt: string | null;
  rhythmDays: number | null; nextDueAt: string | null;
  tier: string; isBlocked: boolean;
  orders?: any[]; notes?: any[]; neverTried?: any[];
}

/* ========================================================================== */
/*  FICHE                                                                     */
/* ========================================================================== */

function CustomerDetail({
  customerId, fields, onClose, onSaved,
}: {
  customerId: string;
  fields: FieldDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [c, setC] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"fiche" | "history" | "notes">("fiche");
  const [newNote, setNewNote] = useState("");

  // editable state
  const [form, setForm] = useState<any>({});
  const [custom, setCustom] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/customers/${customerId}`, { headers: authHeaders() });
      const data = await res.json();
      setC(data);
      setForm({
        name: data.name ?? "",
        phone2: data.phone2 ?? "",
        email: data.email ?? "",
        city: data.city ?? "",
        address: data.address ?? "",
        birthday: data.birthday ? String(data.birthday).slice(0, 10) : "",
        gender: data.gender ?? "",
        language: data.language ?? "",
        callFrom: data.callFrom ?? "",
        callTo: data.callTo ?? "",
      });
      setCustom(data.custom ?? {});
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`${API}/customers/${customerId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...form, custom }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    await fetch(`${API}/customers/${customerId}/notes`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ body: newNote.trim() }),
    });
    setNewNote("");
    load();
  }

  const tier = c ? TIERS[c.tier] ?? TIERS.NEW : TIERS.NEW;
  const since = c ? daysSince(c.lastOrderAt) : null;
  const isDue = c?.nextDueAt ? new Date(c.nextDueAt) <= new Date() : false;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full flex-col border-border bg-surface shadow-2xl md:h-auto md:max-h-[92vh] md:max-w-4xl md:rounded-xl md:border">

        {/* header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
              {(c?.name ?? "?")[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{c?.name ?? "..."}</h2>
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", tier.cls)}>
                  {tier.label}
                </span>
                {isDue && (
                  <span className="flex items-center gap-1 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    <Clock className="h-2.5 w-2.5" /> À relancer
                  </span>
                )}
                {c?.isBlocked && (
                  <span className="rounded bg-status-cancelled-bg px-1.5 py-0.5 text-[10px] font-bold text-status-cancelled">
                    Bloqué
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-muted">{c?.displayPhone}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* KPIs */}
        {c && (
          <div className="grid grid-cols-2 gap-2 border-b border-border px-5 py-3 md:grid-cols-5">
            <div className="rounded-lg bg-primary-soft px-3 py-2">
              <p className="text-[10px] font-medium text-primary">Valeur totale</p>
              <p className="font-mono text-base font-bold text-primary">{money(c.lifetimeValue)}</p>
            </div>
            <div className="rounded-lg bg-surface-sunken px-3 py-2">
              <p className="text-[10px] font-medium text-muted">Commandes</p>
              <p className="text-base font-bold">{c.totalOrders}</p>
              <p className="text-[10px] text-muted">{c.delivered} livrées</p>
            </div>
            <div className="rounded-lg bg-status-delivered-bg px-3 py-2">
              <p className="text-[10px] font-medium text-status-delivered">Confirmation</p>
              <p className="text-base font-bold text-status-delivered">{c.confirmationRate}%</p>
            </div>
            <div className="rounded-lg bg-status-refunded-bg px-3 py-2">
              <p className="text-[10px] font-medium text-status-refunded">Retours</p>
              <p className="text-base font-bold text-status-refunded">{c.returnRate}%</p>
            </div>
            <div className="rounded-lg bg-surface-sunken px-3 py-2">
              <p className="text-[10px] font-medium text-muted">Rythme</p>
              <p className="text-base font-bold">
                {c.rhythmDays ? `${c.rhythmDays}j` : "—"}
              </p>
              <p className="text-[10px] text-muted">
                {since != null ? `dernière il y a ${since}j` : "—"}
              </p>
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-1 border-b border-border px-5 pt-2">
          {([
            ["fiche", "Fiche"],
            ["history", `Historique (${c?.orders?.length ?? 0})`],
            ["notes", `Notes (${c?.notes?.length ?? 0})`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as any)}
              className={cn(
                "rounded-t-md px-3 py-2 text-xs font-medium transition-colors",
                tab === k ? "bg-surface-sunken text-foreground" : "text-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="py-12 text-center text-sm text-muted">Chargement...</p>}

          {/* ---------------- FICHE ---------------- */}
          {!loading && c && tab === "fiche" && (
            <div className="space-y-5">

              <Section title="Coordonnées">
                <Field label="Nom">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Téléphone">
                  <p className="py-2 font-mono text-sm text-muted">{c.displayPhone}</p>
                </Field>
                <Field label="2ème téléphone">
                  <Input value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} placeholder="—" />
                </Field>
                <Field label="Ville">
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="—" />
                </Field>
                <Field label="Adresse">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="—" />
                </Field>
                <Field label="Email">
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="—" />
                </Field>
              </Section>

              <Section title="Personnel">
                <Field label="Date d'anniversaire">
                  <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
                </Field>
                <Field label="Genre">
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="">—</option>
                    <option value="F">Femme</option>
                    <option value="M">Homme</option>
                  </select>
                </Field>
                <Field label="Langue">
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="">—</option>
                    <option value="AR">Arabe</option>
                    <option value="FR">Français</option>
                  </select>
                </Field>
                <Field label="Appeler entre">
                  <div className="flex items-center gap-2">
                    <Input type="time" value={form.callFrom} onChange={(e) => setForm({ ...form, callFrom: e.target.value })} />
                    <span className="text-xs text-muted">et</span>
                    <Input type="time" value={form.callTo} onChange={(e) => setForm({ ...form, callTo: e.target.value })} />
                  </div>
                </Field>
              </Section>

              {fields.length > 0 && (
                <Section title="Informations complémentaires">
                  {fields.map((f) => (
                    <Field key={f.id} label={f.label} help={f.helpText}>
                      <CustomInput
                        field={f}
                        value={custom[f.key] ?? ""}
                        onChange={(v) => setCustom({ ...custom, [f.key]: v })}
                      />
                    </Field>
                  ))}
                </Section>
              )}

              {!!c.neverTried?.length && (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Jamais essayé — à proposer
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {c.neverTried.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt="" className="h-7 w-7 rounded object-cover" />
                          : <Package className="h-4 w-4 text-muted-light" />}
                        <span className="text-xs font-medium">{p.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------- HISTORY ---------------- */}
          {!loading && c && tab === "history" && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {(c.orders ?? []).map((o: any) => (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2">
                  <span className="shrink-0 font-mono text-xs font-semibold">{o.orderNumber}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatDate(o.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{o.storeName}</span>
                  {o.assignedAgentName && (
                    <span className="shrink-0 text-[10px] text-muted-light">{o.assignedAgentName}</span>
                  )}
                  <span className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    o.isDelivered ? "bg-status-delivered-bg text-status-delivered" :
                    o.isReturned ? "bg-status-refunded-bg text-status-refunded" :
                    o.isRefused ? "bg-status-cancelled-bg text-status-cancelled" :
                    "bg-surface-sunken text-muted"
                  )}>
                    {ORDER_STATUS_LABELS[o.orderStatus as OrderStatus] ?? o.orderStatus}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-semibold">{money(o.total)}</span>
                </div>
              ))}
              {!c.orders?.length && <p className="px-4 py-8 text-center text-sm text-muted">Aucune commande</p>}
            </div>
          )}

          {/* ---------------- NOTES ---------------- */}
          {!loading && c && tab === "notes" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                  placeholder="Ajouter une note… (ex: préfère être appelée après 18h)"
                />
                <Button onClick={addNote} disabled={!newNote.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {(c.notes ?? []).map((n: any) => (
                  <div key={n.id} className={cn(
                    "rounded-lg border p-3",
                    n.kind === "SYSTEM" ? "border-border bg-surface-sunken" : "border-border"
                  )}>
                    <p className="text-sm">{n.body}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {n.authorName ?? "Système"} · {new Date(n.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                ))}
                {!c.notes?.length && (
                  <p className="py-8 text-center text-sm text-muted">
                    Aucune note. Tout ce que l'agent apprend au téléphone se met ici.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-xs text-muted">
            {saved ? "Enregistré ✓" : c?.firstOrderAt ? `Client depuis ${formatDate(c.firstOrderAt)}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
            {tab === "fiche" && (
              <Button onClick={save} disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving ? "..." : "Enregistrer"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">{title}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
      {help && <p className="mt-0.5 text-[10px] text-muted-light">{help}</p>}
    </div>
  );
}

function CustomInput({ field, value, onChange }: { field: FieldDef; value: any; onChange: (v: any) => void }) {
  const cls = "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm";

  if (field.type === "SELECT") {
    return (
      <select className={cls} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === "MULTISELECT") {
    const arr: string[] = Array.isArray(value) ? value : value ? String(value).split(",") : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {field.options.map((o) => {
          const on = arr.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted"
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === "BOOLEAN") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "rounded-md border px-3 py-1.5 text-xs font-medium",
          value ? "border-primary bg-primary-soft text-primary" : "border-border text-muted"
        )}
      >
        {value ? "Oui" : "Non"}
      </button>
    );
  }
  if (field.type === "LONGTEXT") {
    return (
      <textarea
        className="w-full rounded-md border border-border bg-surface p-2 text-sm"
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ========================================================================== */
/*  LIST                                                                      */
/* ========================================================================== */

function ClientsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, repeat: 0, due: 0, lifetimeValue: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("value");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"today" | "all">("today");
  const [bucket, setBucket] = useState<string>("due");
  const [work, setWork] = useState<Record<string, number>>({});

  const [filters, setFilters] = useState<any>({
    tier: "", dueOnly: false, birthdayMonth: "", minOrders: "", minLtv: "", custom: {} as Record<string, string>,
  });

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  useEffect(() => {
    fetch(`${API}/customers/fields`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setFields(Array.isArray(d) ? d : []))
      .catch(() => setFields([]));
  }, []);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (selectedStoreIds.length) p.set("storeIds", selectedStoreIds.join(","));
    if (view === "today" && bucket) p.set("bucket", bucket);
    if (search.trim()) p.set("search", search.trim());
    if (filters.tier) p.set("tier", filters.tier);
    if (filters.dueOnly) p.set("dueOnly", "true");
    if (filters.birthdayMonth) p.set("birthdayMonth", filters.birthdayMonth);
    if (filters.minOrders) p.set("minOrders", filters.minOrders);
    if (filters.minLtv) p.set("minLtv", filters.minLtv);
    for (const [k, v] of Object.entries(filters.custom ?? {})) {
      if (v) p.set(`custom[${k}]`, String(v));
    }
    p.set("sortBy", sortBy);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p;
  }, [selectedStoreIds, search, filters, sortBy, page, view, bucket]);

  const fetchCustomers = useCallback(async () => {
    if (selectedStoreIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/customers?${buildParams()}`, { headers: authHeaders() });
      const data = await res.json();
      setCustomers(data.customers ?? []);
      setPages(data.pages ?? 1);
      setTotal(data.total ?? 0);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams, selectedStoreIds]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    if (!selectedStoreIds.length) return;
    const ids = selectedStoreIds.join(",");
    fetch(`${API}/customers/stats?storeIds=${ids}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setStats).catch(() => {});
    fetch(`${API}/customers/worklist?storeIds=${ids}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setWork).catch(() => {});
  }, [selectedStoreIds]);

  const listFields = fields.filter((f) => f.showInList).slice(0, 2);
  const filterFields = fields.filter((f) => f.isFilterable && f.type === "SELECT").slice(0, 3);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-y-auto overflow-x-hidden pt-14 md:overflow-y-hidden md:pt-0">
        <header className="flex min-h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 md:h-14 md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Clients</h1>
          <p className="text-xs text-muted">{total} clients</p>
        </header>

        {/* view tabs */}
        <div className="flex gap-1 border-b border-border bg-surface px-3 pt-2 md:px-5">
          {([
            ["today", "Aujourd'hui"],
            ["all", "Tous les clients"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setView(k as any); setPage(1); }}
              className={cn(
                "rounded-t-md px-4 py-2 text-sm font-medium transition-colors",
                view === k
                  ? "bg-surface-sunken text-foreground"
                  : "text-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ---------- AUJOURD'HUI : the worklist ---------- */}
        {view === "today" && (
          <div className="border-b border-border bg-surface px-3 py-3 md:px-5">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {BUCKETS.map((b) => {
                const Icon = b.icon;
                const on = bucket === b.key;
                const n = work[b.key] ?? 0;
                return (
                  <button
                    key={b.key}
                    onClick={() => { setBucket(b.key); setPage(1); }}
                    title={b.hint}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-left transition-colors",
                      on ? b.active : cn(b.cls, "hover:opacity-80")
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <p className="truncate text-[11px] font-medium">{b.label}</p>
                    </div>
                    <p className="mt-1 text-2xl font-bold">{n}</p>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {BUCKETS.find((b) => b.key === bucket)?.hint}
            </p>
          </div>
        )}

        {/* ---------- TOUS : headline numbers ---------- */}
        {view === "all" && (
          <div className="grid grid-cols-2 gap-1.5 border-b border-border bg-surface p-2 md:grid-cols-4 md:gap-3 md:p-4">
            <div className="rounded-lg bg-surface-sunken px-4 py-3">
              <p className="text-[11px] font-medium text-muted">Total clients</p>
              <p className="mt-1 text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-primary-soft px-4 py-3">
              <p className="text-[11px] font-medium text-primary">Valeur cumulée</p>
              <p className="mt-1 font-mono text-2xl font-bold text-primary">{money(stats.lifetimeValue)}</p>
            </div>
            <div className="rounded-lg bg-purple-50 px-4 py-3">
              <p className="text-[11px] font-medium text-purple-600">Ont recommandé</p>
              <p className="mt-1 text-2xl font-bold text-purple-600">{stats.repeat}</p>
            </div>
            <div className="rounded-lg bg-yellow-50 px-4 py-3">
              <p className="text-[11px] font-medium text-yellow-700">À relancer</p>
              <p className="mt-1 text-2xl font-bold text-yellow-700">{stats.due}</p>
            </div>
          </div>
        )}

        {/* search + sort */}
        <div className="flex flex-col gap-2 border-b border-border bg-surface px-3 py-3 md:flex-row md:items-center md:gap-3 md:px-5">
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Nom, téléphone, ville..."
              className="pl-8"
            />
          </div>

          <Button
            size="sm"
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Filtres
          </Button>

          <div className="flex gap-1 overflow-x-auto">
            {[
              { key: "value", label: "Valeur" },
              { key: "orders", label: "Commandes" },
              { key: "due", label: "À relancer" },
              { key: "recent", label: "Récents" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => { setSortBy(s.key); setPage(1); }}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sortBy === s.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* filters */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-sunken px-3 py-3 md:px-5">
            <FilterBox label="Niveau">
              <select
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={filters.tier}
                onChange={(e) => { setFilters({ ...filters, tier: e.target.value }); setPage(1); }}
              >
                <option value="">Tous</option>
                <option value="GOLD">Gold</option>
                <option value="SILVER">Silver</option>
                <option value="NEW">Nouveau</option>
                <option value="WATCH">Risque</option>
              </select>
            </FilterBox>

            <FilterBox label="Anniversaire">
              <select
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={filters.birthdayMonth}
                onChange={(e) => { setFilters({ ...filters, birthdayMonth: e.target.value }); setPage(1); }}
              >
                <option value="">Tous les mois</option>
                {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]
                  .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </FilterBox>

            <FilterBox label="Min. commandes">
              <Input
                type="number"
                className="w-28"
                value={filters.minOrders}
                onChange={(e) => { setFilters({ ...filters, minOrders: e.target.value }); setPage(1); }}
              />
            </FilterBox>

            <FilterBox label="Valeur min (TND)">
              <Input
                type="number"
                className="w-32"
                value={filters.minLtv}
                onChange={(e) => { setFilters({ ...filters, minLtv: e.target.value }); setPage(1); }}
              />
            </FilterBox>

            {filterFields.map((f) => (
              <FilterBox key={f.id} label={f.label}>
                <select
                  className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                  value={filters.custom?.[f.key] ?? ""}
                  onChange={(e) => {
                    setFilters({ ...filters, custom: { ...filters.custom, [f.key]: e.target.value } });
                    setPage(1);
                  }}
                >
                  <option value="">Tous</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </FilterBox>
            ))}

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilters({ tier: "", dueOnly: false, birthdayMonth: "", minOrders: "", minLtv: "", custom: {} });
                setPage(1);
              }}
            >
              Réinitialiser
            </Button>
          </div>
        )}

        {/* table */}
        <div className="flex-1 md:overflow-auto">
          {loading ? (
            <p className="py-24 text-center text-sm text-muted">Chargement...</p>
          ) : (
            <>
              {/* mobile */}
              <div className="space-y-2.5 px-3 pb-24 pt-3 md:hidden">
                {customers.map((c) => {
                  const tier = TIERS[c.tier] ?? TIERS.NEW;
                  const isDue = c.nextDueAt ? new Date(c.nextDueAt) <= new Date() : false;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setDetailId(c.id)}
                      className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p dir="auto" className="truncate text-sm font-bold text-slate-900">{c.name}</p>
                            {c.tier === "GOLD" && <Star className="h-3 w-3 shrink-0 text-yellow-500" />}
                            {c.tier === "WATCH" && <AlertTriangle className="h-3 w-3 shrink-0 text-status-cancelled" />}
                            {isDue && <Clock className="h-3 w-3 shrink-0 text-primary" />}
                          </div>
                          <p className="font-mono text-xs text-slate-400">{c.displayPhone}</p>
                          <p className="text-[11px] text-slate-400">
                            {view === "today" ? reasonFor(bucket, c) : (c.city ?? "—")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-base font-bold text-primary">{money(c.lifetimeValue)}</p>
                          <p className="text-[10px] text-muted">TND</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1 bg-sky-50 px-3 py-2 text-center">
                        <div>
                          <p className="font-mono text-sm font-bold">{c.totalOrders}</p>
                          <p className="text-[9px] text-slate-500">commandes</p>
                        </div>
                        <div>
                          <p className="font-mono text-sm font-bold">{c.confirmationRate}%</p>
                          <p className="text-[9px] text-slate-500">confirm.</p>
                        </div>
                        <div>
                          <p className="font-mono text-sm font-bold text-status-delivered">{c.delivered}</p>
                          <p className="text-[9px] text-slate-500">livrées</p>
                        </div>
                        <div>
                          <p className="font-mono text-sm font-bold">{c.rhythmDays ? `${c.rhythmDays}j` : "—"}</p>
                          <p className="text-[9px] text-slate-500">rythme</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* desktop */}
              <table className="hidden w-full border-collapse text-sm md:table">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-4 py-2.5">Client</th>
                    {view === "today" && <th className="px-4 py-2.5">Pourquoi</th>}
                    <th className="px-4 py-2.5">Niveau</th>
                    <th className="px-4 py-2.5">Ville</th>
                    <th className="px-4 py-2.5">Commandes</th>
                    <th className="px-4 py-2.5">Confirm.</th>
                    <th className="px-4 py-2.5">Retours</th>
                    <th className="px-4 py-2.5">Valeur</th>
                    <th className="px-4 py-2.5">Rythme</th>
                    <th className="px-4 py-2.5">Dernière</th>
                    {listFields.map((f) => <th key={f.id} className="px-4 py-2.5">{f.label}</th>)}
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const tier = TIERS[c.tier] ?? TIERS.NEW;
                    const since = daysSince(c.lastOrderAt);
                    const isDue = c.nextDueAt ? new Date(c.nextDueAt) <= new Date() : false;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setDetailId(c.id)}
                        className="cursor-pointer border-b border-border transition-colors hover:bg-surface-sunken"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                              {c.name[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="max-w-[140px] truncate text-sm font-medium">{c.name}</p>
                                {c.birthday && <Cake className="h-3 w-3 shrink-0 text-muted-light" />}
                              </div>
                              <p className="font-mono text-[11px] text-muted">{c.displayPhone}</p>
                            </div>
                          </div>
                        </td>
                        {view === "today" && (
                          <td className="px-4 py-3">
                            <p className="text-xs font-medium text-foreground">{reasonFor(bucket, c)}</p>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className={cn("rounded px-2 py-1 text-[11px] font-bold", tier.cls)}>{tier.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{c.city ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-semibold">{c.totalOrders}</span>
                          <span className="ml-1 text-[11px] text-muted">({c.delivered})</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "rounded px-2 py-1 text-xs font-bold",
                            c.confirmationRate >= 70 ? "bg-status-delivered-bg text-status-delivered" :
                            c.confirmationRate >= 40 ? "bg-status-processing-bg text-status-processing" :
                            "bg-status-cancelled-bg text-status-cancelled"
                          )}>{c.confirmationRate}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "rounded px-2 py-1 text-xs font-bold",
                            c.returnRate <= 20 ? "bg-status-delivered-bg text-status-delivered" :
                            c.returnRate <= 40 ? "bg-status-processing-bg text-status-processing" :
                            "bg-status-cancelled-bg text-status-cancelled"
                          )}>{c.returnRate}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono text-sm font-bold">{money(c.lifetimeValue)} TND</p>
                          <p className="text-[10px] text-muted">Panier {money(c.avgBasket)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {c.rhythmDays ? (
                            <span className={cn("font-mono font-semibold", isDue && "text-primary")}>
                              {c.rhythmDays}j
                            </span>
                          ) : <span className="text-muted">—</span>}
                          {isDue && <p className="text-[10px] font-medium text-primary">à relancer</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                          {formatDate(c.lastOrderAt)}
                          {since != null && <p className="text-[10px] text-muted-light">il y a {since}j</p>}
                        </td>
                        {listFields.map((f) => (
                          <td key={f.id} className="px-4 py-3 text-xs text-muted">
                            {String(c.custom?.[f.key] ?? "—")}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <a
                            href={`tel:${c.displayPhone}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Appeler"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-primary-soft hover:text-primary"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {!loading && customers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Users className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun client</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{total} clients</p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted">Page {page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </footer>
      </div>

      {detailId && (
        <CustomerDetail
          customerId={detailId}
          fields={fields}
          onClose={() => setDetailId(null)}
          onSaved={fetchCustomers}
        />
      )}
    </div>
  );
}

function FilterBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <RouteGuard>
      <ClientsContent />
    </RouteGuard>
  );
}