import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "@/hooks/useMe";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useMe();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
