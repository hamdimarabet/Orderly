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
  Plus, Package, Trash2, Edit2, Check, X, Search, AlertTriangle, History,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

interface Product {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  quantityAvailable: number;
  reservedQty: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

interface InventoryLog {
  id: string;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

function AddProductModal({
  storeId,
  onClose,
  onAdded,
}: {
  storeId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState("0");
  const [threshold, setThreshold] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!name.trim() || !sku.trim()) {
      setError("Name and SKU are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/stores/${storeId}/sync-products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          products: [{
            externalId: sku,
            name: name.trim(),
            sku: sku.trim(),
            initialStock: parseInt(stock) || 0,
            threshold: parseInt(threshold) || 5,
          }],
        }),
      });
      if (!res.ok) throw new Error("Failed to add product");
      onAdded();
      onClose();
    } catch {
      setError("Failed to add product. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Add product</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Product name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Collagen Mask" autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">SKU</label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="masquecollagene"
              className="font-mono"
            />
            <p className="mt-1 text-[11px] text-muted">Must match exactly the SKU in your Shopify orders</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Initial stock</label>
              <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} min={0} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Alert threshold</label>
              <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} min={0} />
            </div>
          </div>
          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={loading} onClick={handleAdd}>
            {loading ? "Adding..." : "Add product"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StockAdjustModal({
  product,
  mode,
  onClose,
  onDone,
}: {
  product: Product;
  mode: "add" | "remove";
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("0");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const n = parseInt(qty);
    if (isNaN(n) || n <= 0) { setError("Enter a valid quantity."); return; }
    setLoading(true);
    try {
      const newQty = mode === "add"
        ? product.quantityAvailable + n
        : Math.max(0, product.quantityAvailable - n);
      await fetch(`${API}/stores/products/${product.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantityAvailable: newQty,
          note: note.trim() || undefined,
        }),
      });
      onDone();
      onClose();
    } catch {
      setError("Failed to update stock.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">
            {mode === "add" ? "Add stock" : "Remove stock"} — {product.name}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-surface-sunken px-4 py-3 text-sm">
            <span className="text-muted">Current stock: </span>
            <span className="font-semibold">{product.quantityAvailable}</span>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Units to {mode === "add" ? "add" : "remove"}
            </label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              min={1}
              autoFocus
            />
            {qty && parseInt(qty) > 0 && (
              <p className="mt-1 text-[11px] text-muted">
                New stock will be:{" "}
                <span className="font-medium text-foreground">
                  {mode === "add"
                    ? product.quantityAvailable + parseInt(qty)
                    : Math.max(0, product.quantityAvailable - parseInt(qty))}
                </span>
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Note (optional)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. New shipment received"
            />
          </div>
          {error && (
            <p className="rounded-md bg-status-cancelled-bg px-3 py-2 text-xs font-medium text-status-cancelled">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            variant={mode === "remove" ? "destructive" : "default"}
            disabled={loading}
            onClick={handleSave}
          >
            {loading ? "Saving..." : mode === "add" ? "Add stock" : "Remove stock"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/stores/products/${product.id}/logs`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => { setLogs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [product.id]);

  const TYPE_LABELS: Record<string, string> = {
    manual_add: "Manual add",
    manual_remove: "Manual remove",
    order_fulfilled: "Order fulfilled",
    order_cancelled: "Order cancelled",
    order_returned: "Order returned",
    set: "Stock set",
  };

  const TYPE_COLORS: Record<string, string> = {
    manual_add: "text-status-delivered",
    manual_remove: "text-status-cancelled",
    order_fulfilled: "text-status-cancelled",
    order_cancelled: "text-status-delivered",
    order_returned: "text-status-delivered",
    set: "text-status-new",
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Inventory history — {product.name}</h2>
            <p className="text-xs text-muted font-mono">{product.sku}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted">Loading history...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <History className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">No history yet</p>
              <p className="mt-1 text-xs text-muted">Stock changes will appear here.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Change</th>
                  <th className="px-4 py-2.5">Before</th>
                  <th className="px-4 py-2.5">After</th>
                  <th className="px-4 py-2.5">Note</th>
                  <th className="px-4 py-2.5">By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-surface-sunken">
                    <td className="px-5 py-2.5 text-xs text-muted whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("text-xs font-medium", TYPE_COLORS[log.type] ?? "text-muted")}>
                        {TYPE_LABELS[log.type] ?? log.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "font-mono text-xs font-semibold",
                        log.quantityChange > 0 ? "text-status-delivered" : "text-status-cancelled"
                      )}>
                        {log.quantityChange > 0 ? `+${log.quantityChange}` : log.quantityChange}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{log.quantityBefore}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{log.quantityAfter}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{log.note ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {(log as any).actorName ?? log.actor ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  onDelete,
  onUpdate,
  onAdd,
  onRemove,
  onHistory,
}: {
  product: Product;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Product>) => void;
  onAdd: (product: Product) => void;
  onRemove: (product: Product) => void;
  onHistory: (product: Product) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [stock, setStock] = useState(String(product.quantityAvailable));
  const [threshold, setThreshold] = useState(String(product.lowStockThreshold));
  const [name, setName] = useState(product.name);

  const isLow = product.quantityAvailable <= product.lowStockThreshold;
  const isOut = product.quantityAvailable === 0;

  async function save() {
    await onUpdate(product.id, {
      name,
      quantityAvailable: parseInt(stock) || 0,
      lowStockThreshold: parseInt(threshold) || 0,
    });
    setEditing(false);
  }

  function cancel() {
    setStock(String(product.quantityAvailable));
    setThreshold(String(product.lowStockThreshold));
    setName(product.name);
    setEditing(false);
  }

  return (
    <tr className={cn(
      "border-b border-border transition-colors hover:bg-surface-sunken",
      isOut && "bg-status-cancelled-bg/20",
    )}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken">
            <Package className="h-4 w-4 text-muted-light" />
          </div>
          {editing ? (
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
          ) : (
            <span className="text-sm font-medium">{product.name}</span>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <span className="font-mono text-xs text-muted">{product.sku}</span>
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <Input
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="h-7 w-24 text-xs"
            min={0}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-semibold",
              isOut ? "text-status-cancelled" :
              isLow ? "text-status-processing" :
              "text-status-delivered"
            )}>
              {product.quantityAvailable}
            </span>
            {isLow && !isOut && <AlertTriangle className="h-3.5 w-3.5 text-status-processing" />}
            {isOut && <AlertTriangle className="h-3.5 w-3.5 text-status-cancelled" />}
          </div>
        )}
      </td>

      <td className="px-4 py-3 text-xs text-muted">{product.reservedQty}</td>

      <td className="px-4 py-3">
        {editing ? (
          <Input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="h-7 w-24 text-xs"
            min={0}
          />
        ) : (
          <span className="text-sm">{product.lowStockThreshold}</span>
        )}
      </td>

      <td className="px-4 py-3">
        <span className={cn(
          "inline-flex items-center rounded px-2 py-1 text-xs font-medium",
          isOut ? "bg-status-cancelled-bg text-status-cancelled" :
          isLow ? "bg-status-processing-bg text-status-processing" :
          "bg-status-delivered-bg text-status-delivered"
        )}>
          {isOut ? "Out of stock" : isLow ? "Low stock" : "OK"}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <button onClick={save} className="rounded-md p-1.5 text-status-delivered hover:bg-surface-sunken">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={cancel} className="rounded-md p-1.5 text-muted hover:bg-surface-sunken">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onAdd(product)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-status-delivered hover:bg-status-delivered-bg transition-colors"
              >
                + Add
              </button>
              <button
                onClick={() => onRemove(product)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-status-cancelled hover:bg-status-cancelled-bg transition-colors"
              >
                − Remove
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-foreground"
                title="Edit name & threshold"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onHistory(product)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-primary"
                title="View history"
              >
                <History className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(product.id)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-sunken hover:text-status-cancelled"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ProductsContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState<{ product: Product; mode: "add" | "remove" } | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
      setSelectedStoreId(stores[0].id);
    }
  }, [stores]);

  const fetchProducts = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/stores/${selectedStoreId}/products`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this product? Stock tracking will stop.")) return;
    await fetch(`${API}/stores/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchProducts();
  }

  async function handleUpdate(id: string, data: Partial<Product>) {
    await fetch(`${API}/stores/products/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    fetchProducts();
  }

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const outCount = products.filter((p) => p.quantityAvailable === 0).length;
  const lowCount = products.filter((p) => p.quantityAvailable > 0 && p.quantityAvailable <= p.lowStockThreshold).length;
  const okCount = products.filter((p) => p.quantityAvailable > p.lowStockThreshold).length;

  const selectedStore = accessibleStores.find((s) => s.id === selectedStoreId);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Products & Stock</h1>
          <Button size="sm" onClick={() => setAddModal(true)} disabled={!selectedStoreId}>
            <Plus className="h-3.5 w-3.5" />
            Add product
          </Button>
        </header>

        <div className="flex gap-1 border-b border-border bg-surface px-5 pt-3">
          {accessibleStores.map((store) => (
            <button
              key={store.id}
              onClick={() => setSelectedStoreId(store.id)}
              className={cn(
                "rounded-t-md border-b-2 px-4 py-2 text-xs font-medium transition-colors",
                selectedStoreId === store.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {store.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-5">
          <div className="rounded-lg bg-status-cancelled-bg px-4 py-3">
            <p className="text-xs font-medium text-status-cancelled">Out of stock</p>
            <p className="mt-1 text-2xl font-bold text-status-cancelled">{outCount}</p>
          </div>
          <div className="rounded-lg bg-status-processing-bg px-4 py-3">
            <p className="text-xs font-medium text-status-processing">Low stock</p>
            <p className="mt-1 text-2xl font-bold text-status-processing">{lowCount}</p>
          </div>
          <div className="rounded-lg bg-status-delivered-bg px-4 py-3">
            <p className="text-xs font-medium text-status-delivered">OK</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">{okCount}</p>
          </div>
        </div>

        <div className="border-b border-border bg-surface px-5 py-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <p className="text-sm text-muted">Loading products...</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Available</th>
                  <th className="px-4 py-2.5">Reserved</th>
                  <th className="px-4 py-2.5">Threshold</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                    onAdd={(p) => setAdjustModal({ product: p, mode: "add" })}
                    onRemove={(p) => setAdjustModal({ product: p, mode: "remove" })}
                    onHistory={setHistoryProduct}
                  />
                ))}
              </tbody>
            </table>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <Package className="h-8 w-8 text-muted-light" />
              <p className="mt-2 text-sm font-medium">No products yet</p>
              <p className="mt-1 text-xs text-muted">
                Click "Add product" to start tracking stock for {selectedStore?.name ?? "this store"}.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setAddModal(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add first product
              </Button>
            </div>
          )}
        </div>
      </div>

      {addModal && selectedStoreId && (
        <AddProductModal
          storeId={selectedStoreId}
          onClose={() => setAddModal(false)}
          onAdded={fetchProducts}
        />
      )}

      {adjustModal && (
        <StockAdjustModal
          product={adjustModal.product}
          mode={adjustModal.mode}
          onClose={() => setAdjustModal(null)}
          onDone={fetchProducts}
        />
      )}

      {historyProduct && (
        <HistoryModal
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <RouteGuard>
      <ProductsContent />
    </RouteGuard>
  );
}