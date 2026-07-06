"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Phone, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Order, OrderStatus, CallAttempt } from "@/types/order";

const API = "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(n: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n);
}

const CALL_RESULTS = [
  { value: "ANSWERED_CONFIRMED", label: "✅ Confirmé" },
  { value: "ANSWERED_REFUSED", label: "❌ Refusé" },
  { value: "NO_ANSWER", label: "📵 Pas de réponse" },
  { value: "BUSY", label: "📵 Occupé" },
  { value: "WRONG_NUMBER", label: "❌ Mauvais numéro" },
];

const CANCELLATION_REASONS = [
  "Client injoignable",
  "Client a refusé",
  "Mauvaise adresse",
  "Commande en double",
  "Rupture de stock",
  "Problème de prix",
  "Changement d'avis",
  "Autre",
];

function CallStatusBadge({ attempts }: { attempts: CallAttempt[] }) {
  const confirmed = attempts.find((a) => a.result === "ANSWERED_CONFIRMED");
  const refused = attempts.find((a) => a.result === "ANSWERED_REFUSED");

  if (confirmed) return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-delivered-bg text-status-delivered">
      ✓ Confirmé
    </span>
  );
  if (refused) return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-cancelled-bg text-status-cancelled">
      ✗ Refusé
    </span>
  );
  if (attempts.length > 0) return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-processing-bg text-status-processing">
      <Phone className="h-3 w-3" />
      Tentative {attempts.length}
    </span>
  );
  return <span className="text-xs text-muted-light">—</span>;
}

function CancellationModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string, note: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Raison d'annulation</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            {CANCELLATION_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                  reason === r
                    ? "border-status-cancelled bg-status-cancelled-bg text-status-cancelled"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Note (optionnel)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Détails supplémentaires..." />
          </div>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Retour</Button>
          <Button variant="destructive" className="flex-1" disabled={!reason} onClick={() => onConfirm(reason, note)}>
            Confirmer l'annulation
          </Button>
        </div>
      </div>
    </div>
  );
}

