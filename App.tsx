
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Song, GameStatus, GameState, Player } from './types';
import { fetchTopTrapReggaeton } from './services/musicService';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';

declare const Peer: any;

const App: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    roomCode: '',
    players: [],
    score: 0,
    currentRound: 0,
    totalRounds: 10,
    difficultySeconds: 5,
    status: GameStatus.SETUP,
    currentSong: null,
    options: [],
    history: [],
    isChallengeMode: false,
    playerName: '',
    isMultiplayer: false
  });

  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [roomInput, setRoomInput] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);

  const hostPlayersRef = useRef<Player[]>([]);

  const loadSongs = async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const data = await fetchTopTrapReggaeton();
      if (data && data.length > 0) {
        setSongs(data);
      } else {
        setFetchError(true);
      }
    } catch (e) {
      console.error("Failed to fetch songs", e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSongs();
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const broadcast = (data: any) => {
    connectionsRef.current.forEach(conn => {
      if (conn.open) conn.send(data);
    });
  };

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    setStartTime(null);
  }, []);

  const playSnippet = useCallback((songToPlay: Song, duration: number) => {
    if (!audioRef.current || !songToPlay || !songToPlay.previewUrl) return;
    
    stopAudio();
    audioRef.current.src = songToPlay.previewUrl;
    audioRef.current.volume = volume;
    
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setStartTime(Date.now());
          
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            audioRef.current?.pause();
            setIsPlaying(false);
          }, duration * 1000);
        })
        .catch(e => {
          console.error("Playback error:", e);
          setIsPlaying(false);
        });
    }
  }, [volume, stopAudio]);

  const handlePeerData = useCallback((data: any) => {
    if (data.type === 'GAME_STATE_UPDATE') {
      setGameState(prev => {
        if (data.payload.players) hostPlayersRef.current = data.payload.players;
        return { ...prev, ...data.payload };
      });
    } else if (data.type === 'START_ROUND') {
      setGameState(prev => {
        const newState = { ...prev, ...data.payload, status: GameStatus.PLAYING };
        if (newState.players) hostPlayersRef.current = newState.players;
        return newState;
      });
    } else if (data.type === 'PLAY_AUDIO') {
      if (data.song) {
        setTimeout(() => playSnippet(data.song, data.duration), 50);
      }
    } else if (data.type === 'REVEAL') {
      setGameState(prev => {
        hostPlayersRef.current = data.players;
        return { ...prev, status: GameStatus.REVEALING, players: data.players };
      });
      stopAudio();
    } else if (data.type === 'PLAYER_JOINED') {
      const newPlayer: Player = data.player;
      const updatedPlayers = [...hostPlayersRef.current.filter(p => p.id !== newPlayer.id), newPlayer];
      hostPlayersRef.current = updatedPlayers;
      setGameState(prev => ({ ...prev, players: updatedPlayers }));
      broadcast({ type: 'GAME_STATE_UPDATE', payload: { players: updatedPlayers } });
    } else if (data.type === 'GUESS_SUBMITTED') {
      const updatedPlayers = hostPlayersRef.current.map(p => 
        p.id === data.playerId ? { ...p, hasAnswered: true, lastGuessCorrect: data.isCorrect, score: p.score + data.points } : p
      );
      hostPlayersRef.current = updatedPlayers;
      
      const allAnswered = updatedPlayers.every(p => p.hasAnswered);
      if (allAnswered) {
        broadcast({ type: 'REVEAL', players: updatedPlayers });
        setGameState(prev => ({ ...prev, status: GameStatus.REVEALING, players: updatedPlayers }));
        stopAudio();
      } else {
        broadcast({ type: 'GAME_STATE_UPDATE', payload: { players: updatedPlayers } });
        setGameState(prev => ({ ...prev, players: updatedPlayers }));
      }
    } else if (data.type === 'RESET_TO_LOBBY') {
        const resetPlayers = hostPlayersRef.current.map(p => ({ ...p, score: 0, hasAnswered: false }));
        hostPlayersRef.current = resetPlayers;
        setGameState(prev => ({
            ...prev,
            status: GameStatus.LOBBY,
            score: 0,
            currentRound: 0,
            history: [],
            players: resetPlayers
        }));
    }
  }, [playSnippet, stopAudio]);

  const createRoom = () => {
    if (!gameState.playerName) {
        alert("Introduce un nombre para jugar online");
        return;
    }
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const peer = new Peer(`TRAPGUESSR-${code}`);
    
    peer.on('open', () => {
      peerRef.current = peer;
      const host: Player = { id: peer.id, name: gameState.playerName, score: 0, isHost: true };
      hostPlayersRef.current = [host];
      setGameState(prev => ({
        ...prev,
        roomCode: code,
        status: GameStatus.LOBBY,
        isMultiplayer: true,
        players: [host]
      }));
    });

    peer.on('connection', (conn: any) => {
      conn.on('open', () => {
        connectionsRef.current.push(conn);
        conn.send({ type: 'GAME_STATE_UPDATE', payload: { 
          status: GameStatus.LOBBY, 
          roomCode: code,
          isMultiplayer: true,
          totalRounds: gameState.totalRounds,
          difficultySeconds: gameState.difficultySeconds
        }});
      });
      conn.on('data', handlePeerData);
    });

    peer.on('error', () => {
      alert("Error al crear sala. Intenta otro código.");
      window.location.reload();
    });
  };

  const joinRoom = () => {
    if (!gameState.playerName) {
        alert("Introduce un nombre para jugar online");
        return;
    }
    if (!roomInput) return;
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(`TRAPGUESSR-${roomInput.toUpperCase()}`);
      conn.on('open', () => {
        connectionsRef.current.push(conn);
        conn.send({ 
          type: 'PLAYER_JOINED', 
          player: { id: peer.id, name: gameState.playerName, score: 0, isHost: false } 
        });
        setGameState(prev => ({ ...prev, status: GameStatus.LOBBY, isMultiplayer: true, roomCode: roomInput.toUpperCase() }));
      });
      conn.on('data', handlePeerData);
    });

    peer.on('error', () => alert("No se encontró la sala."));
  };

  const startNewRound = useCallback((isChallenge: boolean = false) => {
    if (songs.length === 0) return;
    stopAudio();
    
    setGameState(prev => {
      const nextRound = prev.currentRound + 1;
      
      if (nextRound > prev.totalRounds) {
        const finishedState = { ...prev, status: GameStatus.FINISHED };
        if (prev.isMultiplayer) broadcast({ type: 'GAME_STATE_UPDATE', payload: finishedState });
        return finishedState;
      }

      const usedIds = prev.history.map(h => h.song.id);
      let availablePool = songs.filter(s => !usedIds.includes(s.id));
      if (availablePool.length === 0) availablePool = songs;

      const currentSong = availablePool[Math.floor(Math.random() * availablePool.length)];
      const otherOptions = songs
        .filter(s => s.id !== currentSong.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      
      const options = [currentSong, ...otherOptions].sort(() => Math.random() - 0.5);
      const nextDifficulty = isChallenge ? Math.max(1, 11 - nextRound) : prev.difficultySeconds;
      
      const nextPlayers = hostPlayersRef.current.map(p => ({ ...p, hasAnswered: false }));
      hostPlayersRef.current = nextPlayers;

      const nextRoundData = {
        currentRound: nextRound,
        currentSong,
        options,
        difficultySeconds: nextDifficulty,
        status: GameStatus.PLAYING,
        players: nextPlayers,
        isChallengeMode: isChallenge
      };

      if (prev.isMultiplayer) {
        broadcast({ type: 'START_ROUND', payload: nextRoundData });
        setTimeout(() => {
          broadcast({ type: 'PLAY_AUDIO', song: currentSong, duration: nextDifficulty });
          playSnippet(currentSong, nextDifficulty);
        }, 800);
      } else {
        setTimeout(() => playSnippet(currentSong, nextDifficulty), 100);
      }

      return { ...prev, ...nextRoundData };
    });
  }, [songs, stopAudio, playSnippet]);

  const handleGuess = (songId: string) => {
    if (gameState.status !== GameStatus.PLAYING || !gameState.currentSong) return;
    const now = Date.now();
    const isCorrect = songId === gameState.currentSong.id;
    
    let points = 0;
    if (isCorrect && startTime) {
      const timeElapsed = (now - startTime) / 1000;
      const timeLeft = Math.max(0, gameState.difficultySeconds - timeElapsed);
      const speedMultiplier = (timeLeft / gameState.difficultySeconds);
      const basePoints = 50;
      const timeBonus = Math.round(speedMultiplier * 50);
      points = basePoints + timeBonus;
    }

    if (gameState.isMultiplayer) {
      const myId = peerRef.current?.id;
      if (!myId) return;
      
      if (gameState.players.find(p => p.id === myId)?.isHost) {
        handlePeerData({ type: 'GUESS_SUBMITTED', playerId: myId, isCorrect, points });
      } else {
        broadcast({ type: 'GUESS_SUBMITTED', playerId: myId, isCorrect, points });
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => p.id === myId ? { ...p, hasAnswered: true } : p),
          history: [...prev.history, { song: prev.currentSong!, isCorrect }]
        }));
      }
    } else {
      setGameState(prev => ({
        ...prev,
        status: GameStatus.REVEALING,
        score: prev.score + points,
        players: prev.players.map(p => ({ ...p, score: p.score + points, hasAnswered: true })),
        history: [...prev.history, { song: prev.currentSong!, isCorrect }]
      }));
      stopAudio();
    }
  };

  const startPractice = () => {
    const name = gameState.playerName || "Jugador 1";
    const soloPlayer: Player = { id: 'local-player', name, score: 0, isHost: true };
    hostPlayersRef.current = [soloPlayer];
    setGameState(prev => ({ 
        ...prev, 
        playerName: name,
        status: GameStatus.START, 
        isMultiplayer: false, 
        players: [soloPlayer],
        isChallengeMode: false
    }));
  };

  const handleReturnToLobby = () => {
      broadcast({ type: 'RESET_TO_LOBBY' });
      const resetPlayers = hostPlayersRef.current.map(p => ({ ...p, score: 0, hasAnswered: false }));
      hostPlayersRef.current = resetPlayers;
      setGameState(prev => ({
          ...prev,
          status: GameStatus.LOBBY,
          score: 0,
          currentRound: 0,
          history: [],
          players: resetPlayers
      }));
  };

  const handleReset = () => {
    window.location.reload();
  };

  const replaySnippet = () => {
    if (gameState.currentSong) {
      playSnippet(gameState.currentSong, gameState.difficultySeconds);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4 shadow-glow"></div>
          <p className="text-yellow-400 font-black animate-pulse uppercase tracking-[0.2em] text-[8px] md:text-xs text-center">
            Escaneando el bloque...<br/>
            <span className="text-[6px] opacity-50">iTunes API puede tardar unos segundos</span>
          </p>
        </div>
      </Layout>
    );
  }

  if (fetchError) {
    return (
      <Layout>
        <div className="bg-zinc-900 p-8 rounded-[2rem] border border-red-500/50 text-center shadow-2xl animate-in zoom-in-95 duration-500">
          <h2 className="text-2xl font-black text-red-500 mb-4 uppercase italic">¡ERROR DE CONEXIÓN!</h2>
          <p className="text-zinc-400 text-xs mb-6 uppercase tracking-widest leading-relaxed">
            No se han podido cargar las canciones.<br/>Puede ser un problema temporal de iTunes o tu red.
          </p>
          <button 
            onClick={loadSongs}
            className="bg-white text-black px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-glow active:scale-95"
          >
            Reintentar
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <audio ref={audioRef} />

      {gameState.status === GameStatus.SETUP && (
        <div className="bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-zinc-800 text-center shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <h1 className="text-3xl md:text-6xl font-black mb-6 neon-text tracking-tighter uppercase italic text-yellow-400">Trap Guessr</h1>
          <div className="space-y-4 max-w-sm mx-auto relative z-10">
            <input 
              type="text" 
              placeholder="TU APODO" 
              value={gameState.playerName}
              maxLength={12}
              onChange={(e) => setGameState(p => ({ ...p, playerName: e.target.value }))}
              className="w-full bg-zinc-950 border-2 border-zinc-800 p-3 md:p-4 rounded-xl text-white font-black focus:border-yellow-400 outline-none transition-all uppercase tracking-widest text-center text-sm md:text-base"
            />
            
            <div className="grid grid-cols-1 gap-3 pt-2 md:pt-4">
              <button 
                onClick={startPractice}
                disabled={songs.length === 0}
                className="bg-yellow-400 text-black py-3 md:py-4 rounded-xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-glow transform active:scale-95 text-xs md:text-sm disabled:opacity-50"
              >
                Solo (Práctica)
              </button>
              
              <div className="relative flex py-3 md:py-5 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="flex-shrink mx-4 text-zinc-600 font-bold text-[8px] md:text-[10px] uppercase tracking-[0.2em]">Competitivo</span>
                  <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <button 
                onClick={createRoom}
                disabled={songs.length === 0}
                className="bg-zinc-100 text-black py-3 md:py-4 rounded-xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all transform active:scale-95 text-xs md:text-sm disabled:opacity-50"
              >
                Crear Sala
              </button>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="CÓDIGO" 
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-zinc-950 border-2 border-zinc-800 p-3 md:p-4 rounded-xl text-white font-black focus:border-yellow-400 outline-none uppercase text-center text-sm md:text-base w-1/2"
                />
                <button 
                  onClick={joinRoom}
                  disabled={songs.length === 0}
                  className="bg-zinc-800 border-2 border-zinc-700 text-white px-4 md:px-6 rounded-xl font-black uppercase tracking-widest hover:bg-zinc-700 transition-all transform active:scale-95 text-xs md:text-sm disabled:opacity-50"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState.status === GameStatus.LOBBY && (
        <div className="bg-zinc-900 p-6 md:p-8 rounded-[2rem] border border-zinc-800 text-center shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="mb-4 md:mb-6">
             <p className="text-zinc-500 font-black uppercase text-[8px] md:text-[10px] tracking-widest mb-1 md:mb-2">Código de la Sala</p>
             <h2 className="text-4xl md:text-6xl font-black text-yellow-400 tracking-tighter neon-text">{gameState.roomCode}</h2>
          </div>
          
          <div className="bg-black/30 rounded-2xl p-4 md:p-6 mb-6 md:mb-8 text-left space-y-2 max-h-48 md:max-h-64 overflow-y-auto border border-zinc-800/50">
            <p className="text-zinc-600 font-black text-[8px] md:text-[10px] uppercase tracking-widest border-b border-zinc-800 pb-2">Jugadores ({gameState.players.length})</p>
            {gameState.players.map(p => (
              <div key={p.id} className="flex justify-between items-center group py-1">
                <span className="font-black text-white uppercase tracking-tight text-xs md:text-sm flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${p.isHost ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`}></div>
                  {p.name} {p.isHost && '👑'}
                </span>
                <span className="text-zinc-500 text-[8px] uppercase font-black">Listo</span>
              </div>
            ))}
          </div>

          {(gameState.players.some(p => p.isHost && (p.id === peerRef.current?.id || p.id === 'local-player'))) ? (
            <button 
              onClick={() => setGameState(p => ({ ...p, status: GameStatus.START }))}
              className="w-full bg-yellow-400 text-black py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-glow transform active:scale-95 text-xs md:text-sm"
            >
              Configurar Partida
            </button>
          ) : (
            <div className="py-3 md:py-4 px-4 md:px-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
               <p className="text-zinc-400 font-black animate-pulse uppercase tracking-[0.2em] text-[8px] md:text-xs text-center">Esperando al host...</p>
            </div>
          )}
        </div>
      )}

      {gameState.status === GameStatus.START && (
        <div className="bg-zinc-900 p-6 md:p-10 rounded-[2rem] border border-zinc-800 text-center shadow-2xl relative overflow-hidden animate-in fade-in duration-500">
          <h1 className="text-3xl md:text-5xl font-black mb-6 md:mb-8 neon-text tracking-tighter uppercase italic text-yellow-400">Ajustes</h1>
          <div className="space-y-6 md:space-y-8">
            <div>
              <label className="block text-zinc-500 text-[8px] md:text-[10px] font-black mb-3 md:mb-4 uppercase tracking-widest">Segundos de audio</label>
              <div className="flex justify-center gap-2 md:gap-4">
                {[1, 3, 5, 10].map(s => (
                  <button
                    key={s}
                    onClick={() => setGameState(prev => ({ ...prev, difficultySeconds: s }))}
                    className={`w-12 h-12 md:w-20 md:h-20 rounded-xl md:rounded-2xl font-black text-sm md:text-2xl transition-all border-2 ${
                      gameState.difficultySeconds === s ? 'bg-yellow-400 text-black border-yellow-400 scale-110 shadow-glow' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-zinc-500 text-[8px] md:text-[10px] font-black mb-3 md:mb-4 uppercase tracking-widest">Rondas</label>
              <div className="flex justify-center gap-2 md:gap-4">
                {[5, 10, 20, 50].map(r => (
                  <button
                    key={r}
                    onClick={() => setGameState(prev => ({ ...prev, totalRounds: r }))}
                    className={`w-12 h-12 md:w-20 md:h-20 rounded-xl md:rounded-2xl font-black text-sm md:text-2xl transition-all border-2 ${
                      gameState.totalRounds === r ? 'bg-yellow-400 text-black border-yellow-400 scale-110 shadow-glow' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:gap-4 mt-8 md:mt-12">
            <button 
              onClick={() => startNewRound(false)} 
              className="bg-zinc-100 text-black py-4 md:py-5 rounded-2xl font-black text-sm md:text-lg uppercase tracking-widest hover:bg-yellow-400 transition-all"
            >
              Empezar Partida
            </button>
          </div>
        </div>
      )}

      {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.REVEALING) && (
        <div className="space-y-3 md:space-y-4 animate-in fade-in duration-500">
          <div className="flex justify-between items-center bg-zinc-900/80 p-3 md:p-5 rounded-2xl md:rounded-3xl border border-zinc-800 backdrop-blur-md shadow-xl">
            <div className="space-y-1">
              <div className="text-zinc-500 font-black uppercase text-[7px] md:text-[10px] tracking-widest">Ronda {gameState.currentRound}/{gameState.totalRounds}</div>
              <div className="text-white font-black text-sm md:text-xl flex items-center gap-1 md:gap-2">
                <span className="text-yellow-400 text-[8px] md:text-sm font-bungee">PUNTOS</span>
                {gameState.isMultiplayer 
                  ? (gameState.players.find(p => p.id === (peerRef.current?.id))?.score || 0)
                  : (gameState.players[0]?.score || 0)}
              </div>
            </div>
            {gameState.isMultiplayer && (
               <div className="text-right flex flex-col items-end">
                  <div className="text-zinc-500 font-black uppercase text-[7px] md:text-[10px] tracking-widest mb-1">{gameState.roomCode}</div>
                  <div className="flex flex-wrap gap-1.5 md:gap-2 justify-end max-w-[150px] md:max-w-none">
                    {[...gameState.players].sort((a,b) => b.score - a.score).map(p => (
                      <div key={p.id} className="flex flex-col items-center">
                        <div 
                          className={`w-6 h-6 md:w-9 md:h-9 rounded-full border-2 border-zinc-900 flex items-center justify-center text-[8px] md:text-xs font-black uppercase transition-all relative ${p.hasAnswered ? 'bg-green-500 shadow-glow scale-110' : 'bg-zinc-800 text-zinc-500'}`}
                          title={p.name}
                        >
                          {p.name.charAt(0)}
                          {p.isHost && <span className="absolute -top-1 -right-1 text-[6px] md:text-[8px]">👑</span>}
                        </div>
                        <span className="text-[6px] md:text-[9px] font-black text-yellow-400 mt-0.5 tabular-nums">{p.score}</span>
                      </div>
                    ))}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-[2rem] p-4 md:p-8 border border-zinc-800 shadow-2xl text-center relative overflow-hidden">
             <div className="relative w-32 h-32 md:w-56 md:h-56 mx-auto mb-4">
                {gameState.status === GameStatus.REVEALING ? (
                  <img src={gameState.currentSong?.artworkUrl} className="w-full h-full object-cover rounded-2xl md:rounded-[2rem] ring-4 ring-yellow-400/20 shadow-2xl animate-in zoom-in duration-500" alt="Artwork" />
                ) : (
                  <div className={`w-full h-full bg-zinc-950 rounded-2xl md:rounded-[2rem] flex items-center justify-center border-2 border-zinc-800 relative overflow-hidden`}>
                     <div className={`w-20 h-20 md:w-36 md:h-36 rounded-full border-[6px] md:border-[10px] border-zinc-900 bg-zinc-800 flex items-center justify-center ${isPlaying ? 'animate-spin-slow' : ''}`}>
                        <div className={`w-8 h-8 md:w-14 md:h-14 rounded-full bg-yellow-400 shadow-glow ${isPlaying ? 'scale-110' : 'scale-100'} transition-transform`}></div>
                     </div>
                  </div>
                )}
             </div>

             {!gameState.isMultiplayer && gameState.status === GameStatus.PLAYING && (
                <button 
                  onClick={replaySnippet}
                  disabled={isPlaying}
                  className={`mb-4 px-4 md:px-6 py-1.5 md:py-2 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest border transition-all ${isPlaying ? 'bg-zinc-800 border-zinc-700 text-zinc-600 opacity-50 cursor-not-allowed' : 'bg-yellow-400 border-yellow-500 text-black hover:bg-white active:scale-95 shadow-glow'}`}
                >
                  {isPlaying ? 'Tocando...' : 'Repetir Fragmento 🔊'}
                </button>
             )}

             {gameState.status === GameStatus.REVEALING ? (
                <div className="mb-6 md:mb-8 animate-in slide-in-from-top-4">
                   <h2 className="text-xl md:text-3xl font-black text-white uppercase italic tracking-tighter mb-0.5">{gameState.currentSong?.title || "???"}</h2>
                   <p className="text-yellow-400 font-black uppercase tracking-[0.2em] text-[10px] md:text-sm">{gameState.currentSong?.artist || "???"}</p>
                </div>
             ) : (
                <div className="mb-6 md:mb-8 px-2 md:px-12">
                   <div className="h-2 md:h-3 bg-zinc-950 w-full rounded-full overflow-hidden mb-2 md:mb-3 border border-zinc-800">
                      <div className={`h-full bg-yellow-400 transition-all ease-linear shadow-glow ${isPlaying ? 'w-full' : 'w-0'}`} style={{transitionDuration: isPlaying ? `${gameState.difficultySeconds * 1000}ms` : '200ms'}}></div>
                   </div>
                   <p className="text-zinc-600 text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em]">{isPlaying ? '¡ESCUCHA!' : 'TIEMPO FUERA'}</p>
                </div>
             )}

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                {gameState.options.map(opt => {
                  if (!opt) return null;
                  const myPlayer = gameState.players.find(p => p.id === (peerRef.current?.id || 'local-player'));
                  const alreadyAnswered = myPlayer?.hasAnswered;
                  
                  return (
                    <button
                      key={opt.id}
                      disabled={gameState.status === GameStatus.REVEALING || alreadyAnswered}
                      onClick={() => handleGuess(opt.id)}
                      className={`p-3 md:p-5 rounded-xl md:rounded-2xl font-black text-xs md:text-sm uppercase border-2 text-left transition-all transform active:scale-95 ${
                        gameState.status === GameStatus.REVEALING
                          ? opt.id === gameState.currentSong?.id 
                            ? 'bg-green-500/20 border-green-500 text-green-500 scale-105 z-10' 
                            : 'bg-zinc-950 border-transparent text-zinc-700'
                          : alreadyAnswered
                            ? 'bg-zinc-950 border-zinc-900 text-zinc-700 cursor-not-allowed'
                            : 'bg-zinc-800 border-zinc-700 text-white hover:border-yellow-400 hover:bg-zinc-700 shadow-md'
                      }`}
                    >
                      <div className="truncate mb-0.5">{opt.title || "???"}</div>
                      <div className="text-[7px] md:text-[9px] font-bold opacity-40 uppercase tracking-widest">{opt.artist || "???"}</div>
                    </button>
                  );
                })}
             </div>

             {gameState.status === GameStatus.REVEALING && (gameState.isMultiplayer ? (gameState.players.find(p => p.isHost && (p.id === peerRef.current?.id || p.id === 'local-player'))) : true) && (
               <button 
                 onClick={() => startNewRound(gameState.isChallengeMode)} 
                 className="mt-6 md:mt-10 w-full bg-white text-black py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-2xl flex items-center justify-center gap-2 group text-xs md:text-sm"
               >
                 Siguiente Palo
                 <svg className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"/></svg>
               </button>
             )}
          </div>
        </div>
      )}

      {gameState.status === GameStatus.FINISHED && (
        <div className="bg-zinc-900 rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 border border-zinc-800 text-center shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
           <h2 className="text-3xl md:text-7xl font-black mb-6 md:mb-8 uppercase italic tracking-tighter neon-text font-bungee">RESULTADOS</h2>
           <div className="space-y-2 md:space-y-3 mb-8 md:mb-12">
              {[...gameState.players].sort((a,b) => b.score - a.score).map((p, idx) => (
                <div key={p.id} className={`flex justify-between items-center p-4 md:p-6 rounded-2xl md:rounded-3xl transition-all ${idx === 0 ? 'bg-yellow-400 text-black shadow-glow scale-105' : 'bg-zinc-800 text-white'}`}>
                   <div className="flex items-center gap-3 md:gap-5">
                      <span className="font-black text-xl md:text-3xl">#{idx+1}</span>
                      <div className="text-left">
                         <div className="font-black uppercase text-sm md:text-xl leading-none truncate max-w-[100px] md:max-w-none">{p.name}</div>
                         <div className={`text-[7px] md:text-[10px] font-bold uppercase tracking-widest opacity-60`}>{idx === 0 ? 'EL REY' : 'BLOQUE'}</div>
                      </div>
                   </div>
                   <div className="text-right">
                      <span className="font-black text-lg md:text-2xl">{p.score}</span>
                      <span className="block text-[7px] md:text-[10px] font-black uppercase tracking-tighter opacity-60">PTS</span>
                   </div>
                </div>
              ))}
           </div>
           
           <div className="h-32 md:h-40 w-full mb-6 md:mb-8 bg-black/40 rounded-2xl md:rounded-3xl p-3 md:p-4 border border-zinc-800">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={gameState.history.map((h, i) => ({ id: i, val: h.isCorrect ? 1 : 0.2 }))}>
                 <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                   {gameState.history.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.isCorrect ? '#facc15' : '#3f3f46'} />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>

           <div className="grid grid-cols-1 gap-3 md:gap-4">
               {gameState.isMultiplayer && (gameState.players.find(p => p.isHost && (p.id === peerRef.current?.id || p.id === 'local-player'))) && (
                    <button onClick={handleReturnToLobby} className="w-full bg-yellow-400 text-black py-4 md:py-6 rounded-2xl md:rounded-3xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-2xl text-xs md:text-xl">
                        Volver a la Sala
                    </button>
               )}
               <button onClick={handleReset} className="w-full bg-white text-black py-4 md:py-6 rounded-2xl md:rounded-3xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-2xl text-xs md:text-xl relative z-20 cursor-pointer">
                  Menú Principal
               </button>
           </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
