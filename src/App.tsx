import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { RequireAuth } from "@/shell/RequireAuth";
import { RequireAdmin } from "@/shell/RequireAdmin";
import Login from "@/routes/Login";
import Lobbies from "@/routes/Lobbies";
import Game from "@/routes/Game";
import Profile from "@/routes/Profile";
import CreditsPanel from "@/admin/CreditsPanel";
import AdminGames from "@/admin/AdminGames";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell>
                  <Lobbies />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/game/:id"
            element={
              <RequireAuth>
                <AppShell>
                  <Game />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <AppShell>
                  <Profile />
                </AppShell>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/credits"
            element={
              <RequireAdmin>
                <AppShell>
                  <CreditsPanel />
                </AppShell>
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/games"
            element={
              <RequireAdmin>
                <AppShell>
                  <AdminGames />
                </AppShell>
              </RequireAdmin>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
