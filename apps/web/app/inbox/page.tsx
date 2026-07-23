"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Search, Send, Plus, Phone, MapPin,
  ShoppingBag, X, Check, Circle,
} from "lucide-react";

// Platform icons as colored badges
function PlatformBadge({ platform }: { platform: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    whatsapp: { label: "W", color: "text-white", bg: "bg-green-500" },
    messenger: { label: "M", color: "text-white", bg: "bg-blue-500" },
    instagram: { label: "I", color: "text-white", bg: "bg-gradient-to-br from-purple-500 to-pink-500" },
  };
  const c = config[platform] ?? { label: "?", color: "text-white", bg: "bg-gray-400" };
  return (
    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold shrink-0", c.bg, c.color)}>
      {c.label}
    </span>
  );
}

function PlatformIcon({ platform, size = "sm" }: { platform: string; size?: "sm" | "lg" }) {
  const config: Record<string, { label: string; bg: string }> = {
    whatsapp: { label: "WhatsApp", bg: "bg-green-500" },
    messenger: { label: "Messenger", bg: "bg-blue-500" },
    instagram: { label: "Instagram", bg: "bg-gradient-to-br from-purple-500 to-pink-500" },
  };
  const c = config[platform] ?? { label: platform, bg: "bg-gray-400" };
  const sz = size === "lg" ? "h-8 w-8 text-xs" : "h-5 w-5 text-[10px]";
  return (
    <span className={cn("flex items-center justify-center rounded-full font-bold text-white", sz, c.bg)}>
      {c.label[0]}
    </span>
  );
}

interface Message {
  id: string;
  from: "customer" | "agent";
  text: string;
  time: string;
}

interface Conversation {
  id: string;
  platform: "whatsapp" | "messenger" | "instagram";
  customerName: string;
  customerPhone?: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  messages: Message[];
  hasOrder?: boolean;
}

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    platform: "whatsapp",
    customerName: "Sana Ben Ali",
    customerPhone: "+216 55 123 456",
    lastMessage: "Bonjour je veux commander le masque collagène",
    lastTime: "10:23",
    unread: 2,
    messages: [
      { id: "m1", from: "customer", text: "Bonjour", time: "10:20" },
      { id: "m2", from: "customer", text: "Je veux commander le masque collagène svp", time: "10:21" },
      { id: "m3", from: "agent", text: "Bonjour! Bien sûr, quel est votre adresse de livraison?", time: "10:22" },
      { id: "m4", from: "customer", text: "Tunis, La Marsa, rue de la plage 12", time: "10:23" },
    ],
  },
  {
    id: "2",
    platform: "messenger",
    customerName: "Ahmed Mrabt",
    lastMessage: "C'est quoi le prix du sérum?",
    lastTime: "09:45",
    unread: 1,
    messages: [
      { id: "m1", from: "customer", text: "Bonjour, c'est quoi le prix du sérum teinté cerise?", time: "09:45" },
    ],
  },
  {
    id: "3",
    platform: "instagram",
    customerName: "Mariem Haddad",
    lastMessage: "Est-ce que vous livrez à Sfax?",
    lastTime: "09:12",
    unread: 0,
    messages: [
      { id: "m1", from: "customer", text: "Salam, est-ce que vous livrez à Sfax?", time: "09:10" },
      { id: "m2", from: "agent", text: "Oui bien sûr! On livre partout en Tunisie 🇹🇳", time: "09:11" },
      { id: "m3", from: "customer", text: "Super! Je vais commander alors", time: "09:12" },
    ],
  },
  {
    id: "4",
    platform: "whatsapp",
    customerName: "Fatma Trabelsi",
    customerPhone: "+216 98 765 432",
    lastMessage: "J'ai reçu le mauvais produit 😔",
    lastTime: "Hier",
    unread: 0,
    hasOrder: true,
    messages: [
      { id: "m1", from: "customer", text: "Bonjour j'ai reçu le mauvais produit", time: "Hier 15:30" },
      { id: "m2", from: "agent", text: "Désolé pour le désagrément! On va arranger ça.", time: "Hier 15:35" },
      { id: "m3", from: "customer", text: "Merci 🙏", time: "Hier 15:36" },
    ],
  },
  {
    id: "5",
    platform: "messenger",
    customerName: "Youssef Khelil",
    lastMessage: "Commande reçue merci!",
    lastTime: "Hier",
    unread: 0,
    hasOrder: true,
    messages: [
      { id: "m1", from: "customer", text: "Commande reçue merci beaucoup!", time: "Hier 12:00" },
      { id: "m2", from: "agent", text: "Avec plaisir! N'hésitez pas 😊", time: "Hier 12:05" },
    ],
  },
];

