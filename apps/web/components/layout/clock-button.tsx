"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, X } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

function getToken() {
  return window.localStorage.getItem("orderly_token");
}

export function ClockButton() {
  const { user } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors",
          clockedIn
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        )}
      >
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          clockedIn ? "bg-emerald-500" : "bg-slate-400"
        )} />
        {clockedIn ? "En service" : "Hors service"}
        {minutes > 0 && (
          <span className="opacity-70">
            {Math.floor(minutes / 60)}h{String(minutes % 60).padStart(2, "0")}
          </span>
        )}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/30 backdrop-blur-[2px]">
          <div className="mx-3 w-full max-w-sm rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                clockedIn ? "bg-status-cancelled-bg" : "bg-emerald-100"
              )}>
                <Clock className={cn(
                  "h-4 w-4",
                  clockedIn ? "text-status-cancelled" : "text-emerald-700"
                )} />
              </div>
              <h2 className="text-sm font-semibold">
                {clockedIn ? "Terminer votre service ?" : "Commencer votre service ?"}
              </h2>
            </div>

            <div className="p-5">
              <p className="text-xs text-muted leading-relaxed">
                {clockedIn ? (
                  <>
                    Vous ne recevrez plus de nouvelles commandes. Celles que vous
                    n'avez pas traitées seront redistribuées aux agents en service.
                  </>
                ) : (
                  <>
                    Les nouvelles commandes vous seront assignées automatiquement
                    selon vos règles de répartition.
                  </>
                )}
              </p>

              {minutes > 0 && (
                <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs">
                  Temps travaillé aujourd'hui :{" "}
                  <span className="font-mono font-bold">
                    {Math.floor(minutes / 60)}h{String(minutes % 60).padStart(2, "0")}
                  </span>
                </p>
              )}
            </div>

            <div className="flex gap-2 border-t border-border px-5 py-4">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirm(false)}
              >
                Annuler
              </Button>
              <Button
                className={cn("flex-1", clockedIn && "bg-status-cancelled hover:bg-status-cancelled/90")}
                disabled={busy}
                onClick={toggle}
              >
                {busy ? "..." : clockedIn ? "Terminer" : "Commencer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}