"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, X, AlertTriangle, Calendar, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Order } from "@/types/order";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface Notification {
  id: string;
  type: "stock" | "reclamation" | "scheduled" | "mention";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  read: boolean;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return `il y a ${Math.floor(hrs / 24)}j`;
}

const ICON_MAP = {
  stock: AlertTriangle,
  reclamation: MessageSquare,
  scheduled: Calendar,
  mention: MessageSquare,
};

const COLOR_MAP = {
  stock: "text-status-processing bg-status-processing-bg",
  reclamation: "text-status-cancelled bg-status-cancelled-bg",
  scheduled: "text-primary bg-primary-soft",
  mention: "text-status-shipped bg-status-shipped-bg",
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const buildNotifications = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const notifs: Notification[] = [];
      const now = new Date();

      // 1 — Stock alerts
      const storesRes = await fetch(`${API}/stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const stores = await storesRes.json();

      for (const store of (Array.isArray(stores) ? stores : [])) {
        const productsRes = await fetch(`${API}/stores/${store.id}/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const products = await productsRes.json();
        for (const p of (Array.isArray(products) ? products : [])) {
          if (p.quantityAvailable <= p.lowStockThreshold) {
            notifs.push({
              id: `stock-${p.id}`,
              type: "stock",
              title: "Stock bas",
              message: `${p.name} — ${p.quantityAvailable} unités restantes (seuil: ${p.lowStockThreshold})`,
              href: "/products",
              createdAt: p.updatedAt,
              read: false,
            });
          }
        }
      }

      // 2 — Scheduled orders (1 day before)
      const ordersRes = await fetch(`${API}/orders?pageSize=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ordersData = await ordersRes.json();
      const orders: Order[] = ordersData.orders ?? [];

      for (const order of orders) {
        if (order.scheduledDeliveryDate) {
          const deliveryDate = new Date(order.scheduledDeliveryDate);
          const diffDays = Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 1 && diffDays >= 0) {
            notifs.push({
              id: `scheduled-${order.id}`,
              type: "scheduled",
              title: "Livraison programmée",
              message: `${order.orderNumber} — ${order.customerName} — livraison ${diffDays === 0 ? "aujourd'hui" : "demain"}`,
              href: "/confirmation",
              createdAt: order.scheduledDeliveryDate!,
              read: false,
            });
          }
        }

        // 3 — Réclamations ouvertes
        if ((order.tags ?? []).includes("Réclamation")) {
          try {
            const rec = JSON.parse(order.internalNote ?? "{}").reclamation;
            if (rec && rec.status !== "RESOLU") {
              notifs.push({
                id: `rec-${order.id}`,
                type: "reclamation",
                title: "Réclamation ouverte",
                message: `${order.orderNumber} — ${order.customerName} — ${rec.type ?? ""}`,
                href: "/reclamation",
                createdAt: rec.createdAt ?? order.updatedAt,
                read: false,
              });
            }
          } catch {}
        }
      }

      // Sort by date
      notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(notifs);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    buildNotifications();
    const interval = setInterval(buildNotifications, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [buildNotifications]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  function markAllRead() {
    setReadIds(new Set(notifications.map((n) => n.id)));
  }

  function markRead(id: string) {
    setReadIds((prev) => new Set([...prev, id]));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-status-cancelled text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed top-14 right-4 z-50 w-80 rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Tout lire
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-surface-sunken">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Bell className="h-8 w-8 text-muted-light" />
                  <p className="mt-2 text-xs text-muted">Aucune notification</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = ICON_MAP[n.type];
                  const isRead = readIds.has(n.id);
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => { markRead(n.id); setOpen(false); }}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken transition-colors",
                        !isRead && "bg-primary-soft/20"
                      )}
                    >
                      <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", COLOR_MAP[n.type])}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold">{n.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted leading-relaxed">{n.message}</p>
                        <p className="mt-1 text-[10px] text-muted-light">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!isRead && (
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
