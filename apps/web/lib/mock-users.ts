import { AppUser } from "@/types/order";
import { MOCK_STORES } from "@/lib/mock-data";

const allStoreIds = MOCK_STORES.map((s) => s.id);

export const MOCK_USERS: AppUser[] = [
  {
    id: "u_1",
    name: "Yassine Amri",
    email: "admin@orderly.app",
    password: "admin123",
    role: "SUPER_ADMIN",
    storeIds: allStoreIds,
    avatarInitials: "YA",
    isActive: true,
    createdAt: "2025-11-02T09:00:00.000Z",
  },
  {
    id: "u_2",
    name: "Sara Belkacem",
    email: "sara@orderly.app",
    password: "manager123",
    role: "STORE_MANAGER",
    storeIds: ["st_1", "st_2"],
    avatarInitials: "SB",
    isActive: true,
    createdAt: "2025-12-10T09:00:00.000Z",
  },
  {
    id: "u_3",
    name: "Karim Fethi",
    email: "karim@orderly.app",
    password: "manager123",
    role: "STORE_MANAGER",
    storeIds: ["st_3", "st_4"],
    avatarInitials: "KF",
    isActive: true,
    createdAt: "2026-01-15T09:00:00.000Z",
  },
  {
    id: "u_4",
    name: "Nadia Cherif",
    email: "nadia@orderly.app",
    password: "staff123",
    role: "STAFF",
    storeIds: ["st_1"],
    avatarInitials: "NC",
    isActive: true,
    createdAt: "2026-02-20T09:00:00.000Z",
  },
  {
    id: "u_5",
    name: "Hugo Marchetti",
    email: "hugo@orderly.app",
    password: "staff123",
    role: "STAFF",
    storeIds: ["st_2", "st_3"],
    avatarInitials: "HM",
    isActive: false,
    createdAt: "2026-03-05T09:00:00.000Z",
  },
];