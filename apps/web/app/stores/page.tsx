"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { MOCK_INTEGRATIONS } from "@/lib/mock-integrations";
import { Store, StoreSourceType } from "@/types/order";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Plus, ShoppingBag, Globe,
  Package, CheckCircle2, XCircle, AlertCircle, X, Trash2, Copy,
} from "lucide-react";

const SOURCE_COLORS: Record<StoreSourceType, string> = {
  SHOPIFY: "text-status-delivered bg-status-delivered-bg",
  CUSTOM: "text-status-new bg-status-new-bg",
  MARKETPLACE: "text-status-shipped bg-status-shipped-bg",
};

const SOURCE_LABELS: Record<StoreSourceType, string> = {
  SHOPIFY: "Shopify",
  CUSTOM: "Custom API",
  MARKETPLACE: "Marketplace",
};

const SOURCE_ICONS: Record<StoreSourceType, React.ElementType> = {
  SHOPIFY: ShoppingBag,
  CUSTOM: Globe,
  MARKETPLACE: Package,
};

const API = "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function AddStoreModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, type: StoreSourceType) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<StoreSourceType>("SHOPIFY");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Add store</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Store name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Store"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Source type</label>
            <div className="flex gap-2">
              {(["SHOPIFY", "CUSTOM", "MARKETPLACE"] as StoreSourceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 rounded-lg border-2 py-2 text-xs font-medium transition-colors",
                    type === t
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted hover:border-border-strong"
                  )}
                >
                  {SOURCE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {type === "SHOPIFY" && (
            <div className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
              After adding, click <strong>Settings</strong> on the store card to get your Shopify webhook URLs.
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!name.trim()}
            onClick={() => {
              onAdd(name.trim(), type);
              onClose();
            }}
          >
            Add store
          </Button>
        </div>
      </div>
    </div>
  );
}

