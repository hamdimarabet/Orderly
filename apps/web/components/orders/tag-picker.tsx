"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

export const DEFAULT_TAGS: { label: string; color: string }[] = [
  { label: "Client fidèle", color: "bg-purple-100 text-purple-700" },
  { label: "Réclamation", color: "bg-red-100 text-red-700" },
  { label: "Remboursement", color: "bg-orange-100 text-orange-700" },
  { label: "Urgent", color: "bg-red-100 text-red-600" },
  { label: "VIP", color: "bg-yellow-100 text-yellow-700" },
  { label: "Test", color: "bg-gray-100 text-gray-600" },
  { label: "Échange", color: "bg-blue-100 text-blue-700" },
  { label: "Anniversaire", color: "bg-pink-100 text-pink-700" },
];

export function getTagColor(label: string): string {
  const found = DEFAULT_TAGS.find((t) => t.label === label);
  return found?.color ?? "bg-surface-sunken text-muted";
}

export function TagBadge({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
      getTagColor(tag)
    )}>
      {tag}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

export function TagPicker({
  orderId,
  currentTags,
  onUpdate,
  onClose,
}: {
  orderId: string;
  currentTags: string[];
  onUpdate: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleTag(label: string) {
    setTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  }

  function addCustom() {
    const t = custom.trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setCustom("");
  }

  async function save() {
    setLoading(true);
    try {
      await fetch(`${API}/orders/${orderId}/tags`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags }),
      });
      onUpdate(tags);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <TagBadge key={t} tag={t} onRemove={() => toggleTag(t)} />
              ))}
            </div>
          )}

          {/* Default tags */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Tags par défaut</p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_TAGS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => toggleTag(t.label)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity border-2",
                    t.color,
                    tags.includes(t.label) ? "border-current opacity-100" : "border-transparent opacity-50 hover:opacity-80"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom tag */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Tag personnalisé</p>
            <div className="flex gap-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                placeholder="Nouveau tag..."
                className="flex-1"
              />
              <Button size="sm" variant="secondary" onClick={addCustom} disabled={!custom.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button className="flex-1" disabled={loading} onClick={save}>
            {loading ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
