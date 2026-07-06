"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Store } from "@/types/order";
import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Package,
  Store as StoreIcon,
  Bell,
  Settings,
  Users,
  Plug,
  ChevronDown,
  Check,
  Circle,
  LogOut,
  ShoppingBag,
  Phone,
  Truck,
  QrCode,
} from "lucide-react";

const NAV_ITEMS: { label: string; icon: React.ElementType; href: string; badge?: number }[] = [
  { label: "Vue d'ensemble", icon: LayoutGrid, href: "/" },
  { label: "Confirmation", icon: Phone, href: "/confirmation" },
  { label: "Préparation", icon: Package, href: "/preparation" },
  { label: "Livraison", icon: Truck, href: "/fulfillment" },
  { label: "Scanner QR", icon: QrCode, href: "/scanner" },
  { label: "Produits", icon: ShoppingBag, href: "/products" },
  { label: "Alertes stock", icon: Bell, href: "/alerts" },
  { label: "Magasins", icon: StoreIcon, href: "/stores" },
  { label: "Utilisateurs", icon: Users, href: "/users" },
  { label: "Intégrations", icon: Plug, href: "/integrations" },
  { label: "Paramètres", icon: Settings, href: "/settings" },
];

const SOURCE_LABEL: Record<Store["sourceType"], string> = {
  SHOPIFY: "Shopify",
  CUSTOM: "Custom",
  MARKETPLACE: "Marketplace",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Store Manager",
  STAFF: "Staff",
};

export function Sidebar({
  stores,
  selectedStoreIds,
  onChangeSelectedStores,
}: {
  stores: Store[];
  selectedStoreIds: string[];
  onChangeSelectedStores: (ids: string[]) => void;
}) {
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const allSelected = selectedStoreIds.length === stores.length;

  function toggleStore(id: string) {
    if (selectedStoreIds.includes(id)) {
      onChangeSelectedStores(selectedStoreIds.filter((s) => s !== id));
    } else {
      onChangeSelectedStores([...selectedStoreIds, id]);
    }
  }

  function selectAll() {
    onChangeSelectedStores(stores.map((s) => s.id));
  }

  const label = allSelected
    ? "All stores"
    : selectedStoreIds.length === 1
    ? stores.find((s) => s.id === selectedStoreIds[0])?.name ?? "1 store"
    : `${selectedStoreIds.length} stores`;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          O
        </div>
        <span className="text-sm font-semibold tracking-tight">Orderly</span>
      </div>

      {/* Store switcher */}
      <div className="relative border-b border-border p-3">
        <button
          onClick={() => setStorePickerOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface-sunken px-3 py-2 text-left text-sm font-medium hover:bg-border/40 transition-colors"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        </button>

        {storePickerOpen && (
          <div className="absolute left-3 right-3 top-[calc(100%-4px)] z-20 max-h-80 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
            <button
              onClick={() => selectAll()}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface-sunken"
            >
              <span className="font-medium">All stores</span>
              {allSelected && <Check className="h-4 w-4 text-primary" />}
            </button>
            <div className="my-1 border-t border-border" />
            {stores.map((store) => {
              const isSelected = selectedStoreIds.includes(store.id);
              return (
                <button
                  key={store.id}
                  onClick={() => toggleStore(store.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-sunken"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Circle
                      className={cn(
                        "h-2 w-2 shrink-0",
                        store.isActive
                          ? "fill-status-delivered text-status-delivered"
                          : "fill-muted-light text-muted-light"
                      )}
                    />
                    <span className="truncate">{store.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {SOURCE_LABEL[store.sourceType]}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <button
              key={item.label}
              onClick={() => router.push(item.href)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-surface-sunken hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.badge && (
                <span className="rounded-full bg-status-cancelled px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="relative border-t border-border p-3">
        {userMenuOpen && (
          <div className="absolute bottom-[calc(100%-4px)] left-3 right-3 z-20 rounded-md border border-border bg-surface py-1 shadow-lg">
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-status-cancelled hover:bg-surface-sunken"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 hover:bg-surface-sunken"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {user?.avatarInitials ?? "?"}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-medium">{user?.name ?? "Guest"}</p>
            <p className="truncate text-[11px] text-muted">
              {user ? ROLE_LABEL[user.role] : ""}
            </p>
          </div>
        </button>
      </div>
    </aside>
  );
}