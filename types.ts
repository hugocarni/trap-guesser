
export interface Song {
  id: string;
  title: string;
  artist: string;
  previewUrl: string;
  artworkUrl: string;
  genre: string;
}

export enum GameStatus {
  SETUP = 'SETUP', // Name and mode selection
  LOBBY = 'LOBBY', // Waiting for players
  START = 'START', // Host configuration
  PLAYING = 'PLAYING',
  REVEALING = 'REVEALING',
  FINISHED = 'FINISHED'
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  hasAnswered?: boolean;
  lastGuessCorrect?: boolean;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  score: number;
  currentRound: number;
  totalRounds: number;
  difficultySeconds: number;
  status: GameStatus;
  currentSong: Song | null;
  options: Song[];
  history: { song: Song; isCorrect: boolean }[];
  isChallengeMode: boolean;
  playerName: string;
  isMultiplayer: boolean;
}

export interface GeminiClue {
  clue: string;
  trashTalk: string;
}