function StoreSettingsModal({
  store,
  onClose,
}: {
  store: Store;
  onClose: () => void;
}) {
  const [ngrokUrl, setNgrokUrl] = useState("https://your-ngrok-url.ngrok-free.app");
  const [copied, setCopied] = useState<string | null>(null);

  const topics = [
    "orders-create",
    "orders-updated",
    "orders-cancelled",
    "fulfillments-create",
    "refunds-create",
  ];

  function copyUrl(topic: string) {
    const url = `${ngrokUrl}/api/webhooks/shopify/${store.id}/${topic}`;
    navigator.clipboard.writeText(url);
    setCopied(topic);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{store.name} — Settings</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-border p-4 space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Store info</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Name</span>
              <span className="font-medium">{store.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Type</span>
              <span className={cn("rounded px-2 py-0.5 text-xs font-medium", SOURCE_COLORS[store.sourceType])}>
                {SOURCE_LABELS[store.sourceType]}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Store ID</span>
              <span className="font-mono text-xs">{store.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Orders</span>
              <span className="font-medium">{store.orderCount ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Status</span>
              <span className={cn("text-xs font-medium", store.isActive ? "text-status-delivered" : "text-muted")}>
                {store.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          {store.sourceType === "SHOPIFY" && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Shopify Webhook URLs</p>
              <p className="text-xs text-muted">
                Paste your ngrok URL below, then copy each webhook URL into
                Shopify → Settings → Notifications → Webhooks
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Your ngrok URL</label>
                <Input
                  value={ngrokUrl}
                  onChange={(e) => setNgrokUrl(e.target.value)}
                  placeholder="https://abc123.ngrok-free.app"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                {topics.map((topic) => {
                  const url = `${ngrokUrl}/api/webhooks/shopify/${store.id}/${topic}`;
                  return (
                    <div key={topic} className="flex items-center gap-2 rounded bg-surface-sunken p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium text-muted">{topic}</p>
                        <p className="font-mono text-[11px] truncate text-foreground">{url}</p>
                      </div>
                      <button
                        onClick={() => copyUrl(topic)}
                        className="shrink-0 rounded p-1 hover:bg-border text-muted hover:text-foreground"
                      >
                        {copied === topic ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-status-delivered" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {store.sourceType === "CUSTOM" && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Custom API endpoint</p>
              <p className="text-xs text-muted">POST orders to this endpoint from your custom store:</p>
              <div className="rounded bg-surface-sunken p-2">
                <p className="font-mono text-[11px] break-all">{API}/orders/ingest/{store.id}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function StoreCard({
  store,
  onViewOrders,
  onSettings,
  onDelete,
}: {
  store: Store;
  onViewOrders: (storeId: string) => void;
  onSettings: (store: Store) => void;
  onDelete: (storeId: string) => void;
}) {
  const integrations = MOCK_INTEGRATIONS.filter((i) => i.storeId === store.id);
  const SourceIcon = SOURCE_ICONS[store.sourceType];
  const connectedCount = integrations.filter((i) => i.status === "CONNECTED").length;
  const hasError = integrations.some((i) => i.status === "ERROR");

  return (
    <div className="rounded-lg border border-border bg-surface p-5 hover:border-border-strong transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken">
            <SourceIcon className="h-5 w-5 text-muted" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{store.name}</h3>
            <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", SOURCE_COLORS[store.sourceType])}>
              {SOURCE_LABELS[store.sourceType]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {hasError ? (
            <AlertCircle className="h-4 w-4 text-status-cancelled" />
          ) : connectedCount > 0 ? (
            <CheckCircle2 className="h-4 w-4 text-status-delivered" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-light" />
          )}
          <span className={cn("text-xs font-medium",
            hasError ? "text-status-cancelled" :
            connectedCount > 0 ? "text-status-delivered" : "text-muted"
          )}>
            {hasError ? "Error" : connectedCount > 0 ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-surface-sunken px-3 py-2">
          <p className="text-[11px] text-muted">Orders</p>
          <p className="mt-0.5 text-sm font-semibold">{store.orderCount?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="rounded-md bg-surface-sunken px-3 py-2">
          <p className="text-[11px] text-muted">Integrations</p>
          <p className="mt-0.5 text-sm font-semibold">{connectedCount} / {integrations.length}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => onViewOrders(store.id)}>
          View Orders
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onSettings(store)}>
          Settings
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(store.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function StoresContent() {
  const { user, canAccessStore } = useAuth();
  const { stores, refresh } = useStores();
  const router = useRouter();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [addModal, setAddModal] = useState(false);
  const [settingsStore, setSettingsStore] = useState<Store | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));
  const activeStores = accessibleStores.filter((s) => s.isActive);
  const inactiveStores = accessibleStores.filter((s) => !s.isActive);

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  async function handleAddStore(name: string, type: StoreSourceType) {
    const token = getToken();
    await fetch(`${API}/stores`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, sourceType: type }),
    });
    refresh();
  }

  async function handleDeleteStore(storeId: string) {
    if (!window.confirm("Delete this store? This cannot be undone.")) return;
    const token = getToken();
    await fetch(`${API}/stores/${storeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    refresh();
  }

  function handleViewOrders(storeId: string) {
    router.push(`/orders?storeId=${storeId}`);
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Stores</h1>
          {user?.role === "SUPER_ADMIN" && (
            <Button size="sm" onClick={() => setAddModal(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add store
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Total Stores</p>
              <p className="mt-1 text-2xl font-bold">{accessibleStores.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Active</p>
              <p className="mt-1 text-2xl font-bold text-status-delivered">{activeStores.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-muted">Inactive</p>
              <p className="mt-1 text-2xl font-bold text-muted">{inactiveStores.length}</p>
            </div>
          </div>

          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Active stores</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeStores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                onViewOrders={handleViewOrders}
                onSettings={setSettingsStore}
                onDelete={handleDeleteStore}
              />
            ))}
          </div>

          {inactiveStores.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-xs font-medium uppercase tracking-wide text-muted">Inactive stores</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inactiveStores.map((store) => (
                  <StoreCard
                    key={store.id}
                    store={store}
                    onViewOrders={handleViewOrders}
                    onSettings={setSettingsStore}
                    onDelete={handleDeleteStore}
                  />
                ))}
              </div>
            </>
          )}

          {accessibleStores.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-sm font-medium text-muted">No stores yet</p>
              <p className="mt-1 text-xs text-muted">Click "Add store" to get started.</p>
            </div>
          )}
        </div>
      </div>

      {addModal && (
        <AddStoreModal onClose={() => setAddModal(false)} onAdd={handleAddStore} />
      )}
      {settingsStore && (
        <StoreSettingsModal store={settingsStore} onClose={() => setSettingsStore(null)} />
      )}
    </div>
  );
}

export default function StoresPage() {
  return (
    <RouteGuard>
      <StoresContent />
    </RouteGuard>
  );
}