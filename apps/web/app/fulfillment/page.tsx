"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Order, OrderStatus, ORDER_STATUS_LABELS } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatMoney(n: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);
}

const DELIVERY_STATUSES: { status: OrderStatus; label: string; color: string }[] = [
  { status: "CONFIRME", label: "Confirmé", color: "text-status-new" },
  { status: "EN_PREPARATION", label: "En préparation", color: "text-status-processing" },
  { status: "EXPEDIE", label: "Expédié", color: "text-status-shipped" },
  { status: "EN_COURS_DE_LIVRAISON", label: "En cours de livraison", color: "text-status-shipped" },
  { status: "LIVRE", label: "Livré", color: "text-status-delivered" },
  { status: "PAYE", label: "Payé", color: "text-status-delivered" },
  { status: "RETOUR", label: "Retour", color: "text-status-refunded" },
  { status: "RETOUR_DEPOT", label: "Retour dépôt", color: "text-status-refunded" },
  { status: "RETOUR_RECU", label: "Retour reçu", color: "text-status-refunded" },
  { status: "ANNULE", label: "Annulé", color: "text-status-cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  CONFIRME: "bg-status-new-bg text-status-new",
  EN_PREPARATION: "bg-status-processing-bg text-status-processing",
  EXPEDIE: "bg-status-shipped-bg text-status-shipped",
  EN_COURS_DE_LIVRAISON: "bg-status-shipped-bg text-status-shipped",
  LIVRE: "bg-status-delivered-bg text-status-delivered",
  PAYE: "bg-status-delivered-bg text-status-delivered",
  RETOUR: "bg-status-refunded-bg text-status-refunded",
  RETOUR_DEPOT: "bg-status-refunded-bg text-status-refunded",
  RETOUR_RECU: "bg-status-refunded-bg text-status-refunded",
  ANNULE: "bg-status-cancelled-bg text-status-cancelled",
};

function StatusDropdown({
  order,
  onChangeStatus,
}: {
  order: Order;
  onChangeStatus: (orderId: string, status: OrderStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
          STATUS_COLORS[order.orderStatus] ?? "bg-surface-sunken text-muted"
        )}
      >
        {ORDER_STATUS_LABELS[order.orderStatus] ?? order.orderStatus}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-[calc(100%+4px)] z-30 w-52 rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {DELIVERY_STATUSES.map((s) => (
            <button
              key={s.status}
              disabled={s.status === order.orderStatus}
              onClick={() => {
                onChangeStatus(order.id, s.status);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-surface-sunken",
                s.status === order.orderStatus ? "cursor-default text-muted-light" : s.color
              )}
            >
              {s.label}
              {s.status === order.orderStatus && <span className="ml-auto text-[10px]">actuel</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

const DELIVERY_STATUS_KEYS: OrderStatus[] = [
  "CONFIRME", "EN_PREPARATION", "EXPEDIE", "EN_COURS_DE_LIVRAISON",
  "LIVRE", "PAYE", "RETOUR", "RETOUR_DEPOT", "RETOUR_RECU", "ANNULE",
];

function FulfillmentContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [page, setPage] = useState(1);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders?pageSize=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const all: Order[] = data.orders ?? [];
      // Only show confirmed+ orders
      setOrders(all.filter((o) => DELIVERY_STATUS_KEYS.includes(o.orderStatus)));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function handleChangeStatus(orderId: string, status: OrderStatus) {
    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, orderStatus: status } : o)
    );
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (filter !== "all" && o.orderStatus !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.orderNumber} ${o.customerName ?? ""} ${o.customerPhone ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Count by status
  const counts: Record<string, number> = {};
  orders.forEach((o) => {
    counts[o.orderStatus] = (counts[o.orderStatus] ?? 0) + 1;
  });

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Livraison</h1>
          <p className="text-xs text-muted">{orders.length} commandes</p>
        </header>

        {/* Status filter tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-5 py-2">
          <button
            onClick={() => { setFilter("all"); setPage(1); }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "all" ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
            )}
          >
            Tous ({orders.length})
          </button>
          {DELIVERY_STATUSES.map((s) => (
            <button
              key={s.status}
              onClick={() => { setFilter(s.status); setPage(1); }}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === s.status ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
              )}
            >
              {s.label} ({counts[s.status] ?? 0})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="border-b border-border bg-surface px-5 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher..."
              className="pl-8"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Chargement...</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-4 py-2.5">Commande</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Téléphone</th>
                  <th className="px-4 py-2.5">Produits</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Statut</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border transition-colors hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] font-semibold">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {formatDate(order.sourceCreatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[150px]">{order.customerName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{order.customerPhone ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {order.lineItems?.map((li) => (
                        <div key={li.id} className="truncate max-w-[200px]">
                          {li.title} × {li.quantity}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium">
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusDropdown order={order} onChangeStatus={handleChangeStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-sm font-medium">Aucune commande</p>
              <p className="mt-1 text-xs text-muted">Les commandes confirmées apparaîtront ici.</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{filtered.length} commandes</p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted">Page {page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function FulfillmentPage() {
  return (
    <RouteGuard>
      <FulfillmentContent />
    </RouteGuard>
  );
}