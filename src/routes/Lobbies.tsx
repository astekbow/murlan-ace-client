import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type LobbyRow = {
  id: string;
  code: string;
  mode: "1v1" | "ffa3" | "2v2";
  stake_amount: number;
  status: string;
  max_players: number;
  host_id: string;
  season_id: string | null;
};

type LobbyUI = LobbyRow & {
  players: { user_id: string; username: string }[];
};

type Season = { id: string; name: string };

export default function Lobbies() {
  const { user } = useMe();
  const navigate = useNavigate();

  const [lobbies, setLobbies] = useState<LobbyUI[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [joinCode, setJoinCode] = useState("");

  // Create lobby form
  const [mode, setMode] = useState<"1v1" | "ffa3" | "2v2">("1v1");
  const [stake, setStake] = useState<number>(0);
  const [selectedSeason, setSelectedSeason] = useState<string>("");

  useEffect(() => {
    refreshAll();

    const ch = supabase
      .channel("lobbies-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "lobbies" }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "lobby_players" }, refreshAll)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = async () => {
    await Promise.all([fetchLobbies(), fetchSeasons()]);
  };

  async function fetchLobbies() {
    // 1) get open lobbies
    const { data: lob, error } = await supabase
      .from("lobbies")
      .select("id, code, mode, stake_amount, status, max_players, host_id, season_id")
      .eq("status", "waiting")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetch lobbies:", error);
      setLobbies([]);
      return;
    }
    const lobbiesData = (lob ?? []) as LobbyRow[];
    if (!lobbiesData.length) {
      setLobbies([]);
      return;
    }

    // 2) players for these lobbies (batched; avoid N+1)
    const lobbyIds = lobbiesData.map((l) => l.id);
    const { data: playersRows, error: lpErr } = await supabase
      .from("lobby_players")
      .select("lobby_id, user_id")
      .in("lobby_id", lobbyIds);

    if (lpErr) {
      console.error("fetch lobby_players:", lpErr);
      setLobbies(lobbiesData.map((l) => ({ ...l, players: [] })));
      return;
    }

    const userIds = Array.from(new Set((playersRows ?? []).map((r) => r.user_id)));
    let usernames = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", userIds);
      (profs ?? []).forEach((p) => usernames.set(p.user_id, p.username ?? "Player"));
    }

    const playersByLobby = new Map<string, { user_id: string; username: string }[]>();
    (playersRows ?? []).forEach((r) => {
      const arr = playersByLobby.get(r.lobby_id) ?? [];
      arr.push({ user_id: r.user_id, username: usernames.get(r.user_id) ?? "Player" });
      playersByLobby.set(r.lobby_id, arr);
    });

    const ui: LobbyUI[] = lobbiesData.map((l) => ({
      ...l,
      players: playersByLobby.get(l.id) ?? [],
    }));
    setLobbies(ui);
  }

  async function fetchSeasons() {
    // if created_at doesn’t exist, order by name
    const { data, error } = await supabase.from("seasons").select("id, name").order("name", { ascending: true });
    if (!error && data) setSeasons(data);
  }

  const maxPlayersForMode = useMemo(
    () => (m: "1v1" | "ffa3" | "2v2") => {
      if (m === "1v1") return 2;
      if (m === "ffa3") return 3;
      return 4; // 2v2
    },
    [],
  );

  function newLobbyCode(): string {
    // 6-char uppercase alnum
    const base = Math.random().toString(36).slice(2, 8).toUpperCase();
    return base.replace(/[^A-Z0-9]/g, "A").padEnd(6, "A");
  }

  async function createLobby() {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }
    if (stake < 0) {
      toast({ title: "Invalid stake", description: "Stake must be ≥ 0", variant: "destructive" });
      return;
    }

    const code = newLobbyCode();
    const maxPlayers = maxPlayersForMode(mode);

    // Insert lobby; RLS policy must allow host to insert (see SQL below)
    const { data: lobbyInsert, error: lobErr } = await supabase
      .from("lobbies")
      .insert({
        code,
        mode,
        stake_amount: stake,
        host_id: user.id,
        season_id: selectedSeason || null,
        max_players: maxPlayers,
        status: "waiting",
      })
      .select("id")
      .single();

    if (lobErr || !lobbyInsert) {
      toast({
        title: "Failed to create lobby",
        description: lobErr?.message ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }

    // Ensure HOST is in lobby_players (in case DB trigger is not present)
    const { error: lpErr } = await supabase.from("lobby_players").insert({
      lobby_id: lobbyInsert.id,
      user_id: user.id,
      order_no: 1,
      team: mode === "2v2" ? "A" : null,
    });

    if (lpErr) {
      toast({ title: "Lobby created but join failed", description: lpErr.message, variant: "destructive" });
      return;
    }

    toast({ title: "Lobby created", description: `Share code: ${code}` });
    setStake(0);
    setSelectedSeason("");
    fetchLobbies();
  }

  async function joinLobby() {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      return;
    }

    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      toast({ title: "Invalid code", description: "Use a 6-character code (A–Z, 0–9)", variant: "destructive" });
      return;
    }

    const { error } = await supabase.rpc("join_lobby_by_code", { p_code: code });

    if (error) {
      const msg = error.message ?? "Join failed";
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
      const msg = error.message ?? "Start failed";
      if (msg.includes("INSUFFICIENT_FUNDS")) {
        toast({
          title: "Insufficient funds",
          description: "Not enough balance to cover the stake.",
          variant: "destructive",
        });
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
              <Select value={mode} onValueChange={(v: "1v1" | "ffa3" | "2v2") => setMode(v)}>
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
                onChange={(e) => setStake(Number(e.target.value || 0))}
              />
            </div>
            {seasons.length > 0 && (
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
            )}
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
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
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
                <div key={lobby.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
                  <div>
                    <div className="font-semibold">
                      {lobby.code} — {lobby.mode.toUpperCase()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Stake: {lobby.stake_amount} | Players: {lobby.players.length}/{lobby.max_players}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[60ch]">
                      {lobby.players.map((p) => p.username || p.user_id.slice(0, 6)).join(", ")}
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
