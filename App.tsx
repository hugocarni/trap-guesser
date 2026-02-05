
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Song, GameStatus, GameState, Player } from './types';
import { fetchTopTrapReggaeton } from './services/musicService';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);

  // Initialize music pool
  useEffect(() => {
    const init = async () => {
      const data = await fetchTopTrapReggaeton();
      setSongs(data);
      setLoading(false);
    };
    init();
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // PeerJS Messaging Helpers
  const broadcast = (data: any) => {
    connectionsRef.current.forEach(conn => conn.send(data));
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

  const playSnippet = useCallback(() => {
    if (!audioRef.current || !gameState.currentSong) return;
    
    audioRef.current.src = gameState.currentSong.previewUrl;
    audioRef.current.volume = volume;
    audioRef.current.play().catch(e => console.log("Playback error:", e));
    setIsPlaying(true);
    setStartTime(Date.now());

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      audioRef.current?.pause();
      setIsPlaying(false);
    }, gameState.difficultySeconds * 1000);
  }, [gameState.currentSong, gameState.difficultySeconds, volume]);

  // Multiplayer Message Handler
  const handlePeerData = useCallback((data: any) => {
    if (data.type === 'GAME_STATE_UPDATE') {
      setGameState(prev => ({ ...prev, ...data.payload }));
    } else if (data.type === 'START_ROUND') {
      setGameState(prev => ({ ...prev, ...data.payload, status: GameStatus.PLAYING }));
    } else if (data.type === 'PLAY_AUDIO') {
      playSnippet();
    } else if (data.type === 'REVEAL') {
      setGameState(prev => ({ ...prev, status: GameStatus.REVEALING, players: data.players }));
    } else if (data.type === 'PLAYER_JOINED') {
      const newPlayer: Player = data.player;
      setGameState(prev => ({
        ...prev,
        players: [...prev.players.filter(p => p.id !== newPlayer.id), newPlayer]
      }));
    } else if (data.type === 'GUESS_SUBMITTED') {
      // Host handles scoring
      setGameState(prev => {
        const updatedPlayers = prev.players.map(p => 
          p.id === data.playerId ? { ...p, hasAnswered: true, lastGuessCorrect: data.isCorrect, score: p.score + data.points } : p
        );
        const allAnswered = updatedPlayers.every(p => p.hasAnswered);
        if (allAnswered) {
          // Auto reveal after small delay
          setTimeout(() => {
             broadcast({ type: 'REVEAL', players: updatedPlayers });
             setGameState(s => ({ ...s, status: GameStatus.REVEALING, players: updatedPlayers }));
          }, 1000);
        }
        return { ...prev, players: updatedPlayers };
      });
    }
  }, [playSnippet]);

  // Create Room
  const createRoom = () => {
    if (!gameState.playerName) return;
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const peer = new Peer(`TRAPGUESSR-${code}`);
    
    peer.on('open', () => {
      peerRef.current = peer;
      const host: Player = { id: peer.id, name: gameState.playerName, score: 0, isHost: true };
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
        // Send current game state to new player
        conn.send({ type: 'GAME_STATE_UPDATE', payload: { ...gameState, roomCode: code, isMultiplayer: true } });
      });
      conn.on('data', handlePeerData);
    });
  };

  // Join Room
  const joinRoom = () => {
    if (!gameState.playerName || !roomInput) return;
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
      });
      conn.on('data', handlePeerData);
    });
  };

  const startNewRound = useCallback((isChallenge: boolean = false) => {
    stopAudio();
    
    setGameState(prev => {
      const nextRound = prev.currentRound + 1;
      if (nextRound > prev.totalRounds) {
        const finishedState = { ...prev, status: GameStatus.FINISHED };
        if (prev.isMultiplayer) broadcast({ type: 'GAME_STATE_UPDATE', payload: finishedState });
        return finishedState;
      }

      const usedIds = prev.history.map(h => h.song.id);
      const availablePool = songs.filter(s => !usedIds.includes(s.id));
      const currentSong = availablePool[Math.floor(Math.random() * availablePool.length)];
      const otherOptions = songs.filter(s => s.id !== currentSong.id).sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [currentSong, ...otherOptions].sort(() => Math.random() - 0.5);

      const nextDifficulty = isChallenge ? Math.max(1, 11 - nextRound) : prev.difficultySeconds;
      
      const nextRoundData = {
        currentRound: nextRound,
        currentSong,
        options,
        difficultySeconds: nextDifficulty,
        status: GameStatus.PLAYING,
        players: prev.players.map(p => ({ ...p, hasAnswered: false }))
      };

      if (prev.isMultiplayer) {
        broadcast({ type: 'START_ROUND', payload: nextRoundData });
        setTimeout(() => broadcast({ type: 'PLAY_AUDIO' }), 500);
      } else {
        setTimeout(playSnippet, 100);
      }

      return { ...prev, ...nextRoundData };
    });
  }, [songs, stopAudio, playSnippet]);

  const handleGuess = (songId: string) => {
    if (gameState.status !== GameStatus.PLAYING) return;
    const endTime = Date.now();
    const isCorrect = songId === gameState.currentSong?.id;
    
    // Time-based scoring: faster = more points
    let points = 0;
    if (isCorrect && startTime) {
      const timeElapsed = (endTime - startTime) / 1000;
      const timeLeft = Math.max(0, gameState.difficultySeconds - timeElapsed);
      const timeBonus = Math.round((timeLeft / gameState.difficultySeconds) * 50);
      const basePoints = 50;
      points = basePoints + timeBonus;
      
      if (gameState.isChallengeMode) {
        const multiplier = 1 + (gameState.currentRound - 1) * 0.2;
        points = Math.round(points * multiplier);
      }
    }

    if (gameState.isMultiplayer) {
      const myId = peerRef.current.id;
      const hostConn = connectionsRef.current[0]; // In P2P simple mode, first is usually host
      broadcast({ type: 'GUESS_SUBMITTED', playerId: myId, isCorrect, points });
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === myId ? { ...p, hasAnswered: true, lastGuessCorrect: isCorrect, score: p.score + points } : p)
      }));
    } else {
      setGameState(prev => ({
        ...prev,
        status: GameStatus.REVEALING,
        score: prev.score + points,
        history: [...prev.history, { song: prev.currentSong!, isCorrect }]
      }));
      stopAudio();
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-yellow-400 font-bold animate-pulse uppercase tracking-widest text-sm">Entrando al bloque...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <audio ref={audioRef} />

      {gameState.status === GameStatus.SETUP && (
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 text-center shadow-2xl relative overflow-hidden">
          <h1 className="text-4xl md:text-6xl font-black mb-6 neon-text tracking-tighter uppercase italic">Trap Guessr Online</h1>
          <div className="space-y-4 max-w-sm mx-auto">
            <input 
              type="text" 
              placeholder="TU APODO (Ej: Benito)" 
              value={gameState.playerName}
              onChange={(e) => setGameState(p => ({ ...p, playerName: e.target.value }))}
              className="w-full bg-zinc-800 border-2 border-zinc-700 p-4 rounded-xl text-white font-bold focus:border-yellow-400 outline-none transition-all uppercase tracking-widest"
            />
            
            <div className="grid grid-cols-1 gap-3 pt-4">
              <button 
                onClick={() => setGameState(p => ({ ...p, status: GameStatus.START }))}
                className="bg-yellow-400 text-black py-4 rounded-xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-glow"
              >
                Solo (Modo Práctica)
              </button>
              
              <div className="relative flex py-5 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="flex-shrink mx-4 text-zinc-600 font-bold text-xs uppercase">Online</span>
                  <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <button 
                onClick={createRoom}
                className="bg-zinc-100 text-black py-4 rounded-xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all"
              >
                Crear Sala
              </button>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="CÓDIGO" 
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-zinc-800 border-2 border-zinc-700 p-4 rounded-xl text-white font-bold focus:border-yellow-400 outline-none uppercase"
                />
                <button 
                  onClick={joinRoom}
                  className="bg-zinc-800 border-2 border-zinc-700 text-white px-6 rounded-xl font-black uppercase tracking-widest hover:bg-zinc-700 transition-all"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState.status === GameStatus.LOBBY && (
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 text-center shadow-2xl">
          <div className="mb-6">
             <p className="text-zinc-500 font-black uppercase text-xs tracking-widest mb-2">Sala de Espera</p>
             <h2 className="text-5xl font-black text-yellow-400 tracking-tighter">{gameState.roomCode}</h2>
          </div>
          
          <div className="bg-black/30 rounded-2xl p-4 mb-8 text-left space-y-2 max-h-48 overflow-y-auto">
            {gameState.players.map(p => (
              <div key={p.id} className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="font-bold text-white uppercase tracking-tight">{p.name} {p.isHost && '👑'}</span>
                <span className="bg-green-500/10 text-green-500 text-[10px] px-2 py-0.5 rounded uppercase font-black">Ready</span>
              </div>
            ))}
          </div>

          {gameState.players[0]?.id === peerRef.current?.id ? (
            <button 
              onClick={() => setGameState(p => ({ ...p, status: GameStatus.START }))}
              className="w-full bg-yellow-400 text-black py-4 rounded-xl font-black uppercase tracking-widest"
            >
              Ir a Configuración
            </button>
          ) : (
            <p className="text-zinc-500 font-bold animate-pulse uppercase tracking-widest text-sm">Esperando al host...</p>
          )}
        </div>
      )}

      {gameState.status === GameStatus.START && (
        <div className="bg-zinc-900 p-6 md:p-10 rounded-3xl border border-zinc-800 text-center shadow-2xl relative overflow-hidden group">
          <h1 className="text-4xl md:text-6xl font-black mb-4 md:mb-6 neon-text tracking-tighter uppercase italic">Configurar Partida</h1>
          
          <div className="space-y-6 md:space-y-8 relative z-10">
            <div>
              <label className="block text-zinc-500 text-[10px] md:text-sm font-bold mb-3 uppercase tracking-tighter">Dificultad base</label>
              <div className="flex justify-center gap-2 md:gap-4">
                {[1, 3, 5, 10].map(s => (
                  <button
                    key={s}
                    onClick={() => setGameState(prev => ({ ...prev, difficultySeconds: s }))}
                    className={`w-12 h-12 md:w-16 md:h-16 rounded-xl font-black text-lg md:text-xl transition-all ${
                      gameState.difficultySeconds === s ? 'bg-yellow-400 text-black scale-110 shadow-glow' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-zinc-500 text-[10px] md:text-sm font-bold mb-3 uppercase tracking-tighter">Número de Canciones</label>
              <div className="flex justify-center gap-2 md:gap-4">
                {[5, 10, 20, 50].map(r => (
                  <button
                    key={r}
                    onClick={() => setGameState(prev => ({ ...prev, totalRounds: r }))}
                    className={`w-12 h-12 md:w-16 md:h-16 rounded-xl font-black text-lg md:text-xl transition-all ${
                      gameState.totalRounds === r ? 'bg-yellow-400 text-black scale-110' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
            <button
              onClick={() => startNewRound(false)}
              className="bg-white text-black py-4 rounded-2xl font-black text-lg uppercase tracking-widest"
            >
              Modo Normal
            </button>
            <button
              onClick={() => startNewRound(true)}
              className="bg-orange-600 text-white py-4 rounded-2xl font-black text-lg uppercase tracking-widest"
            >
              Modo Desafío 🔥
            </button>
          </div>
        </div>
      )}

      {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.REVEALING) && (
        <div className="space-y-4 animate-in fade-in">
          {/* Header Info */}
          <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <div>
              <div className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">Ronda {gameState.currentRound}/{gameState.totalRounds}</div>
              <div className="text-white font-black text-lg">SCORE: {gameState.isMultiplayer ? gameState.players.find(p => p.id === peerRef.current?.id)?.score : gameState.score}</div>
            </div>
            {gameState.isMultiplayer && (
               <div className="text-right">
                  <div className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">Sala: {gameState.roomCode}</div>
                  <div className="flex -space-x-2 justify-end mt-1">
                    {gameState.players.map(p => (
                      <div key={p.id} className={`w-8 h-8 rounded-full border-2 border-zinc-900 flex items-center justify-center text-[10px] font-black uppercase ${p.hasAnswered ? 'bg-green-500' : 'bg-zinc-700'}`}>
                        {p.name.charAt(0)}
                      </div>
                    ))}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-2xl text-center">
             <div className="relative w-40 h-40 mx-auto mb-6">
                {gameState.status === GameStatus.REVEALING ? (
                  <img src={gameState.currentSong?.artworkUrl} className="w-full h-full object-cover rounded-2xl ring-4 ring-yellow-400/20 shadow-2xl" alt="Song" />
                ) : (
                  <div className={`w-full h-full bg-zinc-800 rounded-2xl flex items-center justify-center border-2 border-zinc-700`}>
                     <div className={`w-24 h-24 rounded-full border-4 border-zinc-900 bg-zinc-700 flex items-center justify-center ${isPlaying ? 'animate-spin-slow' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-yellow-400"></div>
                     </div>
                  </div>
                )}
             </div>

             {gameState.status === GameStatus.REVEALING ? (
                <div className="mb-6">
                   <h2 className="text-2xl font-black text-white uppercase italic">{gameState.currentSong?.title}</h2>
                   <p className="text-yellow-400 font-bold uppercase tracking-widest">{gameState.currentSong?.artist}</p>
                </div>
             ) : (
                <div className="mb-6 px-8">
                   <div className="h-2 bg-zinc-800 w-full rounded-full overflow-hidden mb-2">
                      <div className={`h-full bg-yellow-400 transition-all ease-linear ${isPlaying ? 'w-full' : 'w-0'}`} style={{transitionDuration: isPlaying ? `${gameState.difficultySeconds * 1000}ms` : '200ms'}}></div>
                   </div>
                   <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">{isPlaying ? '¡ESCUCHA!' : 'SE ACABÓ EL TIEMPO'}</p>
                </div>
             )}

             <div className="grid grid-cols-1 gap-2">
                {gameState.options.map(opt => (
                  <button
                    key={opt.id}
                    disabled={gameState.status === GameStatus.REVEALING || (gameState.isMultiplayer && gameState.players.find(p => p.id === peerRef.current?.id)?.hasAnswered)}
                    onClick={() => handleGuess(opt.id)}
                    className={`p-4 rounded-xl font-black text-sm uppercase transition-all transform active:scale-95 border-2 ${
                      gameState.status === GameStatus.REVEALING
                        ? opt.id === gameState.currentSong?.id ? 'bg-green-500/20 border-green-500 text-green-500' : 'bg-zinc-800/50 border-transparent text-zinc-600'
                        : (gameState.isMultiplayer && gameState.players.find(p => p.id === peerRef.current?.id)?.hasAnswered)
                          ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500'
                          : 'bg-zinc-800 border-zinc-700 text-white hover:border-yellow-400'
                    }`}
                  >
                    {opt.title} <span className="text-[10px] opacity-40 block">{opt.artist}</span>
                  </button>
                ))}
             </div>

             {gameState.status === GameStatus.REVEALING && (gameState.players[0]?.id === peerRef.current?.id || !gameState.isMultiplayer) && (
               <button onClick={() => startNewRound(gameState.isChallengeMode)} className="mt-6 w-full bg-yellow-400 text-black py-4 rounded-xl font-black uppercase tracking-widest">
                 Siguiente Ronda
               </button>
             )}
          </div>
        </div>
      )}

      {gameState.status === GameStatus.FINISHED && (
        <div className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 text-center shadow-2xl">
           <h2 className="text-4xl font-black mb-6 uppercase italic">The End</h2>
           <div className="space-y-4 mb-8">
              {gameState.players.sort((a,b) => b.score - a.score).map((p, idx) => (
                <div key={p.id} className="flex justify-between items-center bg-zinc-800 p-4 rounded-xl">
                   <div className="flex items-center gap-3">
                      <span className="text-yellow-400 font-black text-xl">#{idx+1}</span>
                      <span className="text-white font-bold uppercase">{p.name}</span>
                   </div>
                   <span className="text-white font-black">{p.score} pts</span>
                </div>
              ))}
           </div>
           <button onClick={() => window.location.reload()} className="w-full bg-white text-black py-4 rounded-xl font-black uppercase tracking-widest">
              Volver al inicio
           </button>
        </div>
      )}
    </Layout>
  );
};

export default App;
