"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Store } from "@/types/order";

interface StoresContextValue {
  stores: Store[];
  isLoading: boolean;
  refresh: () => void;
}

const StoresContext = createContext<StoresContextValue | null>(null);

export function StoresProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchStores() {
    try {
      const token = window.localStorage.getItem("orderly_token");
      if (!token) {
        setIsLoading(false);
        return;
      }
      const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const res = await fetch(`${API}/stores`,{
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStores(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchStores error:", e);
      setStores([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchStores();
    window.addEventListener("orderly:login", fetchStores);
    return () => window.removeEventListener("orderly:login", fetchStores);
  }, []);

  return (
    <StoresContext.Provider value={{ stores, isLoading, refresh: fetchStores }}>
      {children}
    </StoresContext.Provider>
  );
}

export function useStores() {
  const ctx = useContext(StoresContext);
  if (!ctx) throw new Error("useStores must be used within StoresProvider");
  return ctx;
}