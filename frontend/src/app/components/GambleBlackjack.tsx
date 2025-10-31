"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";

type CardView = {
  rank: string | null;
  suit: Suit | null;
  hidden: boolean;
};

type HandView = {
  cards: CardView[];
  total: number | null;
  soft: boolean | null;
};

type MovementSummary = {
  applied: boolean;
  direction: "up" | "down" | null;
  position: number | null;
  error: string | null;
};

export type GambleSummary = {
  result: "win" | "lose" | "push";
  movement: MovementSummary;
};

type GameState = {
  ok: boolean;
  gameId: string;
  status: "player-turn" | "finished";
  player: HandView;
  dealer: HandView;
  result?: "win" | "lose" | "push";
  movement?: MovementSummary;
  message?: string;
  error?: string;
};

type Props = {
  uid: string;
  onClose: (options?: { cancelled?: boolean }) => void;
  onFinished?: (summary: GambleSummary) => void;
};

const suitGlyph: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const suitColor: Record<Suit, string> = {
  spades: "text-neutral-900",
  clubs: "text-neutral-900",
  hearts: "text-rose-500",
  diamonds: "text-rose-500",
};

const faceBackground: Record<Suit, string> = {
  spades: "bg-gradient-to-br from-white via-white to-neutral-100",
  clubs: "bg-gradient-to-br from-white via-white to-neutral-100",
  hearts: "bg-gradient-to-br from-white via-white to-rose-50",
  diamonds: "bg-gradient-to-br from-white via-white to-rose-50",
};

function formatTotal(total: number | null, soft: boolean | null) {
  if (total == null) return "";
  if (soft) return `${total} (soft)`;
  return String(total);
}

function Card({ card }: { card: CardView }) {
  if (card.hidden) {
    return (
      <div className="h-32 w-24 rounded-2xl border border-black/10 bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-300 shadow-sm" />
    );
  }
  if (!card.rank || !card.suit) return null;
  return (
    <div
      className={`h-32 w-24 rounded-2xl border border-black/10 ${faceBackground[card.suit]} shadow-sm flex flex-col justify-between px-3 py-2`}
    >
      <div className={`text-sm font-medium ${suitColor[card.suit]}`}>{card.rank}</div>
      <div className={`text-center text-2xl leading-none ${suitColor[card.suit]}`}>{suitGlyph[card.suit]}</div>
      <div className={`text-sm self-end rotate-180 font-medium ${suitColor[card.suit]}`}>{card.rank}</div>
    </div>
  );
}

function describeError(message: string): string {
  if (message === "not eligible") return "Gamble is only available when someone is ahead of you and behind you.";
  if (message === "no active game") return "This game expired. Start a new one.";
  if (message === "invalid game token") return "Session mismatch. Please start again.";
  if (message === "finalize failed") return "Connection issue while finishing the game.";
  return message;
}

async function postGamble(uid: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/queue/gamble", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, ...payload }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    const error = data?.error || "request failed";
    throw new Error(typeof error === "string" ? error : "request failed");
  }
  return data as GameState;
}

