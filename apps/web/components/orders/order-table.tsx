"use client";

import { Order, OrderStatus } from "@/types/order";
import {
  OrderStatusBadge,
  FinancialStatusBadge,
  FulfillmentStatusBadge,
} from "@/components/orders/status-badge";
import { cn } from "@/lib/utils";
import { Truck, Store as StoreIcon, Phone } from "lucide-react";
import { OrderActionsMenu } from "@/components/orders/order-actions-menu";

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function formatMoney(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function CallStatusBadge({ order }: { order: Order }) {
  const attempts = (order.callAttempts ?? []) as any[];
  const confirmedCall = attempts.find((a) => a.result === "ANSWERED_CONFIRMED");
  const refusedCall = attempts.find((a) => a.result === "ANSWERED_REFUSED");

  if (confirmedCall) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-delivered-bg text-status-delivered">
        <Phone className="h-3 w-3" />
        Confirmed
      </span>
    );
  }

  if (refusedCall) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-cancelled-bg text-status-cancelled">
        <Phone className="h-3 w-3" />
        Refused
      </span>
    );
  }

  if (attempts.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-status-processing-bg text-status-processing">
        <Phone className="h-3 w-3" />
        Tentative {attempts.length}
      </span>
    );
  }

  return <span className="text-xs text-muted-light">—</span>;
}

export function OrderTable({
  orders,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  onChangeStatus,
}: {
  orders: Order[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (order: Order) => void;
  onChangeStatus: (orderId: string, status: OrderStatus) => void;
}) {
  const allSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border text-left text-xs font-medium text-muted">
            <th className="w-10 px-4 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded border-border-strong accent-[var(--primary)]"
              />
            </th>
            <th className="px-3 py-2.5 font-medium">Order</th>
            <th className="px-3 py-2.5 font-medium">Store</th>
            <th className="px-3 py-2.5 font-medium">Date</th>
            <th className="px-3 py-2.5 font-medium">Customer</th>
            <th className="px-3 py-2.5 font-medium">Call</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Payment</th>
            <th className="px-3 py-2.5 font-medium">Fulfillment</th>
            <th className="px-3 py-2.5 font-medium">Items</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
            <th className="w-10 px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const isSelected = selectedIds.has(order.id);
            return (
              <tr
                key={order.id}
                onClick={() => onRowClick(order)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors hover:bg-surface-sunken",
                  isSelected && "bg-primary-soft/40"
                )}
              >
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(order.id)}
                    className="h-3.5 w-3.5 rounded border-border-strong accent-[var(--primary)]"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[13px] font-medium text-foreground">
                    {order.orderNumber}
                  </span>
                  {order.tags.length > 0 && (
                    <span className="ml-2 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {order.tags[0]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-muted">
                    <StoreIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[140px] truncate">{order.storeName}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                  {formatDate(order.sourceCreatedAt)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="max-w-[160px] truncate font-medium text-foreground">
                    {order.customerName ?? "—"}
                  </div>
                  <div className="max-w-[160px] truncate text-xs text-muted">
                    {order.customerEmail}
                  </div>
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <CallStatusBadge order={order} />
                </td>
                <td className="px-3 py-2.5">
                  <OrderStatusBadge status={order.orderStatus} />
                </td>
                <td className="px-3 py-2.5">
                  <FinancialStatusBadge status={order.financialStatus} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <FulfillmentStatusBadge status={order.fulfillmentStatus} />
                    {order.trackingNumber && (
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-light" />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted">{order.itemCount}</td>
                <td className="px-3 py-2.5 text-right font-mono font-medium">
                  {formatMoney(order.total, order.currency)}
                  {order.totalRefunded > 0 && (
                    <div className="font-sans text-[11px] font-normal text-status-refunded">
                      -{formatMoney(order.totalRefunded, order.currency)} refunded
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <OrderActionsMenu
                    currentStatus={order.orderStatus}
                    onChangeStatus={(status) => onChangeStatus(order.id, status)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm font-medium text-foreground">No orders match these filters</p>
          <p className="mt-1 text-sm text-muted">Try adjusting or clearing your filters.</p>
        </div>
      )}
    </div>
  );
}