import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Lobby = {
  id: string;
  code: string;
  mode: string;
  stake_amount: number;
  status: string;
  max_players: number;
  host_id: string;
  season_id: string | null;
  players: { user_id: string; username: string }[];
};

type Season = {
  id: string;
  name: string;
};

export default function Lobbies() {
  const { user } = useMe();
  const navigate = useNavigate();

  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [joinCode, setJoinCode] = useState("");

  // Create lobby form
  const [mode, setMode] = useState<"1v1" | "ffa3" | "2v2">("1v1");
  const [stake, setStake] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<string>("");

  useEffect(() => {
    fetchLobbies();
    fetchSeasons();

    const channel = supabase
      .channel("lobbies-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "lobbies" }, () => {
        fetchLobbies();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lobby_players" }, () => {
        fetchLobbies();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLobbies() {
    const { data: lobbiesData } = await supabase
      .from("lobbies")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: false });

    if (!lobbiesData) return;

    const lobbiesWithPlayers = await Promise.all(
      lobbiesData.map(async (lobby) => {
        const { data: playersData } = await supabase
          .from("lobby_players")
          .select("user_id, profiles(username)")
          .eq("lobby_id", lobby.id);

        return {
          ...lobby,
          players: playersData?.map((p: any) => ({
            user_id: p.user_id,
            username: p.profiles?.username || "Unknown",
          })) || [],
        };
      })
    );

    setLobbies(lobbiesWithPlayers);
  }

  async function fetchSeasons() {
    const { data } = await supabase.from("seasons").select("id, name").order("created_at", { ascending: false });
    if (data) setSeasons(data);
  }

  async function createLobby() {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { error } = await supabase.from("lobbies").insert({
      code,
      mode,
      stake_amount: stake,
      host_id: user.id,
      season_id: selectedSeason || null,
    });

    if (error) {
      toast({ title: "Failed to create lobby", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lobby created", description: `Share code: ${code}` });
      setStake(0);
      fetchLobbies();
    }
  }

  async function joinLobby() {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }

    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const { error } = await supabase.rpc("join_lobby_by_code", { p_code: code });

    if (error) {
      const msg = error.message;
      if (msg.includes("UNAUTHENTICATED")) {
        toast({ title: "Please log in first", variant: "destructive" });
      } else if (msg.includes("LOBBY_NOT_FOUND")) {
        toast({ title: "No lobby with that code", variant: "destructive" });
      } else if (msg.includes("LOBBY_NOT_OPEN")) {
        toast({ title: "Lobby is not open", variant: "destructive" });
      } else if (msg.includes("ALREADY_IN")) {
        toast({ title: "You already joined", variant: "destructive" });
      } else if (msg.includes("LOBBY_FULL")) {
        toast({ title: "Lobby is full", variant: "destructive" });
      } else {
        toast({ title: "Join failed", description: msg, variant: "destructive" });
      }
    } else {
      toast({ title: "Joined lobby!" });
      setJoinCode("");
      fetchLobbies();
    }
  }

  async function startGame(lobbyId: string, hostId: string) {
    if (!user || user.id !== hostId) {
      toast({ title: "Only host can start", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase.rpc("start_game", { p_lobby_id: lobbyId });

    if (error) {
      const msg = error.message;
      if (msg.includes("INSUFFICIENT_FUNDS")) {
        toast({ title: "Insufficient funds", description: "Not enough balance to cover the stake.", variant: "destructive" });
      } else {
        toast({ title: "Start failed", description: msg, variant: "destructive" });
      }
    } else {
      navigate(`/game/${data}`);
    }
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Lobby</CardTitle>
            <CardDescription>Start a new game</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1v1">1v1</SelectItem>
                  <SelectItem value="ffa3">FFA (3 players)</SelectItem>
                  <SelectItem value="2v2">2v2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stake</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Season (optional)</Label>
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createLobby} className="w-full">
              Create Lobby
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join by Code</CardTitle>
            <CardDescription>Enter a lobby code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                placeholder="ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>
            <Button onClick={joinLobby} className="w-full">
              Join Lobby
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open Lobbies</CardTitle>
        </CardHeader>
        <CardContent>
          {lobbies.length === 0 ? (
            <p className="text-center text-muted-foreground">No open lobbies</p>
          ) : (
            <div className="space-y-3">
              {lobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                >
                  <div>
                    <div className="font-semibold">
                      {lobby.code} - {lobby.mode.toUpperCase()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Stake: {lobby.stake_amount} | Players: {lobby.players.length}/{lobby.max_players}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {lobby.players.map((p) => p.username).join(", ")}
                    </div>
                  </div>
                  {user?.id === lobby.host_id && (
                    <Button onClick={() => startGame(lobby.id, lobby.host_id)}>Start Game</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
