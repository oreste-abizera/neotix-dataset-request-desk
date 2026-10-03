import { BarChart3, ListChecks, Upload, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/api/types";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

export const NAV: NavItem[] = [
  { to: "/requests", label: "Requests", icon: ListChecks, roles: ["client", "operator", "admin"] },
  { to: "/imports", label: "Import", icon: Upload, roles: ["operator", "admin"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["operator", "admin"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
];

export const navFor = (role: Role): NavItem[] => NAV.filter((n) => n.roles.includes(role));
