// =====================================================================
// Queue Gamble Route - Blackjack Mini-Game
// =====================================================================
// Allows a queued user to play a round of blackjack against the house to
// move up or down one slot in the waiting queue. The game flow is managed
// server-side to prevent tampering. The client initiates the game and sends
// HIT/STAND decisions; the server keeps deck state, evaluates outcomes, and
// applies queue movements by calling the Arduino API.

export const runtime = 'nodejs';

import { randomInt, randomUUID } from 'crypto';
import { getArduinoBaseUrl } from '@/app/lib/arduino-discovery';

// =====================================================================
// Types
// =====================================================================

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

type Card = {
  rank: Rank;
  suit: Suit;
};

type CardView = {
  rank: Rank | null;
  suit: Suit | null;
  hidden: boolean;
};

type GameStatus = 'player-turn' | 'finished';

type GameResult = 'win' | 'lose' | 'push';

type GameState = {
  id: string;
  uid: string;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  status: GameStatus;
  createdAt: number;
  queueSnapshot: {
    position: number;
    queueCount: number;
  };
};

type Action = 'start' | 'hit' | 'stand' | 'cancel';

type MovementDirection = 'up' | 'down';

// =====================================================================
// In-Memory Session Store
// =====================================================================

const ACTIVE_GAMES = new Map<string, GameState>();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function pruneExpiredGames() {
  const now = Date.now();
  for (const [uid, game] of ACTIVE_GAMES.entries()) {
    if (now - game.createdAt > SESSION_TTL_MS || game.status === 'finished') {
      ACTIVE_GAMES.delete(uid);
    }
  }
}

// =====================================================================
// Blackjack Utilities
// =====================================================================

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck: Card[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function draw(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) {
    throw new Error('Deck exhausted');
  }
  return card;
}

function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10;
  return parseInt(rank, 10);
}

