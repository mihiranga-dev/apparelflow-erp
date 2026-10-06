import { useState } from "react";
import { USER_ROLES, ROLE_LABELS, type UserRole } from "@apparelflow/shared";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Evaluator-facing role switcher. Re-issues a JWT for the chosen persona
 * (requires an existing authenticated session — see server auth route).
 */
export function RoleSwitcher() {
  const { user, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  if (!user) return null;

  async function handleChange(role: UserRole) {
    if (role === user?.role) return;
    setSwitching(true);
    try {
      await switchRole(role);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Viewing as</span>
      <Select
        value={user.role}
        onValueChange={(v) => handleChange(v as UserRole)}
        disabled={switching}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {USER_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
