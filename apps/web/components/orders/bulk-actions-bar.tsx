"use client";

import { Button } from "@/components/ui/button";
import { Truck, XCircle, X } from "lucide-react";

export function BulkActionsBar({
  count,
  onClear,
  onFulfill,
  onCancel,
}: {
  count: number;
  onClear: () => void;
  onFulfill: () => void;
  onCancel: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-foreground px-5 py-2.5 text-white">
      <button onClick={onClear} className="flex items-center gap-1.5 text-sm font-medium">
        <X className="h-4 w-4" />
        {count} selected
      </button>
      <div className="mx-2 h-4 w-px bg-white/20" />
      <Button size="sm" variant="ghost" onClick={onFulfill} className="text-white hover:bg-white/10 hover:text-white">
        <Truck className="h-3.5 w-3.5" />
        Mark Shipped
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onCancel}
        className="text-status-cancelled hover:bg-white/10 hover:text-status-cancelled"
      >
        <XCircle className="h-3.5 w-3.5" />
        Cancel orders
      </Button>
    </div>
  );
}