"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteGuard } from "@/components/auth/route-guard";
import { useStores } from "@/lib/stores-context";
import { MOCK_USERS } from "@/lib/mock-users";
import { AppUser, UserRole, USER_ROLE_LABELS } from "@/types/order";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Search, Shield, Store, ToggleLeft, ToggleRight } from "lucide-react";

const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN: "text-status-shipped bg-status-shipped-bg",
  STORE_MANAGER: "text-status-new bg-status-new-bg",
  STAFF: "text-status-onhold bg-status-onhold-bg",
};

function UserRow({
  user,
  isCurrentUser,
  onToggleActive,
  onChangeRole,
  allStores,
}: {
  user: AppUser;
  isCurrentUser: boolean;
  onToggleActive: (id: string) => void;
  onChangeRole: (id: string, role: UserRole) => void;
  allStores: any[];
}) {
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const accessibleStores = allStores.filter((s) => user.storeIds.includes(s.id));

  return (
    <tr className="border-b border-border hover:bg-surface-sunken transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {user.avatarInitials}
          </div>
          <div>
            <p className="text-sm font-medium">
              {user.name}
              {isCurrentUser && (
                <span className="ml-2 text-[10px] font-normal text-muted">(you)</span>
              )}
            </p>
            <p className="text-xs text-muted">{user.email}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen((v) => !v)}
            disabled={isCurrentUser}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              ROLE_COLORS[user.role],
              !isCurrentUser && "cursor-pointer hover:opacity-80"
            )}
          >
            <Shield className="h-3 w-3" />
            {USER_ROLE_LABELS[user.role]}
          </button>

          {roleMenuOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-44 rounded-md border border-border bg-surface py-1 shadow-lg">
              {(["SUPER_ADMIN", "STORE_MANAGER", "STAFF"] as UserRole[]).map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    onChangeRole(user.id, role);
                    setRoleMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-sm hover:bg-surface-sunken",
                    role === user.role ? "font-medium text-primary" : "text-foreground"
                  )}
                >
                  {USER_ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        {user.role === "SUPER_ADMIN" ? (
          <span className="text-xs text-muted">All stores</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {accessibleStores.length === 0 ? (
              <span className="text-xs text-muted">No stores assigned</span>
            ) : (
              accessibleStores.map((s) => (
                <span
                  key={s.id}
                  className="flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-muted"
                >
                  <Store className="h-3 w-3" />
                  {s.name}
                </span>
              ))
            )}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-1 text-xs font-medium",
            user.isActive
              ? "bg-status-delivered-bg text-status-delivered"
              : "bg-status-onhold-bg text-status-onhold"
          )}
        >
          {user.isActive ? "Active" : "Inactive"}
        </span>
      </td>

      <td className="px-4 py-3 text-xs text-muted">
        {new Date(user.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>

      <td className="px-4 py-3">
        {!isCurrentUser && (
          <button
            onClick={() => onToggleActive(user.id)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
          >
            {user.isActive ? (
              <>
                <ToggleRight className="h-4 w-4 text-status-delivered" />
                Deactivate
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4" />
                Activate
              </>
            )}
          </button>
        )}
      </td>
    </tr>
  );
}

function UsersContent() {
  const { user: currentUser, canAccessStore } = useAuth();
  const { stores } = useStores();
  const [users, setUsers] = useState(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const accessibleStores = stores.filter((s) => canAccessStore(s.id));

  useEffect(() => {
    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setSelectedStoreIds(stores.map((s) => s.id));
    }
  }, [stores]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  function toggleActive(id: string) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, isActive: !u.isActive } : u))
    );
  }

  function changeRole(id: string, role: UserRole) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role } : u))
    );
  }

  if (currentUser?.role !== "SUPER_ADMIN") {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar
          stores={accessibleStores}
          selectedStoreIds={selectedStoreIds}
          onChangeSelectedStores={setSelectedStoreIds}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-8 w-8 text-muted-light" />
            <p className="mt-2 text-sm font-medium">Access restricted</p>
            <p className="mt-1 text-xs text-muted">
              Only Super Admins can manage users.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        stores={accessibleStores}
        selectedStoreIds={selectedStoreIds}
        onChangeSelectedStores={setSelectedStoreIds}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
          <h1 className="text-base font-semibold">Users</h1>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Invite user
          </Button>
        </header>

        <div className="grid grid-cols-3 gap-4 border-b border-border bg-surface p-5">
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs text-muted">Total Users</p>
            <p className="mt-1 text-2xl font-bold">{users.length}</p>
          </div>
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs text-muted">Active</p>
            <p className="mt-1 text-2xl font-bold text-status-delivered">
              {users.filter((u) => u.isActive).length}
            </p>
          </div>
          <div className="rounded-lg bg-surface-sunken px-4 py-3">
            <p className="text-xs text-muted">Inactive</p>
            <p className="mt-1 text-2xl font-bold text-muted">
              {users.filter((u) => !u.isActive).length}
            </p>
          </div>
        </div>

        <div className="border-b border-border bg-surface px-5 py-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Store Access</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Joined</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isCurrentUser={u.id === currentUser?.id}
                  onToggleActive={toggleActive}
                  onChangeRole={changeRole}
                  allStores={stores}
                />
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <p className="text-sm font-medium">No users found</p>
              <p className="mt-1 text-xs text-muted">Try a different search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <RouteGuard>
      <UsersContent />
    </RouteGuard>
  );
}