function evaluateHand(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

function serializeHand(hand: Card[], { revealAll = false, hideHole = false } = {}): CardView[] {
  return hand.map((card, index) => {
    const hidden = hideHole && index === 1 && !revealAll;
    return {
      rank: hidden ? null : card.rank,
      suit: hidden ? null : card.suit,
      hidden,
    };
  });
}

// =====================================================================
// Arduino Helpers
// =====================================================================

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function peekQueue(baseUrl: string, uid: string) {
  const res = await fetchWithTimeout(`${baseUrl}/api/queue/peek?uid=${encodeURIComponent(uid)}`);
  if (!res.ok) {
    throw new Error('queue peek failed');
  }
  const data = await res.json();
  return {
    ok: Boolean(data?.ok),
    position: typeof data?.position === 'number' ? data.position : -1,
    queueCount: typeof data?.queueCount === 'number' ? data.queueCount : 0,
  };
}

async function applyMovement(baseUrl: string, uid: string, direction: MovementDirection) {
  const res = await fetchWithTimeout(
    `${baseUrl}/api/queue/swap-adjacent?uid=${encodeURIComponent(uid)}&dir=${direction}`
  );
  if (!res.ok) {
    throw new Error('queue swap failed');
  }
  const data = await res.json();
  return {
    ok: Boolean(data?.ok),
    position: typeof data?.position === 'number' ? data.position : -1,
  };
}

// =====================================================================
// Game Lifecycle Helpers
// =====================================================================

function startNewGame(uid: string, queueInfo: { position: number; queueCount: number }): GameState {
  const deck = createDeck();
  shuffle(deck);
  const player = [draw(deck), draw(deck)];
  const dealer = [draw(deck), draw(deck)];

  const game: GameState = {
    id: randomUUID(),
    uid,
    deck,
    player,
    dealer,
    status: 'player-turn',
    createdAt: Date.now(),
    queueSnapshot: queueInfo,
  };

  return game;
}

function concludeGame(game: GameState): void {
  game.status = 'finished';
  ACTIVE_GAMES.set(game.uid, game);
}

function serializeState(game: GameState, revealDealer: boolean) {
  const playerEval = evaluateHand(game.player);
  const dealerEval = evaluateHand(game.dealer);
  return {
    gameId: game.id,
    status: game.status,
    player: {
      cards: serializeHand(game.player, { revealAll: true }),
      total: playerEval.total,
      soft: playerEval.soft,
    },
    dealer: {
      cards: serializeHand(game.dealer, { revealAll: revealDealer, hideHole: true }),
      total: revealDealer ? dealerEval.total : null,
      soft: revealDealer ? dealerEval.soft : null,
    },
  };
}

function determineOutcome(game: GameState): GameResult {
  const playerEval = evaluateHand(game.player);
  const dealerEval = evaluateHand(game.dealer);
  if (playerEval.total > 21) return 'lose';
  if (dealerEval.total > 21) return 'win';
  if (playerEval.total > dealerEval.total) return 'win';
  if (playerEval.total < dealerEval.total) return 'lose';
  return 'push';
}

function dealerPlay(game: GameState) {
  let dealerEval = evaluateHand(game.dealer);
  while (dealerEval.total < 17 || (dealerEval.total === 17 && dealerEval.soft)) {
    game.dealer.push(draw(game.deck));
    dealerEval = evaluateHand(game.dealer);
  }
}

function checkNaturals(game: GameState): GameResult | null {
  const playerEval = evaluateHand(game.player);
  const dealerEval = evaluateHand(game.dealer);
  const playerBj = game.player.length === 2 && playerEval.total === 21;
  const dealerBj = game.dealer.length === 2 && dealerEval.total === 21;
  if (playerBj && dealerBj) return 'push';
  if (playerBj) return 'win';
  if (dealerBj) return 'lose';
  return null;
}

// =====================================================================
// Main Route Handler
// =====================================================================

export async function POST(req: Request) {
  pruneExpiredGames();

  let body: any = null;
  try {
    body = await req.json();
  } catch (err) {
    // Ignore, handled by validation below
  }

  const uid = typeof body?.uid === 'string' ? body.uid.trim().toUpperCase() : '';
  const action: Action = body?.action || 'start';

  if (!uid) {
    return jsonResponse(400, { ok: false, error: 'uid required' });
  }

  if (!['start', 'hit', 'stand', 'cancel'].includes(action)) {
    return jsonResponse(400, { ok: false, error: 'invalid action' });
  }

  const activeGame = ACTIVE_GAMES.get(uid);

  if (action === 'start') {
    try {
      const base = await getArduinoBaseUrl();
      const peek = await peekQueue(base, uid);
      if (!peek.ok || peek.position <= 1 || peek.position >= peek.queueCount) {
        return jsonResponse(400, {
          ok: false,
          error: 'not eligible',
          details: {
            position: peek.position,
            queueCount: peek.queueCount,
          },
        });
      }

      const game = startNewGame(uid, { position: peek.position, queueCount: peek.queueCount });
      ACTIVE_GAMES.set(uid, game);

      const natural = checkNaturals(game);
      if (natural) {
        dealerPlay(game);
        concludeGame(game);
        try {
          const resultPayload = await finalizeAndMaybeMove(uid, natural, game);
          return jsonResponse(200, {
            ok: true,
            ...serializeState(game, true),
            result: natural,
            movement: resultPayload,
          });
        } finally {
          ACTIVE_GAMES.delete(uid);
        }
      }

      return jsonResponse(200, {
        ok: true,
        message: 'Game started',
        ...serializeState(game, false),
      });
    } catch (err: any) {
      console.error('[queue/gamble] start error', err?.message || err);
      return jsonResponse(502, { ok: false, error: 'arduino unreachable', details: err?.message || 'start failed' });
    }
  }

  if (action === 'cancel') {
    if (activeGame) {
      ACTIVE_GAMES.delete(uid);
    }
    return jsonResponse(200, { ok: true, cancelled: true });
  }

  if (!activeGame) {
    return jsonResponse(404, { ok: false, error: 'no active game' });
  }

  if (activeGame.status !== 'player-turn') {
    return jsonResponse(400, { ok: false, error: 'game already finished' });
  }

  if (typeof body?.gameId !== 'string' || body.gameId !== activeGame.id) {
    return jsonResponse(400, { ok: false, error: 'invalid game token' });
  }

  if (action === 'hit') {
    activeGame.player.push(draw(activeGame.deck));
    const evalPlayer = evaluateHand(activeGame.player);
    if (evalPlayer.total >= 21) {
      dealerPlay(activeGame);
      concludeGame(activeGame);
      const outcome = determineOutcome(activeGame);
      try {
        const movement = await finalizeAndMaybeMove(uid, outcome, activeGame);
        ACTIVE_GAMES.delete(uid);
        return jsonResponse(200, {
          ok: true,
          ...serializeState(activeGame, true),
          result: outcome,
          movement,
        });
      } catch (err: any) {
        ACTIVE_GAMES.delete(uid);
        console.error('[queue/gamble] hit finalize error', err?.message || err);
        return jsonResponse(502, { ok: false, error: 'finalize failed', details: err?.message || 'finalize error' });
      }
    }

    return jsonResponse(200, {
      ok: true,
      ...serializeState(activeGame, false),
      message: 'Player drew a card',
    });
  }

  if (action === 'stand') {
    dealerPlay(activeGame);
    concludeGame(activeGame);
    const outcome = determineOutcome(activeGame);
    try {
      const movement = await finalizeAndMaybeMove(uid, outcome, activeGame);
      ACTIVE_GAMES.delete(uid);
      return jsonResponse(200, {
        ok: true,
        ...serializeState(activeGame, true),
        result: outcome,
        movement,
      });
    } catch (err: any) {
      ACTIVE_GAMES.delete(uid);
      console.error('[queue/gamble] finalize error', err?.message || err);
      return jsonResponse(502, { ok: false, error: 'finalize failed', details: err?.message || 'finalize error' });
    }
  }

  return jsonResponse(400, { ok: false, error: 'unsupported action' });
}

async function finalizeAndMaybeMove(uid: string, outcome: GameResult, game: GameState) {
  const base = await getArduinoBaseUrl();
  const peek = await peekQueue(base, uid);
  const movement = {
    applied: false,
    direction: null as MovementDirection | null,
    position: peek.position,
    error: null as string | null,
  };

  let direction: MovementDirection | null = null;
  if (outcome === 'win') direction = 'up';
  if (outcome === 'lose') direction = 'down';

  if (!direction) {
    return movement;
  }

  if (!peek.ok) {
    movement.error = 'position_unknown';
    return movement;
  }

  if (direction === 'up' && peek.position <= 1) {
    movement.error = 'cannot_move_up';
    return movement;
  }
  if (direction === 'down' && peek.position >= peek.queueCount) {
    movement.error = 'cannot_move_down';
    return movement;
  }

  try {
    const applied = await applyMovement(base, uid, direction);
    movement.applied = applied.ok;
    movement.direction = direction;
    movement.position = applied.position > 0 ? applied.position : peek.position;
    if (!applied.ok) {
      movement.error = 'swap_failed';
    }
  } catch (err: any) {
    movement.error = err?.message || 'swap_failed';
  }

  return movement;
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}


