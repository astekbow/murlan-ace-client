import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "@/hooks/useMe";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useMe();

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

  return <>{children}</>;
}