function CallModal({
  order,
  onClose,
  onDone,
}: {
  order: Order;
  onClose: () => void;
  onDone: (updatedAttempts: CallAttempt[], newStatus?: OrderStatus, reason?: string, note?: string) => void;
}) {
  const attempts: CallAttempt[] = Array.isArray(order.callAttempts) ? order.callAttempts : [];
  const [phone, setPhone] = useState(order.customerPhone ?? "");
  const [result, setResult] = useState("NO_ANSWER");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  async function logAttempt(cancelReason?: string, cancelNote?: string) {
    setLoading(true);
    try {
      const newAttempt: CallAttempt = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        phone,
        result: result as CallAttempt["result"],
        note: note || null,
      };
      const updatedAttempts = [...attempts, newAttempt];
      await fetch(`${API}/orders/${order.id}/call-attempts`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ callAttempts: updatedAttempts }),
      });

      if (result === "ANSWERED_CONFIRMED") {
        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "CONFIRME" }),
        });
        onDone(updatedAttempts, "CONFIRME");
      } else if (result === "ANSWERED_REFUSED" && cancelReason) {
        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "ANNULE", reason: cancelReason, note: cancelNote }),
        });
        onDone(updatedAttempts, "ANNULE", cancelReason, cancelNote);
      } else {
        await fetch(`${API}/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "CONFIRMATION_EN_COURS" }),
        });
        onDone(updatedAttempts, "CONFIRMATION_EN_COURS");
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleLog() {
    if (result === "ANSWERED_REFUSED") {
      setShowCancelModal(true);
    } else {
      logAttempt();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Appel de confirmation — {order.orderNumber}</h2>
              <p className="text-xs text-muted">{order.customerName}</p>
            </div>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {attempts.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border">
                {attempts.map((a, i) => (
                  <div key={a.id} className="px-3 py-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-muted">Tentative {i + 1} — {a.phone}</span>
                      <span className={cn(
                        "font-medium",
                        a.result === "ANSWERED_CONFIRMED" ? "text-status-delivered" :
                        a.result === "ANSWERED_REFUSED" ? "text-status-cancelled" :
                        "text-status-processing"
                      )}>
                        {CALL_RESULTS.find((r) => r.value === a.result)?.label ?? a.result}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-light mt-0.5">
                      {new Date(a.date).toLocaleString("fr-FR")}
                      {a.note && ` — ${a.note}`}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Numéro appelé</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 XX XXX XXX" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Résultat</label>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {CALL_RESULTS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Note (optionnel)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: rappeler demain matin" />
            </div>
          </div>

          <div className="flex gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button className="flex-1" disabled={loading || !phone} onClick={handleLog}>
              <Phone className="h-3.5 w-3.5" />
              {loading ? "Enregistrement..." : `Logger tentative ${attempts.length + 1}`}
            </Button>
          </div>
        </div>
      </div>

      {showCancelModal && (
        <CancellationModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={(reason, note) => {
            setShowCancelModal(false);
            logAttempt(reason, note);
          }}
        />
      )}
    </>
  );
}

const PAGE_SIZE = 25;

function ConfirmationContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [callOrder, setCallOrder] = useState<Order | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "refused">("all");

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
      setOrders(data.orders ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function handleCallDone(
    orderId: string,
    updatedAttempts: CallAttempt[],
    newStatus?: OrderStatus,
    reason?: string,
    note?: string,
  ) {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          callAttempts: updatedAttempts,
          orderStatus: newStatus ?? o.orderStatus,
          cancellationReason: reason ?? o.cancellationReason,
          cancellationNote: note ?? o.cancellationNote,
        };
      })
    );
  }

  const filtered = orders.filter((o) => {
    if (!selectedStoreIds.includes(o.storeId)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.orderNumber} ${o.customerName ?? ""} ${o.customerPhone ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    const confirmed = attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
    const refused = attempts.some((a) => a.result === "ANSWERED_REFUSED");
    if (filter === "confirmed") return confirmed;
    if (filter === "refused") return refused || o.orderStatus === "ANNULE";
    if (filter === "pending") return !confirmed && !refused;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmedCount = orders.filter((o) => {
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    return attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
  }).length;

  const refusedCount = orders.filter((o) => {
    const attempts = Array.isArray(o.callAttempts) ? o.callAttempts as CallAttempt[] : [];
    return attempts.some((a) => a.result === "ANSWERED_REFUSED") || o.orderStatus === "ANNULE";
  }).length;

  const pendingCount = orders.length - confirmedCount - refusedCount;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Confirmation</h1>
          <p className="text-xs text-muted">{orders.length} commandes</p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-4">
          <div className="rounded-lg bg-status-processing-bg px-4 py-3">
            <p className="text-xs font-medium text-status-processing">En attente</p>
            <p className="mt-1 text-2xl font-bold text-status-processing">{pendingCount}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-xs font-medium text-status-delivered">Confirmés</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{confirmedCount}</p>
          </div>
          <div className="rounded-lg bg-status-cancelled-bg px-4 py-3">
            <p className="text-xs font-medium text-status-cancelled">Refusés / Annulés</p>
            <p className="mt-1 text-2xl font-bold text-status-cancelled">{refusedCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher commande, client..."
              className="pl-8"
            />
          </div>
          <div className="flex gap-1">
            {[
              { key: "all", label: "Tous", count: orders.length },
              { key: "pending", label: "En attente", count: pendingCount },
              { key: "confirmed", label: "Confirmés", count: confirmedCount },
              { key: "refused", label: "Refusés", count: refusedCount },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key as any); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === tab.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-sunken"
                )}
              >
                {tab.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", filter === tab.key ? "bg-primary text-white" : "bg-surface-sunken")}>
                  {tab.count}
                </span>
              </button>
            ))}
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
                  <th className="px-4 py-2.5">Appel</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => {
                  const attempts = Array.isArray(order.callAttempts) ? order.callAttempts as CallAttempt[] : [];
                  const isConfirmed = attempts.some((a) => a.result === "ANSWERED_CONFIRMED");
                  const isRefused = attempts.some((a) => a.result === "ANSWERED_REFUSED") || order.orderStatus === "ANNULE";

                  return (
                    <tr
                      key={order.id}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-surface-sunken",
                        isConfirmed && "bg-status-delivered-bg/20",
                        isRefused && "bg-status-cancelled-bg/20",
                      )}
                    >
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
                      <td className="px-4 py-3">
                        <CallStatusBadge attempts={attempts} />
                      </td>
                      <td className="px-4 py-3">
                        {!isRefused && (
                          <Button
                            size="sm"
                            variant={isConfirmed ? "secondary" : "default"}
                            onClick={() => setCallOrder(order)}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {isConfirmed ? "Rappeler" : attempts.length === 0 ? "Appeler" : `Tentative ${attempts.length + 1}`}
                          </Button>
                        )}
                        {isRefused && (
                          <span className="text-xs text-muted">
                            {order.cancellationReason ?? "Annulé"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && pageOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Phone className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">Aucune commande</p>
              <p className="mt-1 text-xs text-muted">Les nouvelles commandes apparaîtront ici.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-5 py-2.5">
          <p className="text-xs text-muted">
            {filtered.length} commandes
          </p>
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

      {callOrder && (
        <CallModal
          order={callOrder}
          onClose={() => setCallOrder(null)}
          onDone={(updatedAttempts, newStatus, reason, note) => {
            handleCallDone(callOrder.id, updatedAttempts, newStatus, reason, note);
            setCallOrder(null);
          }}
        />
      )}
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <RouteGuard>
      <ConfirmationContent />
    </RouteGuard>
  );
}