function CreateOrderModal({
  conversation,
  onClose,
  onCreated,
}: {
  conversation: Conversation;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(conversation.customerName);
  const [phone, setPhone] = useState(conversation.customerPhone ?? "");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

  function getToken() {
    return window.localStorage.getItem("orderly_token");
  }

  async function createOrder() {
    setLoading(true);
    try {
      // We'll create via the orders API
      // For now show success
      await new Promise((r) => setTimeout(r, 1000));
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={conversation.platform} />
            <h2 className="text-sm font-semibold">Créer une commande</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-sunken">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted">
            Source: <span className="font-medium text-foreground capitalize">{conversation.platform}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Nom client</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Téléphone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 XX XXX XXX" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Ville</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tunis" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Adresse</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue..." />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Produit</label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Nom du produit" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Quantité</label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min={1} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Prix (TND)</label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.000" />
            </div>
          </div>

          {name && phone && product && price && (
            <div className="rounded-lg border border-border p-3 text-xs space-y-1">
              <p className="font-medium">Récapitulatif</p>
              <p className="text-muted">{name} · {phone}</p>
              <p className="text-muted">{product} × {qty} = <span className="font-medium text-foreground">{(parseFloat(price) * parseInt(qty)).toFixed(3)} TND</span></p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
          <Button
            className="flex-1"
            disabled={loading || !name || !phone || !product || !price}
            onClick={createOrder}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            {loading ? "Création..." : "Créer la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InboxContent() {
  const { canAccessStore } = useAuth();
  const { stores } = useStores();
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [activeConv, setActiveConv] = useState<Conversation | null>(MOCK_CONVERSATIONS[0]);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<"all" | "whatsapp" | "messenger" | "instagram">("all");
  const [reply, setReply] = useState("");
  const [createOrderConv, setCreateOrderConv] = useState<Conversation | null>(null);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  const filtered = conversations.filter((c) => {
    if (platform !== "all" && c.platform !== platform) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.customerName.toLowerCase().includes(q) && !c.lastMessage.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function sendReply() {
    if (!reply.trim() || !activeConv) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      from: "agent",
      text: reply.trim(),
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: reply.trim(), lastTime: newMsg.time }
          : c
      )
    );
    setActiveConv((prev) =>
      prev ? { ...prev, messages: [...prev.messages, newMsg] } : null
    );
    setReply("");
  }

  function markRead(convId: string) {
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, unread: 0 } : c)
    );
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  const PLATFORMS = [
    { key: "all", label: "Tous" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "messenger", label: "Messenger" },
    { key: "instagram", label: "Instagram" },
  ];

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1">
        {/* Conversation list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-sm font-semibold">Messagerie</h1>
              {totalUnread > 0 && (
                <span className="rounded-full bg-status-cancelled px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-light" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          {/* Platform tabs */}
          <div className="flex border-b border-border">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key as any)}
                className={cn(
                  "flex-1 py-2 text-[11px] font-medium transition-colors",
                  platform === p.key ? "border-b-2 border-primary text-primary" : "text-muted hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setActiveConv(conv); markRead(conv.id); }}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken",
                  activeConv?.id === conv.id && "bg-primary-soft/30"
                )}
              >
                <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold">
                  {conv.customerName[0]}
                  <PlatformBadge platform={conv.platform} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold truncate">{conv.customerName}</p>
                    <p className="text-[10px] text-muted shrink-0 ml-1">{conv.lastTime}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted truncate">{conv.lastMessage}</p>
                </div>
                {conv.unread > 0 && (
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {conv.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        {activeConv ? (
          <div className="flex flex-1 flex-col">
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold">
                  {activeConv.customerName[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{activeConv.customerName}</p>
                    <PlatformIcon platform={activeConv.platform} size="sm" />
                    <span className="text-xs text-muted capitalize">{activeConv.platform}</span>
                  </div>
                  {activeConv.customerPhone && (
                    <p className="text-xs text-muted font-mono">{activeConv.customerPhone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setCreateOrderConv(activeConv)}
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Créer commande
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {activeConv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.from === "agent" ? "justify-end" : "justify-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2.5",
                    msg.from === "agent"
                      ? "bg-primary text-white rounded-tr-sm"
                      : "bg-surface border border-border rounded-tl-sm"
                  )}>
                    <p className="text-sm">{msg.text}</p>
                    <p className={cn(
                      "mt-1 text-[10px] text-right",
                      msg.from === "agent" ? "text-white/70" : "text-muted"
                    )}>
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div className="border-t border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
                  placeholder="Écrire un message..."
                  className="flex-1"
                />
                <Button size="sm" disabled={!reply.trim()} onClick={sendReply}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Répondre via <span className="font-medium capitalize">{activeConv.platform}</span> · Entrée pour envoyer
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-muted">Sélectionnez une conversation</p>
            </div>
          </div>
        )}
      </div>

      {createOrderConv && (
        <CreateOrderModal
          conversation={createOrderConv}
          onClose={() => setCreateOrderConv(null)}
          onCreated={() => setCreateOrderConv(null)}
        />
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <RouteGuard>
      <InboxContent />
    </RouteGuard>
  );
}