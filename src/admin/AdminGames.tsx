import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GameRow = {
  game_id: string;
  mode: string;
  stake: number;
  status: string;
  created_at: string;
  settled_at: string | null;
  result: any;
  players: string[];
};

export default function AdminGames() {
  const [games, setGames] = useState<GameRow[]>([]);

  useEffect(() => {
    fetchGames();
  }, []);

  async function fetchGames() {
    const { data } = await supabase.rpc("recent_games_with_players", { p_limit: 25 });
    if (data) setGames(data);
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Recent Games (Read-Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {games.map((g) => (
              <div
                key={g.game_id}
                className="rounded border border-border p-4 text-sm"
              >
                <div className="font-semibold">
                  {g.game_id.slice(0, 8)} - {g.mode.toUpperCase()}
                </div>
                <div className="text-muted-foreground">
                  Stake: {g.stake} | Status: {g.status}
                </div>
                <div className="text-xs text-muted-foreground">
                  Players: {g.players.join(", ")}
                </div>
                {g.status === "settled" && g.result && (
                  <div className="mt-2 rounded bg-muted p-2 text-xs">
                    Result: {JSON.stringify(g.result)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
