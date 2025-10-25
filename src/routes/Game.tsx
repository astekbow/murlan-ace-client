import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";

type Round = {
  game_id: string;
  round_no: number;
  current_turn: string | null;
  last_play: any;
  last_player: string | null;
  passes: number;
  turn_time_limit: number;
  turn_deadline: string | null;
};

type GamePlayer = {
  user_id: string;
  order_no: number;
  team: string | null;
  finished_at: string | null;
  finish_rank: number | null;
  username?: string;
};

type OpponentHand = { user_id: string; count: number };

type GameRow = {
  id: string;
  mode: "1v1" | "ffa3" | "2v2";
  stake: number;
  status: string;
  season_id: string | null;
};

type Scoreboard = {
  mode: string;
  target: number;
  teamA?: { users: string[]; points: number };
  teamB?: { users: string[]; points: number };
  leaders?: { user_id: string; points: number }[];
};

const isUuid = (v?: string | null) =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export default function Game() {
  const { id } = useParams<{ id: string }>();
  const safeGameId = isUuid(id) ? id! : null;
  const { user } = useMe();

  const [round, setRound] = useState<Round | null>(null);
  const [myCards, setMyCards] = useState<string[]>([]);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [opponents, setOpponents] = useState<OpponentHand[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // ---------- fetchers ----------
  const fetchMyCards = useCallback(async () => {
    if (!safeGameId || !user?.id) return;
    const { data, error } = await supabase
      .from("player_cards")
      .select("card")
      .eq("game_id", safeGameId)
      .eq("user_id", user.id)
      .order("card");
    if (error) {
      console.error("player_cards:", error.message);
      return;
    }
    setMyCards((data ?? []).map((c: any) => (c.card as string).toUpperCase()));
  }, [safeGameId, user?.id]);

  const fetchOpponents = useCallback(async () => {
    if (!safeGameId) return;
    const { data, error } = await supabase.from("opponent_hands").select("*").eq("game_id", safeGameId);
    if (!error && data) setOpponents(data as OpponentHand[]);
  }, [safeGameId]);

  const fetchScoreboard = useCallback(async (seasonId: string) => {
    const { data, error } = await supabase.rpc("season_scoreboard", {
      p_season: seasonId,
    });
    if (!error && data) setScoreboard(data as Scoreboard);
  }, []);

  const fetchInitial = useCallback(async () => {
    if (!safeGameId || !user?.id) return;

    const [r, gp, g] = await Promise.all([
      supabase.from("rounds").select("*").eq("game_id", safeGameId).maybeSingle(),
      supabase
        .from("game_players")
        .select("user_id, order_no, team, finished_at, finish_rank")
        .eq("game_id", safeGameId)
        .order("order_no"),
      supabase.from("games").select("*").eq("id", safeGameId).maybeSingle(),
    ]);

    if (r.data) setRound(r.data as Round);

    if (g.data) {
      const row = g.data as GameRow;
      setGame(row);
      if (row.season_id) fetchScoreboard(row.season_id);
    }

    if (gp.data) {
      const base = gp.data as GamePlayer[];
      const ids = Array.from(new Set(base.map((p) => p.user_id)));
      let nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", ids);
        (profs ?? []).forEach((p: any) => nameMap.set(p.user_id, p.username ?? "Player"));
      }
      setPlayers(base.map((p) => ({ ...p, username: nameMap.get(p.user_id) })));
    }

    await Promise.all([fetchMyCards(), fetchOpponents()]);
  }, [safeGameId, user?.id, fetchMyCards, fetchOpponents, fetchScoreboard]);

  // ---------- effects ----------
  useEffect(() => {
    if (!safeGameId || !user?.id) return;
    fetchInitial();

    // subscribe AFTER user id is known, and filter to my cards only
    const ch = supabase
      .channel(`game-${safeGameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rounds",
          filter: `game_id=eq.${safeGameId}`,
        },
        (payload) => setRound(payload.new as Round),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_cards",
          filter: `game_id=eq.${safeGameId},user_id=eq.${user.id}`,
        },
        () => fetchMyCards(),
      )
      .subscribe();

    const poll = setInterval(fetchOpponents, 3000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [safeGameId, user?.id, fetchInitial, fetchMyCards, fetchOpponents]);

  // countdown
  useEffect(() => {
    if (!round?.turn_deadline) {
      setTimeLeft(0);
      return;
    }
    const deadline = new Date(round.turn_deadline).getTime();
    const i = setInterval(() => {
      const now = Date.now();
      setTimeLeft(Math.max(0, Math.floor((deadline - now) / 1000)));
    }, 1000);
    return () => clearInterval(i);
  }, [round?.turn_deadline]);

  // ---------- actions ----------
  async function playMove() {
    if (!safeGameId || !user?.id || selected.length === 0) return;
    const { error } = await supabase.rpc("play_move", {
      p_game_id: safeGameId,
      p_cards: selected,
      p_request_id: uuidv4(),
    });
    if (error) handleGameError(error.message);
    else setSelected([]);
  }

  async function passTurn() {
    if (!safeGameId || !user?.id) return;
    const { error } = await supabase.rpc("pass_turn", {
      p_game_id: safeGameId,
      p_request_id: uuidv4(),
    });
    if (error) handleGameError(error.message);
  }

  function handleGameError(msg: string) {
    const map: Record<string, string> = {
      EMPTY_PLAY: "Select cards to play",
      CARD_NOT_OWNED: "You don't own those cards",
      FIRST_PLAY_MUST_INCLUDE_3S: "First play must include 3♠",
      INVALID_COMBINATION: "Invalid combination",
      DOES_NOT_BEAT_LAST: "Must beat last play",
      TURN_NOT_YOURS: "Not your turn",
      DEADLINE_EXCEEDED: "Turn deadline exceeded",
      UNAUTHENTICATED: "Please log in again",
    };
    const key = Object.keys(map).find((k) => msg.includes(k));
    toast({
      title: key ? map[key] : "Error",
      description: key ? undefined : msg,
      variant: "destructive",
    });
  }

  function toggleCard(code: string) {
    const up = code.toUpperCase();
    setSelected((prev) => (prev.includes(up) ? prev.filter((c) => c !== up) : [...prev, up]));
  }

  const isMyTurn = round?.current_turn && user?.id && round.current_turn === user.id;

  // ---------- render ----------
  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-table p-4">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-card p-4 text-sm">
        <div>
          Game: {safeGameId ? safeGameId.slice(0, 8) : "—"} | Mode: {game?.mode?.toUpperCase() ?? "—"} | Stake:{" "}
          {game?.stake ?? "—"}
        </div>
        <div className="font-semibold">{round?.turn_deadline ? `⏱️ ${timeLeft}s` : "—"}</div>
      </div>

      {scoreboard && (
        <Card className="mb-4 p-4">
          <div className="mb-2 text-sm font-semibold">Season Scoreboard (Target: {scoreboard.target})</div>
          {scoreboard.mode === "2v2" && scoreboard.teamA && scoreboard.teamB ? (
            <div className="flex gap-4 text-sm">
              <div>Team A: {scoreboard.teamA.points}</div>
              <div>Team B: {scoreboard.teamB.points}</div>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              {scoreboard.leaders?.map((l, i) => (
                <div key={l.user_id}>
                  {i + 1}. {l.user_id.slice(0, 8)}: {l.points}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Opponents */}
      <div className="mb-4 flex flex-wrap gap-3">
        {players
          .filter((p) => p.user_id !== user?.id)
          .map((p) => {
            const hand = opponents.find((o) => o.user_id === p.user_id);
            return (
              <div key={p.user_id} className="rounded-lg bg-card p-3 text-sm">
                <div className="font-semibold">{p.username ?? p.user_id.slice(0, 6)}</div>
                <div className="text-muted-foreground">
                  Cards: {hand?.count ?? 0}
                  {p.finished_at && " (Finished)"}
                </div>
              </div>
            );
          })}
      </div>

      {/* Last play */}
      <div className="mb-4 flex min-h-[120px] items-center justify-center rounded-lg bg-felt p-4">
        {round?.last_play?.combo?.cards?.length ? (
          <div className="flex gap-2">
            {round.last_play.combo.cards.map((c: string, i: number) => {
              const code = (c || "").toUpperCase();
              return (
                <img
                  key={`${code}-${i}`}
                  src={`/cards/${code}.png`}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/cards/BACK.png";
                  }}
                  alt={code}
                  className="h-24 w-auto rounded shadow-lg"
                />
              );
            })}
          </div>
        ) : (
          <div className="text-muted-foreground">No plays yet</div>
        )}
      </div>

      {/* My hand */}
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {myCards.map((code) => {
          const up = code.toUpperCase();
          const selectedCls = selected.includes(up) ? "-translate-y-4 ring-4 ring-primary" : "hover:-translate-y-2";
          return (
            <img
              key={up}
              src={`/cards/${up}.png`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/cards/BACK.png";
              }}
              alt={up}
              className={`h-28 w-auto cursor-pointer rounded shadow-md transition-transform ${selectedCls}`}
              onClick={() => toggleCard(up)}
            />
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={playMove} disabled={!isMyTurn || selected.length === 0} className="flex-1">
          Play
        </Button>
        <Button onClick={passTurn} disabled={!isMyTurn} variant="secondary" className="flex-1">
          Pass
        </Button>
      </div>
    </div>
  );
}
