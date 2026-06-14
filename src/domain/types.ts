/**
 * Core domain types for Chowka Bhara Online.
 *
 * This module has ZERO imports (I-CB1, boundary rule B1): the rules engine
 * depends on nothing from React, the DOM, storage, or any backend SDK.
 */

// --- Geometry ---------------------------------------------------------------

export type Coord = readonly [row: number, col: number];
export type PlayerSide = 'south' | 'east' | 'north' | 'west';

/** Single source of truth for the occupancy key format: `"row,col"` (L-CB1). */
export type CoordKey = string & { readonly __brand: 'CoordKey' };

// --- Cowries ----------------------------------------------------------------

export type RollValue = 1 | 2 | 3 | 4 | 5 | 6 | 12;
export type CowrieFace = 'open' | 'closed';

export interface CowrieRoll {
  readonly id: string;
  readonly faces: readonly CowrieFace[]; // length 6
  readonly openCount: number;
  readonly value: RollValue;
  readonly grantsBonusTurn: boolean;
  readonly rolledAt: number;
}

// --- Pawns / players --------------------------------------------------------

export type PawnState = 'home' | 'active' | 'finished';

export interface Pawn {
  readonly id: string;
  readonly playerId: string;
  readonly state: PawnState;
  readonly pathIndex: number | null;
  readonly finishedOrder: number | null;
}

export type PlayerStatus = 'connected' | 'disconnected' | 'resigned';

export interface Player {
  readonly id: string;
  readonly displayName: string;
  readonly side: PlayerSide;
  readonly color: string;
  readonly status: PlayerStatus;
  readonly hasHit: boolean;
  readonly joinedAt: number;
  readonly lastSeenAt: number;
}

// --- Config -----------------------------------------------------------------

export interface GameConfig {
  readonly ruleset: string;
  readonly boardSize: 7;
  readonly minPlayers: 2;
  readonly maxPlayers: 4;

  readonly cowrieCount: 6;
  readonly rollValues: readonly RollValue[];
  readonly entryRoll: 1;
  readonly bonusRolls: readonly RollValue[];

  readonly pawnsPerPlayer: 4 | 6;
  readonly requireHitBeforeInnerPath: boolean;
  readonly exactRollToFinish: boolean;

  /** No stacking on ORDINARY houses: an own pawn blocks, an opponent is hit. */
  readonly allowStacking: false;
  /** Safe houses (the ✕ squares) are the exception: any number of pawns may
   *  share one and no hit occurs (#3). This is what the engine enforces. */
  readonly allowSafeHouseStacking: true;
  readonly allowGatti: false;
  readonly hitOpponentOnLanding: true;
  readonly hitGrantsBonusTurn: true;

  readonly safeHouses: readonly Coord[];
  /** Renamed from innerPathStartIndex (L-CB7): entry to the 5x5 middle ring (24). */
  readonly outerRingExitIndex: number;
  readonly finishIndex: number;

  readonly tripleBonusRule: 'disabled' | 'ignoreThirdAndPass';
  readonly maxTurnChain: number;
}

// --- Game state -------------------------------------------------------------

export type GameStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export type LegalMoveType = 'enter' | 'move';

export interface LegalMove {
  readonly id: string;
  readonly type: LegalMoveType;
  readonly playerId: string;
  readonly pawnId: string;
  readonly rollValue: RollValue;
  readonly from: Coord | null;
  readonly to: Coord;
  readonly fromIndex: number | null;
  readonly toIndex: number;
  readonly wouldHitPawnId: string | null;
  readonly wouldFinish: boolean;
}

export interface GameState {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly status: GameStatus;
  readonly config: GameConfig;

  readonly hostId: string | null;
  readonly players: Readonly<Record<string, Player>>;
  readonly playerOrder: readonly string[];
  readonly currentPlayerId: string | null;

  readonly pawns: Readonly<Record<string, Pawn>>;
  readonly currentRoll: CowrieRoll | null;
  readonly legalMoves: readonly LegalMove[];

  readonly turnNumber: number;
  readonly turnChainRollCount: number;
  readonly winnerPlayerId: string | null;

