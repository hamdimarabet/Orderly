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
  PeriodFilter,
  StatCard,
  getPeriodRange,
  type Period,
} from "@/components/stats/period-filter";
import {
  Search, ChevronLeft, ChevronRight, Phone, ShoppingCart,
  Archive, CheckCircle2, XCircle, MapPin, Package,
} from "lucide-react";
import { Order } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const PAGE_SIZE = 100;

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function hoursAgo(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "il y a moins d'1h";
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function AbandonsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);
  const [period, setPeriod] = useState<Period>(getPeriodRange("7d"));
  const [busy, setBusy] = useState<string | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const fetchOrders = useCallback(async (silent = false) => {
    if (selectedStoreIds.length === 0) return;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        storeIds: selectedStoreIds.join(","),
        orderStatus: "PANIER_ABANDONNE",
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (period.from) params.set("from", period.from.toISOString());
      if (period.to) params.set("to", period.to.toISOString());

      const res = await fetch(`${API}/orders?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotalPages(data.totalPages ?? 1);
      setServerTotal(data.total ?? 0);
    } catch {
      setOrders([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedStoreIds, page, search, period]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function changeStatus(orderId: string, status: string) {
    setBusy(orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    try {
      await fetch(`${API}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
    } finally {
      setBusy(null);
      fetchOrders(true);
    }
  }

  const pageValue = orders.reduce((s, o) => s + Number(o.total), 0);
  const avg = orders.length > 0 ? Math.round(pageValue / orders.length) : 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-y-auto overflow-x-hidden pt-14 md:overflow-y-hidden md:pt-0">
        <header className="flex min-h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 md:h-14 md:px-5 md:py-0">
          <h1 className="text-base font-semibold">Paniers abandonnés</h1>
          <p className="text-xs text-muted">{serverTotal} paniers</p>
        </header>

        <div className="border-b border-border bg-surface px-5 py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>

        <div className="grid grid-cols-3 gap-1.5 border-b border-border bg-surface p-2 md:gap-3 md:p-4">
          <StatCard className="" label="Paniers abandonnés" value={serverTotal} color="orange" />
          <StatCard className="" label="Valeur (page)" value={Math.round(pageValue)} color="blue" />
          <StatCard className="" label="Panier moyen" value={avg} color="purple" />
        </div>

        <div className="border-b border-border bg-surface px-5 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Nom, téléphone, commande..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 md:overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Chargement...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <ShoppingCart className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucun panier abandonné</p>
              <p className="mt-1 text-xs text-muted">
                Les paniers non validés apparaîtront ici environ 15 minutes après.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="space-y-3 px-3 pb-24 pt-3 md:hidden">
                {orders.map((o) => {
                  const addr = o.shippingAddress as any;
                  return (
                    <div key={o.id} className="rounded-2xl border border-orange-100 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p dir="auto" className="truncate text-base font-bold">{o.customerName ?? "—"}</p>
                          <p className="font-mono text-sm text-muted">{o.customerPhone ?? "—"}</p>
                          <p className="mt-0.5 text-[11px] text-orange-700">{hoursAgo(o.sourceCreatedAt)}</p>
                        </div>
                        <span className="shrink-0 font-mono text-lg font-bold text-primary">
                          {Number(o.total).toFixed(0)} {o.currency}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {o.lineItems?.map((li) => `${li.title} × ${li.quantity}`).join(", ")}
                      </p>
                      {addr?.city && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                          <MapPin className="h-3 w-3" /> {addr.city}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <a
                          href={`tel:${o.customerPhone ?? ""}`}
                          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-xs font-semibold text-white"
                        >
                          <Phone className="h-3.5 w-3.5" /> Appeler
                        </a>
                        <button
                          onClick={() => changeStatus(o.id, "NOUVEAU")}
                          disabled={busy === o.id}
                          className="min-h-10 rounded-full border border-status-delivered px-3 text-xs font-semibold text-status-delivered"
                        >
                          Récupéré
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop */}
              <table className="hidden w-full border-collapse text-sm md:table">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border text-left text-xs font-medium text-muted">
                    <th className="px-4 py-2.5">Panier</th>
                    <th className="px-4 py-2.5">Abandonné</th>
                    <th className="px-4 py-2.5">Client</th>
                    <th className="px-4 py-2.5">Téléphone</th>
                    <th className="px-4 py-2.5">Ville</th>
                    <th className="px-4 py-2.5">Articles</th>
                    <th className="px-4 py-2.5">Montant</th>
                    <th className="px-4 py-2.5">Magasin</th>
                    <th className="px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const addr = o.shippingAddress as any;
                    return (
                      <tr key={o.id} className="border-b border-border transition-colors hover:bg-surface-sunken">
                        <td className="px-4 py-3 font-mono text-[13px] font-semibold">{o.orderNumber}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          <p className="text-muted">{formatDate(o.sourceCreatedAt)}</p>
                          <p className="text-[11px] font-medium text-orange-700">{hoursAgo(o.sourceCreatedAt)}</p>
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-3 font-medium" dir="auto">
                          {o.customerName ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{o.customerPhone ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted">{addr?.city ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {o.lineItems?.map((li) => (
                            <div key={li.id} className="max-w-[180px] truncate">
                              {li.title} × {li.quantity}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold">
                          {Number(o.total).toFixed(3)} {o.currency}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{(o as any).storeName ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <a href={`tel:${o.customerPhone ?? ""}`}>
                              <Button size="sm">
                                <Phone className="h-3.5 w-3.5" />
                                Appeler
                              </Button>
                            </a>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy === o.id}
                              onClick={() => changeStatus(o.id, "NOUVEAU")}
                              title="Le client confirme : la commande part en Confirmation"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Récupéré
                            </Button>
                            <button
                              onClick={() => changeStatus(o.id, "ANNULE")}
                              disabled={busy === o.id}
                              className="rounded-md p-1.5 text-muted hover:bg-status-cancelled-bg hover:text-status-cancelled"
                              title="Perdu"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => changeStatus(o.id, "ARCHIVE")}
                              disabled={busy === o.id}
                              className="rounded-md p-1.5 text-muted hover:bg-surface-sunken"
                              title="Archiver"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">{orders.length} affichés sur {serverTotal}</p>
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

export default function AbandonsPage() {
  return (
    <RouteGuard>
      <AbandonsContent />
    </RouteGuard>
  );
}