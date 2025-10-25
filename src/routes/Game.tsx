import { useState, useEffect } from "react";
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

type PlayerCard = {
  card: string;
};

type GamePlayer = {
  user_id: string;
  order_no: number;
  team: string | null;
  finished_at: string | null;
  finish_rank: number | null;
  username: string;
};

type OpponentHand = {
  user_id: string;
  count: number;
};

type Game = {
  id: string;
  mode: string;
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

export default function Game() {
  const { id } = useParams<{ id: string }>();
  const { user } = useMe();

  const [round, setRound] = useState<Round | null>(null);
  const [myCards, setMyCards] = useState<string[]>([]);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [opponents, setOpponents] = useState<OpponentHand[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [scoreboard, setScoreboard] = useState<Scoreboard | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!id || !user) return;

    fetchInitialData();

    const channel = supabase
      .channel(`game-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rounds", filter: `game_id=eq.${id}` },
        (payload) => {
          setRound(payload.new as Round);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_cards", filter: `game_id=eq.${id}` },
        () => {
          fetchMyCards();
        }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchOpponents();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [id, user]);

  useEffect(() => {
    if (!round?.turn_deadline) {
      setTimeLeft(0);
      return;
    }

    const deadline = new Date(round.turn_deadline).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((deadline - now) / 1000));
      setTimeLeft(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [round?.turn_deadline]);

  async function fetchInitialData() {
    if (!id || !user) return;

    const [roundRes, playersRes, cardsRes, opponentsRes, gameRes] = await Promise.all([
      supabase.from("rounds").select("*").eq("game_id", id).single(),
      supabase.from("game_players").select("*").eq("game_id", id).order("order_no"),
      supabase.from("player_cards").select("card").eq("game_id", id).eq("user_id", user.id),
      supabase.from("opponent_hands").select("*").eq("game_id", id),
      supabase.from("games").select("*").eq("id", id).single(),
    ]);

    if (roundRes.data) setRound(roundRes.data);
    if (playersRes.data) {
      const playersWithNames = await Promise.all(
        playersRes.data.map(async (p) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("user_id", p.user_id)
            .single();
          return { ...p, username: profile?.username || "Unknown" };
        })
      );
      setPlayers(playersWithNames);
    }
    if (cardsRes.data) setMyCards(cardsRes.data.map((c) => c.card));
    if (opponentsRes.data) setOpponents(opponentsRes.data);
    if (gameRes.data) {
      setGame(gameRes.data);
      if (gameRes.data.season_id) {
        fetchScoreboard(gameRes.data.season_id);
      }
    }
  }

  async function fetchMyCards() {
    if (!id || !user) return;
    const { data } = await supabase
      .from("player_cards")
      .select("card")
      .eq("game_id", id)
      .eq("user_id", user.id);
    if (data) setMyCards(data.map((c) => c.card));
  }

  async function fetchOpponents() {
    if (!id) return;
    const { data } = await supabase.from("opponent_hands").select("*").eq("game_id", id);
    if (data) setOpponents(data);
  }

  async function fetchScoreboard(seasonId: string) {
    const { data } = await supabase.rpc("season_scoreboard", { p_season: seasonId });
    if (data) setScoreboard(data);
  }

  async function playMove() {
    if (!id || !user || selected.length === 0) return;

    const reqId = uuidv4();
    const { error } = await supabase.rpc("play_move", {
      p_game_id: id,
      p_cards: selected,
      p_request_id: reqId,
    });

    if (error) {
      handleGameError(error.message);
    } else {
      setSelected([]);
    }
  }

  async function passTurn() {
    if (!id || !user) return;

    const reqId = uuidv4();
    const { error } = await supabase.rpc("pass_turn", {
      p_game_id: id,
      p_request_id: reqId,
    });

    if (error) {
      handleGameError(error.message);
    }
  }

  function handleGameError(msg: string) {
    if (msg.includes("EMPTY_PLAY")) {
      toast({ title: "Select cards to play", variant: "destructive" });
    } else if (msg.includes("CARD_NOT_OWNED")) {
      toast({ title: "You don't own those cards", variant: "destructive" });
    } else if (msg.includes("FIRST_PLAY_MUST_INCLUDE_3S")) {
      toast({ title: "First play must include 3♠", variant: "destructive" });
    } else if (msg.includes("INVALID_COMBINATION")) {
      toast({ title: "Invalid combination", variant: "destructive" });
    } else if (msg.includes("DOES_NOT_BEAT_LAST")) {
      toast({ title: "Must beat last play", variant: "destructive" });
    } else if (msg.includes("TURN_NOT_YOURS")) {
      toast({ title: "Not your turn", variant: "destructive" });
    } else if (msg.includes("DEADLINE_EXCEEDED")) {
      toast({ title: "Turn deadline exceeded", variant: "destructive" });
    } else {
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  function toggleCard(card: string) {
    setSelected((prev) =>
      prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]
    );
  }

  const isMyTurn = round?.current_turn === user?.id;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-table p-4">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-card p-4 text-sm">
        <div>
          Game: {id?.slice(0, 8)} | Mode: {game?.mode.toUpperCase()} | Stake: {game?.stake}
        </div>
        {round?.turn_deadline && (
          <div className="font-semibold">
            ⏱️ {timeLeft}s
          </div>
        )}
      </div>

      {scoreboard && (
        <Card className="mb-4 p-4">
          <div className="text-sm font-semibold mb-2">Season Scoreboard (Target: {scoreboard.target})</div>
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

      <div className="mb-4 flex flex-wrap gap-3">
        {players
          .filter((p) => p.user_id !== user?.id)
          .map((p) => {
            const hand = opponents.find((o) => o.user_id === p.user_id);
            return (
              <div
                key={p.user_id}
                className="rounded-lg bg-card p-3 text-sm"
              >
                <div className="font-semibold">{p.username}</div>
                <div className="text-muted-foreground">
                  Cards: {hand?.count || 0}
                  {p.finished_at && " (Finished)"}
                </div>
              </div>
            );
          })}
      </div>

      <div className="mb-4 flex min-h-[120px] items-center justify-center rounded-lg bg-felt p-4">
        {round?.last_play?.combo?.cards ? (
          <div className="flex gap-2">
            {round.last_play.combo.cards.map((card: string, i: number) => (
              <img
                key={i}
                src={`/cards/${card}.png`}
                alt={card}
                className="h-24 w-auto rounded shadow-lg"
              />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">No plays yet</div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {myCards.map((card) => (
          <img
            key={card}
            src={`/cards/${card}.png`}
            alt={card}
            className={`h-28 w-auto cursor-pointer rounded shadow-md transition-transform ${
              selected.includes(card) ? "-translate-y-4 ring-4 ring-primary" : "hover:-translate-y-2"
            }`}
            onClick={() => toggleCard(card)}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={playMove}
          disabled={!isMyTurn || selected.length === 0}
          className="flex-1"
        >
          Play
        </Button>
        <Button
          onClick={passTurn}
          disabled={!isMyTurn}
          variant="secondary"
          className="flex-1"
        >
          Pass
        </Button>
      </div>
    </div>
  );
}