  readonly history: readonly GameEvent[];
  /** Bounded ring of recently applied commandIds for idempotency (I-CB16). */
  readonly recentCommandIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

// --- Determinism ports (L-CB4) ---------------------------------------------

export interface CowrieRandomSource {
  /** Returns exactly `count` faces. */
  rollFaces(count: number): readonly CowrieFace[];
}
export interface Clock {
  now(): number;
}
export interface IdSource {
  next(): string;
}

/** Bundle of injected nondeterminism so the domain stays pure. */
export interface DomainEnv {
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly random: CowrieRandomSource;
  /** When true the reducer runs assertInvariants after each transition (set by the app, not the domain). */
  readonly devMode?: boolean;
}

// --- Commands ---------------------------------------------------------------

export type CommandType =
  | 'CREATE_ROOM'
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'START_GAME'
  | 'ROLL'
  | 'SELECT_MOVE'
  | 'RESIGN'
  | 'SET_COLOR';

export interface BaseCommand {
  readonly commandId: string;
  readonly type: CommandType;
  readonly gameId: string;
  readonly playerId: string;
  readonly expectedRevision: number;
  readonly issuedAt: number;
}

export interface CreateRoomCommand extends BaseCommand {
  readonly type: 'CREATE_ROOM';
  readonly displayName: string;
}
export interface JoinRoomCommand extends BaseCommand {
  readonly type: 'JOIN_ROOM';
  readonly displayName: string;
  readonly reclaimToken?: string;
}
export interface LeaveRoomCommand extends BaseCommand {
  readonly type: 'LEAVE_ROOM';
}
export interface StartGameCommand extends BaseCommand {
  readonly type: 'START_GAME';
}
export interface RollCowriesCommand extends BaseCommand {
  readonly type: 'ROLL';
}
export interface SelectMoveCommand extends BaseCommand {
  readonly type: 'SELECT_MOVE';
  readonly moveId: string;
}
export interface ResignCommand extends BaseCommand {
  readonly type: 'RESIGN';
}
export interface SetColorCommand extends BaseCommand {
  readonly type: 'SET_COLOR';
  readonly color: string;
}

export type GameCommand =
  | CreateRoomCommand
  | JoinRoomCommand
  | LeaveRoomCommand
  | StartGameCommand
  | RollCowriesCommand
  | SelectMoveCommand
  | ResignCommand
  | SetColorCommand;

// --- Reducer result envelope ------------------------------------------------

export type CommandRejectionCode =
  | 'NOT_CURRENT_PLAYER'
  | 'WRONG_PHASE'
  | 'MOVE_NOT_LEGAL'
  | 'NOT_HOST'
  | 'ROOM_FULL'
  | 'BAD_PLAYER_COUNT'
  | 'DUPLICATE_COMMAND'
  | 'STALE_REVISION'
  | 'GAME_OVER'
  | 'NOT_IN_LOBBY'
  | 'PLAYER_NOT_FOUND'
  | 'INVALID_COLOR'
  | 'COLOR_TAKEN'
  | 'UNKNOWN_COMMAND';

export interface ApplyResult {
  readonly state: GameState;
  readonly accepted: boolean;
  readonly rejection?: CommandRejectionCode;
  readonly events: readonly GameEvent[];
}

// --- Events (history) -------------------------------------------------------

export type GameEventType =
  | 'JOIN'
  | 'LEAVE'
  | 'START'
  | 'ROLL'
  | 'MOVE'
  | 'HIT'
  | 'FINISH'
  | 'SKIP'
  | 'BONUS'
  | 'TURN_ADVANCE'
  | 'WIN'
  | 'RESIGN';

export type SkipReason =
  | 'start-blocked'
  | 'all-targets-blocked'
  | 'inner-path-locked'
  | 'would-overshoot'
  | 'mixed';

export interface GameEvent {
  readonly id: string;
  readonly type: GameEventType;
  readonly playerId: string | null;
  readonly at: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** Derived (non-stored) turn phase (gap G1). */
export type TurnPhase = 'awaiting-roll' | 'awaiting-move' | 'idle';