export default function GambleBlackjack({ uid, onClose, onFinished }: Props) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"hit" | "stand" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await postGamble(uid, { action: "start" });
      setGame(next);
    } catch (err: any) {
      setError(describeError(err?.message || "Unable to start game"));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void startGame();
  }, [startGame]);

  useEffect(() => {
    if (game?.status === "finished" && game?.result) {
      const summary: GambleSummary = {
        result: game.result,
        movement: game.movement || {
          applied: false,
          direction: null,
          position: null,
          error: null,
        },
      };
      onFinished?.(summary);
    }
  }, [game, onFinished]);

  const handHint = useMemo(() => {
    if (!game?.player?.total) return "";
    if (game.player.total < 17) return "Hit to try improving";
    if (game.player.total === 21) return "Twenty-one!";
    if (game.player.total >= 17) return "Standing is usually safe";
    return "";
  }, [game]);

  async function handleAction(action: "hit" | "stand") {
    if (!game || game.status !== "player-turn" || pending) return;
    setPending(action);
    setError(null);
    try {
      const next = await postGamble(uid, { action, gameId: game.gameId });
      setGame(next);
    } catch (err: any) {
      setError(describeError(err?.message || "Request failed"));
    } finally {
      setPending(null);
    }
  }

  const cancelGame = useCallback(async () => {
    try {
      await postGamble(uid, { action: "cancel" });
    } catch (_) {
      // swallow
    }
  }, [uid]);

  async function handleCancel() {
    if (game && game.status === "player-turn") {
      await cancelGame();
    }
    onClose({ cancelled: true });
  }

  function handleDone() {
    onClose();
  }

  if (loading) {
    return (
      <div className="w-full max-w-xl rounded-3xl border border-black/10 bg-white/80 backdrop-blur-sm px-8 py-10 shadow-lg">
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Gamble Slot</p>
        <p className="mt-6 text-lg text-neutral-600">Setting up the deck…</p>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="w-full max-w-xl rounded-3xl border border-black/10 bg-white/80 backdrop-blur-sm px-8 py-10 shadow-lg">
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Gamble Slot</p>
        <p className="mt-4 text-lg text-neutral-700">{error}</p>
        <div className="mt-6 flex gap-3">
          <button
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            onClick={() => void startGame()}
          >
            Try again
          </button>
          <button
            className="rounded-full border border-transparent px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50"
            onClick={() => onClose({ cancelled: true })}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!game) return null;

  const dealerTitle = game.status === "finished" ? "Dealer" : "Dealer shows";

  const movementNote = (() => {
    if (!game.movement || !game.result) return null;
    if (!game.movement.direction) {
      return "Queue position unchanged";
    }
    if (!game.movement.applied) {
      if (game.movement.error === "cannot_move_up") return "Could not move up – you're already first.";
      if (game.movement.error === "cannot_move_down") return "Could not move down – no one behind you.";
      return "Queue movement could not be applied";
    }
    if (game.movement.direction === "up") {
      return "You moved up by one";
    }
    return "You moved down by one";
  })();

  return (
    <div className="w-full max-w-3xl rounded-[28px] border border-black/10 bg-white/80 px-8 py-8 shadow-xl backdrop-blur-sm text-left">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Gamble Slot</p>
          <h3 className="mt-2 text-2xl font-serif text-neutral-800">Blackjack</h3>
        </div>
        {game.status === "player-turn" ? (
          <button
            onClick={handleCancel}
            className="text-sm text-neutral-500 underline-offset-4 hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-500">{error}</p>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <header className="flex items-baseline justify-between">
            <h4 className="text-sm uppercase tracking-[0.25em] text-neutral-500">You</h4>
            <span className="text-sm text-neutral-600">{formatTotal(game.player.total, game.player.soft)}</span>
          </header>
          <div className="mt-3 flex flex-wrap gap-3">
            {game.player.cards.map((card, idx) => (
              <Card key={`player-${idx}`} card={card} />
            ))}
          </div>
          {handHint ? <p className="mt-3 text-xs text-neutral-500">{handHint}</p> : null}
        </section>

        <section>
          <header className="flex items-baseline justify-between">
            <h4 className="text-sm uppercase tracking-[0.25em] text-neutral-500">{dealerTitle}</h4>
            <span className="text-sm text-neutral-600">
              {game.dealer.total != null ? formatTotal(game.dealer.total, game.dealer.soft) : ""}
            </span>
          </header>
          <div className="mt-3 flex flex-wrap gap-3">
            {game.dealer.cards.map((card, idx) => (
              <Card key={`dealer-${idx}`} card={card} />
            ))}
          </div>
          {game.status === "player-turn" ? (
            <p className="mt-3 text-xs text-neutral-500">Dealer draws to 17</p>
          ) : null}
        </section>
      </div>

      {game.status === "player-turn" ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void handleAction("hit")}
            disabled={pending === "hit"}
            className="rounded-full border border-neutral-300 px-5 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60"
          >
            {pending === "hit" ? "Hitting…" : "Hit"}
          </button>
          <button
            onClick={() => void handleAction("stand")}
            disabled={pending === "stand"}
            className="rounded-full border border-neutral-900/70 bg-neutral-900/90 px-5 py-2 text-sm text-white transition hover:bg-neutral-900 disabled:opacity-60"
          >
            {pending === "stand" ? "Standing…" : "Stand"}
          </button>
          <p className="text-xs text-neutral-500">Win to move up one slot, lose to drop one.</p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-black/5 bg-white/70 px-5 py-4">
          <p className="text-base font-medium text-neutral-800">
            {game.result === "win" ? "You won" : game.result === "lose" ? "Dealer wins" : "Push"}
          </p>
          {movementNote ? <p className="mt-2 text-sm text-neutral-600">{movementNote}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleDone}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


