import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { OrdersProvider } from "@/lib/orders-context";
import { StoresProvider } from "@/lib/stores-context";

export const metadata: Metadata = {
  title: "Orderly — Order Management",
  description: "Manage orders across all your stores in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <StoresProvider>
            <OrdersProvider>{children}</OrdersProvider>
          </StoresProvider>
        </AuthProvider>
      </body>
    </html>
  );
}