"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Eye, PhoneCall, Filter, X, Save,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}
function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

const TYPES = [
  { value: "TEXT",        label: "Texte court",      hint: "une ligne" },
  { value: "LONGTEXT",    label: "Texte long",       hint: "plusieurs lignes" },
  { value: "SELECT",      label: "Liste",            hint: "un choix parmi plusieurs" },
  { value: "MULTISELECT", label: "Liste multiple",   hint: "plusieurs choix" },
  { value: "NUMBER",      label: "Nombre",           hint: "âge, quantité..." },
  { value: "DATE",        label: "Date",             hint: "" },
  { value: "BOOLEAN",     label: "Oui / Non",        hint: "" },
];

interface FieldDef {
  id: string; key: string; label: string; type: string; options: string[];
  helpText?: string | null; position: number;
  showInList: boolean; showOnOrder: boolean; askOnConfirm: boolean;
  isFilterable: boolean; isActive: boolean;
}

function FieldsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FieldDef | null>(null);
  const [creating, setCreating] = useState(false);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/customers/fields?all=true`, { headers: authHeaders() });
      const data = await res.json();
      setFields(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(f: FieldDef, key: keyof FieldDef) {
    await fetch(`${API}/customers/fields/${f.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ [key]: !f[key] }),
    });
    load();
  }

  async function remove(f: FieldDef) {
    if (!confirm(`Désactiver « ${f.label} » ?\n\nLes informations déjà saisies sont conservées — le champ disparaît simplement des fiches.`)) return;
    await fetch(`${API}/customers/fields/${f.id}`, { method: "DELETE", headers: authHeaders() });
    load();
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pt-14 md:pt-0">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 md:h-14 md:px-5 md:py-0">
          <div className="flex items-center gap-3">
            <Link href="/clients" className="rounded-md p-1 text-muted hover:bg-surface-sunken">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-base font-semibold">Champs client</h1>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau champ
          </Button>
        </header>

        <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
          <p className="mb-5 text-sm text-muted">
            Les champs que vous créez ici apparaissent sur la fiche de chaque client.
            Un champ de type <b>Liste</b> peut ensuite servir de filtre et de segment —
            un champ texte libre, non. Privilégiez les listes pour tout ce que vous voudrez filtrer.
          </p>

          {loading && <p className="py-12 text-center text-sm text-muted">Chargement...</p>}

          {!loading && fields.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm font-medium">Aucun champ pour l'instant</p>
              <p className="mt-1 text-xs text-muted">
                Exemples : Type de peau, Type de cheveux, Âge des enfants, Pointure, Profession
              </p>
              <Button className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Créer le premier champ
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {fields.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "rounded-lg border border-border bg-surface p-3",
                  !f.isActive && "opacity-50"
                )}
              >
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-light" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{f.label}</p>
                      <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {TYPES.find((t) => t.value === f.type)?.label ?? f.type}
                      </span>
                      {!f.isActive && (
                        <span className="rounded bg-status-cancelled-bg px-1.5 py-0.5 text-[10px] font-bold text-status-cancelled">
                          Désactivé
                        </span>
                      )}
                    </div>

                    {!!f.options?.length && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {f.options.map((o) => (
                          <span key={o} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-muted">
                            {o}
                          </span>
                        ))}
                      </div>
                    )}

                    {f.helpText && <p className="mt-1 text-[11px] text-muted">{f.helpText}</p>}

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Toggle on={f.showInList}   onClick={() => toggle(f, "showInList")}   icon={Eye}       label="Colonne" />
                      <Toggle on={f.showOnOrder}  onClick={() => toggle(f, "showOnOrder")}  icon={PhoneCall} label="Sur la commande" />
                      <Toggle on={f.askOnConfirm} onClick={() => toggle(f, "askOnConfirm")} icon={PhoneCall} label="Demander à la confirmation" />
                      <Toggle on={f.isFilterable} onClick={() => toggle(f, "isFilterable")} icon={Filter}    label="Filtrable" />
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(f)}>Modifier</Button>
                    <button
                      onClick={() => remove(f)}
                      className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {fields.length > 0 && (
            <div className="mt-6 rounded-lg border border-border bg-surface-sunken p-4 text-xs text-muted">
              <p className="mb-1 font-semibold text-foreground">Ce que font les options</p>
              <p><b>Colonne</b> — le champ s'affiche comme colonne dans le tableau Clients.</p>
              <p><b>Sur la commande</b> — visible dans le tiroir de confirmation, là où travaillent les agents.</p>
              <p><b>Demander à la confirmation</b> — l'agent est invité à le remplir pendant l'appel. C'est la seule façon fiable de collecter l'info.</p>
              <p><b>Filtrable</b> — utilisable comme filtre sur la page Clients (listes uniquement).</p>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <FieldModal
          field={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-sunken"
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function FieldModal({ field, onClose, onSaved }: {
  field: FieldDef | null; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState(field?.type ?? "SELECT");
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [optionDraft, setOptionDraft] = useState("");
  const [helpText, setHelpText] = useState(field?.helpText ?? "");
  const [askOnConfirm, setAskOnConfirm] = useState(field?.askOnConfirm ?? false);
  const [showOnOrder, setShowOnOrder] = useState(field?.showOnOrder ?? true);
  const [saving, setSaving] = useState(false);

  const needsOptions = type === "SELECT" || type === "MULTISELECT";

  function addOption() {
    const v = optionDraft.trim();
    if (!v || options.includes(v)) return;
    setOptions([...options, v]);
    setOptionDraft("");
  }

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const body = {
        label: label.trim(),
        type,
        options: needsOptions ? options : [],
        helpText: helpText.trim() || null,
        askOnConfirm,
        showOnOrder,
        isFilterable: needsOptions,
      };
      if (field) {
        await fetch(`${API}/customers/fields/${field.id}`, {
          method: "PATCH", headers: authHeaders(), body: JSON.stringify(body),
        });
      } else {
        await fetch(`${API}/customers/fields`, {
          method: "POST", headers: authHeaders(), body: JSON.stringify(body),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px] p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">
            {field ? "Modifier le champ" : "Nouveau champ"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nom du champ</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex : Type de peau"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition-colors",
                    type === t.value ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-sunken"
                  )}
                >
                  <p className={cn("text-xs font-medium", type === t.value && "text-primary")}>{t.label}</p>
                  {t.hint && <p className="text-[10px] text-muted">{t.hint}</p>}
                </button>
              ))}
            </div>
          </div>

          {needsOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Choix possibles</label>
              <div className="flex gap-2">
                <Input
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                  placeholder="ex : grasse"
                />
                <Button onClick={addOption} disabled={!optionDraft.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {options.map((o) => (
                    <span key={o} className="flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-xs">
                      {o}
                      <button onClick={() => setOptions(options.filter((x) => x !== o))}>
                        <X className="h-3 w-3 text-muted hover:text-status-cancelled" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {options.length === 0 && (
                <p className="mt-1 text-[11px] text-muted">
                  Ajoutez au moins deux choix. C'est ce qui rend le champ filtrable.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Aide pour l'agent (optionnel)</label>
            <Input
              value={helpText ?? ""}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="ex : demander si elle a la peau qui brille en fin de journée"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Check
              on={askOnConfirm}
              onChange={() => setAskOnConfirm(!askOnConfirm)}
              title="Demander pendant l'appel de confirmation"
              hint="L'agent est invité à remplir ce champ quand il a la cliente au téléphone. Sans ça, le champ reste vide."
            />
            <Check
              on={showOnOrder}
              onChange={() => setShowOnOrder(!showOnOrder)}
              title="Afficher sur la commande"
              hint="Visible dans le tiroir de confirmation."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving || !label.trim() || (needsOptions && options.length === 0)}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Check({ on, onChange, title, hint }: any) {
  return (
    <button onClick={onChange} className="flex w-full items-start gap-2.5 text-left">
      <span className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        on ? "border-primary bg-primary text-white" : "border-border"
      )}>
        {on && <span className="text-[10px] leading-none">✓</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{title}</span>
        <span className="block text-[11px] text-muted">{hint}</span>
      </span>
    </button>
  );
}

export default function ChampsPage() {
  return (
    <RouteGuard>
      <FieldsContent />
    </RouteGuard>
  );
}