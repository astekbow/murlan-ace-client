import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMe } from "@/hooks/useMe";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, balance } = useMe();
  const navigate = useNavigate();

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: "Logout failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/login");
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-2xl font-bold text-primary">
              Murlan
            </Link>
            {user && (
              <nav className="flex gap-4">
                <Link to="/" className="text-sm text-foreground hover:text-primary">
                  Lobbies
                </Link>
                <Link to="/profile" className="text-sm text-foreground hover:text-primary">
                  Profile
                </Link>
                {isAdmin && (
                  <>
                    <Link to="/admin/credits" className="text-sm text-foreground hover:text-primary">
                      Admin Credits
                    </Link>
                    <Link to="/admin/games" className="text-sm text-foreground hover:text-primary">
                      Admin Games
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">{user.email}</div>
              <div className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
                <span className="text-gold">💰</span>
                <span>{balance.toFixed(2)}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
