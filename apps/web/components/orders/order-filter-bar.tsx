"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OrderStatus,
  FinancialStatus,
  FulfillmentStatus,
  ORDER_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
} from "@/types/order";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";

const ORDER_STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
const FINANCIAL_STATUS_OPTIONS = Object.keys(FINANCIAL_STATUS_LABELS) as FinancialStatus[];
const FULFILLMENT_STATUS_OPTIONS = Object.keys(FULFILLMENT_STATUS_LABELS) as FulfillmentStatus[];

function MultiSelectFilter<T extends string>({
  label,
  options,
  labels,
  selected,
  onChange,
}: {
  label: string;
  options: T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (val: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(val: T) {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val));
    else onChange([...selected, val]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
          selected.length > 0
            ? "border-primary/30 bg-primary-soft text-primary"
            : "border-border bg-surface text-muted hover:text-foreground hover:bg-surface-sunken"
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-56 rounded-md border border-border bg-surface py-1 shadow-lg">
          {selected.length > 0 && (
            <>
              <button
                onClick={() => onChange([])}
                className="flex w-full items-center px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
              >
                Clear filter
              </button>
              <div className="my-1 border-t border-border" />
            </>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-sunken"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="h-3.5 w-3.5 rounded border-border-strong accent-[var(--primary)]"
              />
              {labels[opt]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export interface OrderFilterState {
  search: string;
  orderStatus: OrderStatus[];
  financialStatus: FinancialStatus[];
  fulfillmentStatus: FulfillmentStatus[];
}

export function OrderFilterBar({
  filters,
  onChange,
  resultCount,
}: {
  filters: OrderFilterState;
  onChange: (f: OrderFilterState) => void;
  resultCount: number;
}) {
  const activeFilterCount =
    filters.orderStatus.length + filters.financialStatus.length + filters.fulfillmentStatus.length;

  return (
    <div className="border-b border-border bg-surface px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search order #, customer, email..."
            className="pl-8"
          />
        </div>

        <div className="mx-1 h-5 w-px bg-border" />

        <MultiSelectFilter
          label="Status"
          options={ORDER_STATUS_OPTIONS}
          labels={ORDER_STATUS_LABELS}
          selected={filters.orderStatus}
          onChange={(v) => onChange({ ...filters, orderStatus: v })}
        />
        <MultiSelectFilter
          label="Payment"
          options={FINANCIAL_STATUS_OPTIONS}
          labels={FINANCIAL_STATUS_LABELS}
          selected={filters.financialStatus}
          onChange={(v) => onChange({ ...filters, financialStatus: v })}
        />
        <MultiSelectFilter
          label="Fulfillment"
          options={FULFILLMENT_STATUS_OPTIONS}
          labels={FULFILLMENT_STATUS_LABELS}
          selected={filters.fulfillmentStatus}
          onChange={(v) => onChange({ ...filters, fulfillmentStatus: v })}
        />

        <Button variant="ghost" size="sm" className="text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More filters
        </Button>

        {activeFilterCount > 0 && (
          <button
            onClick={() => onChange({ ...filters, orderStatus: [], financialStatus: [], fulfillmentStatus: [] })}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}

        <span className="ml-auto text-xs text-muted">
          <span className="font-medium text-foreground">{resultCount.toLocaleString()}</span> orders
        </span>
      </div>
    </div>
  );
}
