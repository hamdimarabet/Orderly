"use client";

import { useMemo, useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useOrders } from "@/lib/orders-context";
import { useAuth } from "@/lib/auth-context";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Package, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, XCircle, ArrowRight, Store as StoreIcon,
} from "lucide-react";
import { OrderStatus } from "@/types/order";

const STATUS_ORDER: OrderStatus[] = [
  "NEW", "PROCESSING", "READY_TO_SHIP", "SHIPPED",
  "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED", "ON_HOLD",
];

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-bold">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
        <div className={cn("rounded-lg p-2.5", color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function StatusBar({ status, count, total }: { status: OrderStatus; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const COLOR: Partial<Record<OrderStatus, string>> = {
    NEW: "bg-status-new", PROCESSING: "bg-status-processing",
    READY_TO_SHIP: "bg-status-processing", SHIPPED: "bg-status-shipped",
    OUT_FOR_DELIVERY: "bg-status-shipped", DELIVERED: "bg-status-delivered",
    CANCELLED: "bg-status-cancelled", RETURNED: "bg-status-refunded", ON_HOLD: "bg-status-onhold",
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0"><OrderStatusBadge status={status} /></div>
      <div className="flex-1">
        <div className="h-2 w-full rounded-full bg-surface-sunken">
          <div className={cn("h-2 rounded-full transition-all", COLOR[status] ?? "bg-muted")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-8 text-right text-xs font-medium text-muted">{count}</span>
    </div>
  );
}

function OverviewContent() {
  const { orders } = useOrders();
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const router = useRouter();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const visibleOrders = useMemo(
    () => orders.filter((o) => selectedStoreIds.includes(o.storeId)),
    [orders, selectedStoreIds]
  );

  const totalRevenue = visibleOrders
    .filter((o) => o.financialStatus === "PAID" || o.financialStatus === "PARTIALLY_REFUNDED")
    .reduce((s, o) => s + o.total - o.totalRefunded, 0);

  const totalRefunded = visibleOrders.reduce((s, o) => s + o.totalRefunded, 0);

  const statusCounts = useMemo(() => {
    const map: Partial<Record<OrderStatus, number>> = {};
    for (const o of visibleOrders) {
      map[o.orderStatus] = (map[o.orderStatus] ?? 0) + 1;
    }
    return map;
  }, [visibleOrders]);

  const recentOrders = useMemo(
    () => [...visibleOrders]
      .sort((a, b) => new Date(b.sourceCreatedAt).getTime() - new Date(a.sourceCreatedAt).getTime())
      .slice(0, 8),
    [visibleOrders]
  );

  const needsAttention = visibleOrders.filter(
    (o) => o.orderStatus === "ON_HOLD" || o.orderStatus === "RETURNED" || o.financialStatus === "PARTIALLY_REFUNDED"
  ).length;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Overview</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total orders" value={visibleOrders.length.toLocaleString()} sub="across selected stores" icon={Package} color="bg-primary-soft text-primary" />
            <StatCard label="Revenue" value={`${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="paid, minus refunds" icon={TrendingUp} color="bg-status-delivered-bg text-status-delivered" />
            <StatCard label="Delivered" value={statusCounts["DELIVERED"] ?? 0} sub={`${visibleOrders.length > 0 ? Math.round(((statusCounts["DELIVERED"] ?? 0) / visibleOrders.length) * 100) : 0}% of total`} icon={CheckCircle2} color="bg-status-delivered-bg text-status-delivered" />
            <StatCard label="Needs attention" value={needsAttention} sub="on hold, returned, partial refund" icon={AlertTriangle} color="bg-status-processing-bg text-status-processing" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Orders by status</h2>
                <button onClick={() => router.push("/orders")} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-2.5">
                {STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => (
                  <StatusBar key={s} status={s} count={statusCounts[s] ?? 0} total={visibleOrders.length} />
                ))}
                {visibleOrders.length === 0 && <p className="text-xs text-muted">No orders yet.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Orders by store</h2>
                <button onClick={() => router.push("/stores")} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-3">
                {accessibleStores.filter((s) => selectedStoreIds.includes(s.id)).map((store) => {
                  const count = visibleOrders.filter((o) => o.storeId === store.id).length;
                  const pct = visibleOrders.length > 0 ? (count / visibleOrders.length) * 100 : 0;
                  return (
                    <div key={store.id} className="flex items-center gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-sunken">
                        <StoreIcon className="h-3.5 w-3.5 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="truncate text-xs font-medium">{store.name}</span>
                          <span className="ml-2 shrink-0 text-xs text-muted">{count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-surface-sunken">
                          <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Recent orders</h2>
              <button onClick={() => router.push("/orders")} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {recentOrders.map((order) => (
                <div key={order.id} onClick={() => router.push("/orders")} className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-surface-sunken transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                    <span className="text-xs text-muted">{order.customerName}</span>
                    <span className="hidden text-xs text-muted-light sm:inline">{order.storeName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={order.orderStatus} />
                    <span className="font-mono text-sm font-medium">{order.total} {order.currency}</span>
                  </div>
                </div>
              ))}
              {recentOrders.length === 0 && (
                <div className="px-5 py-8 text-center text-xs text-muted">No orders yet.</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <Clock className="mx-auto h-5 w-5 text-status-processing" />
              <p className="mt-2 text-xl font-bold">{(statusCounts["NEW"] ?? 0) + (statusCounts["PROCESSING"] ?? 0)}</p>
              <p className="text-xs text-muted">Awaiting processing</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <XCircle className="mx-auto h-5 w-5 text-status-cancelled" />
              <p className="mt-2 text-xl font-bold">{statusCounts["CANCELLED"] ?? 0}</p>
              <p className="text-xs text-muted">Cancelled</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4 text-center">
              <TrendingUp className="mx-auto h-5 w-5 text-status-refunded" />
              <p className="mt-2 text-xl font-bold">{totalRefunded.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-muted">Total refunded</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <RouteGuard>
      <OverviewContent />
    </RouteGuard>
  );
}