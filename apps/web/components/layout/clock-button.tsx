"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, Play, Square } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

export function ClockButton() {
  const { user } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/shifts/clock/status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (!user || user.role === "SUPER_ADMIN") return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [user, fetchStatus]);

  if (!user || user.role === "SUPER_ADMIN") return null;

  const clockedIn = status?.clockedIn ?? false;
  const minutes = status?.todayMinutes ?? 0;
  const since = status?.since;

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`${API}/shifts/${clockedIn ? "clock-out" : "clock-in"}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      await fetchStatus();
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  const modal = confirm && mounted && typeof document !== "undefined"
  ? createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="px-6 pt-6 text-center">
              <div className={cn(
                "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                clockedIn ? "bg-rose-50" : "bg-emerald-50"
              )}>
                {clockedIn
                  ? <Square className="h-6 w-6 text-rose-600" />
                  : <Play className="h-6 w-6 text-emerald-600" />
                }
              </div>

              <h2 className="mt-4 text-base font-semibold">
                {clockedIn ? "Terminer votre service" : "Démarrer votre service"}
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-muted">
                {clockedIn
                  ? "Vous ne recevrez plus de nouvelles commandes. Celles non traitées seront redistribuées."
                  : "Les nouvelles commandes vous seront assignées automatiquement."}
              </p>
            </div>

            {clockedIn && (
              <div className="mx-6 mt-5 rounded-xl bg-surface-sunken p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Commencé à</span>
                  <span className="font-mono font-semibold">{fmtTime(since)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted">Durée</span>
                  <span className="font-mono font-semibold">{fmtDuration(minutes)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 p-6">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirm(false)}
              >
                Annuler
              </Button>
              <Button
                className={cn("flex-1", clockedIn && "bg-rose-600 hover:bg-rose-700")}
                disabled={busy}
                onClick={toggle}
              >
                {busy ? "..." : clockedIn ? "Terminer" : "Démarrer"}
              </Button>
            </div>
          </div>
          </div>,
        document.body
      )
    : null;
    return (
        <>
          {modal}
          <div className={cn(
        "rounded-xl border p-3",
        clockedIn
          ? "border-emerald-200 bg-emerald-50"
          : "border-border bg-surface-sunken"
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            clockedIn ? "animate-pulse bg-emerald-500" : "bg-slate-400"
          )} />
          <p className={cn(
            "text-xs font-semibold",
            clockedIn ? "text-emerald-800" : "text-muted"
          )}>
            {clockedIn ? "En service" : "Hors service"}
          </p>
        </div>

        {clockedIn ? (
          <p className="mt-1 text-[11px] text-emerald-700">
            Depuis {fmtTime(since)} · {fmtDuration(minutes)}
          </p>
        ) : minutes > 0 ? (
          <p className="mt-1 text-[11px] text-muted">
            Aujourd'hui : {fmtDuration(minutes)}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted">
            Démarrez pour recevoir des commandes
          </p>
        )}

        <button
          onClick={() => setConfirm(true)}
          className={cn(
            "mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-colors",
            clockedIn
              ? "bg-white text-rose-600 hover:bg-rose-50"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          )}
        >
          {clockedIn
            ? <><Square className="h-3 w-3" /> Terminer mon service</>
            : <><Play className="h-3 w-3" /> Démarrer mon service</>
          }
        </button>
      </div>
    </>
  );
}

export { ClockButton as ClockCard };