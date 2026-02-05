
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);

  useEffect(() => {
    const init = async () => {
      const data = await fetchTopTrapReggaeton();
      setSongs(data);
      setLoading(false);
    };
    init();
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
    if (!audioRef.current || !songToPlay) return;
    
    stopAudio();
    audioRef.current.src = songToPlay.previewUrl;
    audioRef.current.volume = volume;
    
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          // Precise start time for calculating individual response speed
          setStartTime(Date.now());
          
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            audioRef.current?.pause();
            setIsPlaying(false);
          }, duration * 1000);
        })
        .catch(e => console.error("Playback error:", e));
    }
  }, [volume, stopAudio]);

  const handlePeerData = useCallback((data: any) => {
    if (data.type === 'GAME_STATE_UPDATE') {
      setGameState(prev => ({ ...prev, ...data.payload }));
    } else if (data.type === 'START_ROUND') {
      setGameState(prev => ({ 
        ...prev, 
        ...data.payload, 
        status: GameStatus.PLAYING 
      }));
    } else if (data.type === 'PLAY_AUDIO') {
      // Clients receive song and duration from host to sync playback
      setTimeout(() => playSnippet(data.song, data.duration), 50);
    } else if (data.type === 'REVEAL') {
      setGameState(prev => ({ ...prev, status: GameStatus.REVEALING, players: data.players }));
      stopAudio();
    } else if (data.type === 'PLAYER_JOINED') {
      const newPlayer: Player = data.player;
      setGameState(prev => {
        const updatedPlayers = [...prev.players.filter(p => p.id !== newPlayer.id), newPlayer];
        broadcast({ type: 'GAME_STATE_UPDATE', payload: { players: updatedPlayers } });
        return { ...prev, players: updatedPlayers };
      });
    } else if (data.type === 'GUESS_SUBMITTED') {
      setGameState(prev => {
        const updatedPlayers = prev.players.map(p => 
          p.id === data.playerId ? { ...p, hasAnswered: true, lastGuessCorrect: data.isCorrect, score: p.score + data.points } : p
        );
        
        const allAnswered = updatedPlayers.every(p => p.hasAnswered);
        if (allAnswered) {
          setTimeout(() => {
             broadcast({ type: 'REVEAL', players: updatedPlayers });
             setGameState(s => ({ ...s, status: GameStatus.REVEALING, players: updatedPlayers }));
             stopAudio();
          }, 800);
        } else {
          broadcast({ type: 'GAME_STATE_UPDATE', payload: { players: updatedPlayers } });
        }
        return { ...prev, players: updatedPlayers };
      });
    }
  }, [playSnippet, stopAudio]);

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
        setGameState(prev => ({ ...prev, status: GameStatus.LOBBY, isMultiplayer: true, roomCode: roomInput.toUpperCase() }));
      });
      conn.on('data', handlePeerData);
    });

    peer.on('error', () => alert("No se encontró la sala."));
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
        players: prev.players.map(p => ({ ...p, hasAnswered: false })),
        isChallengeMode: isChallenge
      };

      if (prev.isMultiplayer) {
        broadcast({ type: 'START_ROUND', payload: nextRoundData });
        setTimeout(() => {
          broadcast({ type: 'PLAY_AUDIO', song: currentSong, duration: nextDifficulty });
          playSnippet(currentSong, nextDifficulty); // Host plays locally
        }, 800);
      } else {
        setTimeout(() => playSnippet(currentSong, nextDifficulty), 100);
      }

      return { ...prev, ...nextRoundData };
    });
  }, [songs, stopAudio, playSnippet]);

  const handleGuess = (songId: string) => {
    if (gameState.status !== GameStatus.PLAYING) return;
    const now = Date.now();
    const isCorrect = songId === gameState.currentSong?.id;
    
    let points = 0;
    if (isCorrect && startTime) {
      const timeElapsed = (now - startTime) / 1000;
      const timeLeft = Math.max(0, gameState.difficultySeconds - timeElapsed);
      // Individual bonus based on local response speed
      const speedMultiplier = (timeLeft / gameState.difficultySeconds);
      const basePoints = 50;
      const timeBonus = Math.round(speedMultiplier * 50);
      points = basePoints + timeBonus;
      
      if (gameState.isChallengeMode) {
        const challengeMultiplier = 1 + (gameState.currentRound - 1) * 0.1;
        points = Math.round(points * challengeMultiplier);
      }
    }

    if (gameState.isMultiplayer) {
      const myId = peerRef.current.id;
      broadcast({ type: 'GUESS_SUBMITTED', playerId: myId, isCorrect, points });
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === myId ? { ...p, hasAnswered: true, lastGuessCorrect: isCorrect, score: p.score + points } : p),
        history: [...prev.history, { song: prev.currentSong!, isCorrect }]
      }));
    } else {
      setGameState(prev => ({
        ...prev,
        status: GameStatus.REVEALING,
        score: prev.score + points,
        players: prev.players.map(p => ({ ...p, score: p.score + points })),
        history: [...prev.history, { song: prev.currentSong!, isCorrect }]
      }));
      stopAudio();
    }
  };

  const startPractice = () => {
    if (!gameState.playerName) return;
    const soloPlayer: Player = { id: 'local-player', name: gameState.playerName, score: 0, isHost: true };
    setGameState(prev => ({ ...prev, status: GameStatus.START, isMultiplayer: false, players: [soloPlayer] }));
  };

  const handleReset = () => {
    window.location.href = window.location.href; // Strong reload
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4 shadow-glow"></div>
          <p className="text-yellow-400 font-black animate-pulse uppercase tracking-widest text-sm">Entrando al bloque...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <audio ref={audioRef} />

      {gameState.status === GameStatus.SETUP && (
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 text-center shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-yellow-400/5 rounded-full blur-3xl"></div>
          <h1 className="text-4xl md:text-6xl font-black mb-6 neon-text tracking-tighter uppercase italic">Trap Guessr Online</h1>
          <div className="space-y-4 max-w-sm mx-auto relative z-10">
            <input 
              type="text" 
              placeholder="TU APODO" 
              value={gameState.playerName}
              maxLength={12}
              onChange={(e) => setGameState(p => ({ ...p, playerName: e.target.value }))}
              className="w-full bg-zinc-950 border-2 border-zinc-800 p-4 rounded-xl text-white font-black focus:border-yellow-400 outline-none transition-all uppercase tracking-widest text-center"
            />
            
            <div className="grid grid-cols-1 gap-3 pt-4">
              <button 
                onClick={startPractice}
                className="bg-yellow-400 text-black py-4 rounded-xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-glow transform active:scale-95"
              >
                Solo (Práctica)
              </button>
              
              <div className="relative flex py-5 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="flex-shrink mx-4 text-zinc-600 font-bold text-[10px] uppercase tracking-[0.2em]">Competitivo</span>
                  <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <button 
                onClick={createRoom}
                className="bg-zinc-100 text-black py-4 rounded-xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all transform active:scale-95"
              >
                Crear Sala
              </button>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="CÓDIGO" 
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-zinc-950 border-2 border-zinc-800 p-4 rounded-xl text-white font-black focus:border-yellow-400 outline-none uppercase text-center"
                />
                <button 
                  onClick={joinRoom}
                  className="bg-zinc-800 border-2 border-zinc-700 text-white px-6 rounded-xl font-black uppercase tracking-widest hover:bg-zinc-700 transition-all transform active:scale-95"
                >
                  Entrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState.status === GameStatus.LOBBY && (
        <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 text-center shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="mb-6">
             <p className="text-zinc-500 font-black uppercase text-[10px] tracking-widest mb-2">Código de la Sala</p>
             <h2 className="text-6xl font-black text-yellow-400 tracking-tighter neon-text">{gameState.roomCode}</h2>
          </div>
          
          <div className="bg-black/30 rounded-2xl p-6 mb-8 text-left space-y-3 max-h-64 overflow-y-auto border border-zinc-800/50">
            <p className="text-zinc-600 font-black text-[10px] uppercase tracking-widest border-b border-zinc-800 pb-2">Jugadores ({gameState.players.length})</p>
            {gameState.players.map(p => (
              <div key={p.id} className="flex justify-between items-center group">
                <span className="font-black text-white uppercase tracking-tight text-sm flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${p.isHost ? 'bg-yellow-400' : 'bg-green-500'} animate-pulse`}></div>
                  {p.name} {p.isHost && '👑'}
                </span>
                <span className="text-zinc-500 text-[10px] uppercase font-black">Ready</span>
              </div>
            ))}
          </div>

          {(gameState.players.some(p => p.isHost && (p.id === peerRef.current?.id || p.id === 'local-player'))) ? (
            <button 
              onClick={() => setGameState(p => ({ ...p, status: GameStatus.START }))}
              className="w-full bg-yellow-400 text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-glow transform active:scale-95"
            >
              Configurar Partida
            </button>
          ) : (
            <div className="py-4 px-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
               <p className="text-zinc-400 font-black animate-pulse uppercase tracking-[0.2em] text-xs">Esperando al host...</p>
            </div>
          )}
        </div>
      )}

      {gameState.status === GameStatus.START && (
        <div className="bg-zinc-900 p-6 md:p-10 rounded-3xl border border-zinc-800 text-center shadow-2xl relative overflow-hidden animate-in fade-in duration-500">
          <h1 className="text-4xl md:text-5xl font-black mb-8 neon-text tracking-tighter uppercase italic">Ajustes</h1>
          <div className="space-y-8">
            <div>
              <label className="block text-zinc-500 text-[10px] font-black mb-4 uppercase tracking-widest">Segundos de audio</label>
              <div className="flex justify-center gap-2 md:gap-4">
                {[1, 3, 5, 10].map(s => (
                  <button
                    key={s}
                    onClick={() => setGameState(prev => ({ ...prev, difficultySeconds: s }))}
                    className={`w-14 h-14 md:w-20 md:h-20 rounded-2xl font-black text-xl md:text-2xl transition-all border-2 ${
                      gameState.difficultySeconds === s ? 'bg-yellow-400 text-black border-yellow-400 scale-110 shadow-glow' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-zinc-500 text-[10px] font-black mb-4 uppercase tracking-widest">Rondas</label>
              <div className="flex justify-center gap-2 md:gap-4">
                {[5, 10, 20, 50].map(r => (
                  <button
                    key={r}
                    onClick={() => setGameState(prev => ({ ...prev, totalRounds: r }))}
                    className={`w-14 h-14 md:w-20 md:h-20 rounded-2xl font-black text-xl md:text-2xl transition-all border-2 ${
                      gameState.totalRounds === r ? 'bg-yellow-400 text-black border-yellow-400 scale-110 shadow-glow' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-12">
            <button onClick={() => startNewRound(false)} className="bg-zinc-100 text-black py-5 rounded-2xl font-black text-lg uppercase tracking-widest hover:bg-yellow-400 transition-all">Modo Normal</button>
            <button onClick={() => startNewRound(true)} className="bg-orange-600 text-white py-5 rounded-2xl font-black text-lg uppercase tracking-widest border-b-4 border-orange-800">Modo Desafío 🔥</button>
          </div>
        </div>
      )}

      {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.REVEALING) && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="flex justify-between items-center bg-zinc-900/80 p-5 rounded-3xl border border-zinc-800 backdrop-blur-md shadow-xl">
            <div className="space-y-1">
              <div className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">Ronda {gameState.currentRound} de {gameState.totalRounds}</div>
              <div className="text-white font-black text-xl flex items-center gap-2">
                <span className="text-yellow-400 text-sm font-bungee">SCORE</span>
                {gameState.isMultiplayer 
                  ? (gameState.players.find(p => p.id === (peerRef.current?.id))?.score || 0)
                  : (gameState.players[0]?.score || 0)}
              </div>
            </div>
            {gameState.isMultiplayer && (
               <div className="text-right">
                  <div className="text-zinc-500 font-black uppercase text-[10px] tracking-widest mb-2">SALA: {gameState.roomCode}</div>
                  <div className="flex -space-x-2 justify-end">
                    {gameState.players.map(p => (
                      <div 
                        key={p.id} 
                        className={`w-9 h-9 rounded-full border-2 border-zinc-900 flex items-center justify-center text-xs font-black uppercase ${p.hasAnswered ? 'bg-green-500 shadow-glow' : 'bg-zinc-800 text-zinc-500'}`}
                      >
                        {p.name.charAt(0)}
                      </div>
                    ))}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-[2.5rem] p-6 md:p-8 border border-zinc-800 shadow-2xl text-center relative overflow-hidden">
             <div className="relative w-44 h-44 md:w-56 md:h-56 mx-auto mb-8">
                {gameState.status === GameStatus.REVEALING ? (
                  <img src={gameState.currentSong?.artworkUrl} className="w-full h-full object-cover rounded-[2rem] ring-4 ring-yellow-400/20 shadow-2xl animate-in zoom-in duration-500" alt="Artwork" />
                ) : (
                  <div className={`w-full h-full bg-zinc-950 rounded-[2rem] flex items-center justify-center border-2 border-zinc-800 relative overflow-hidden`}>
                     <div className={`w-28 h-28 md:w-36 md:h-36 rounded-full border-[10px] border-zinc-900 bg-zinc-800 flex items-center justify-center ${isPlaying ? 'animate-spin-slow' : ''}`}>
                        <div className={`w-10 h-10 md:w-14 md:h-14 rounded-full bg-yellow-400 shadow-glow ${isPlaying ? 'scale-110' : 'scale-100'} transition-transform`}></div>
                     </div>
                  </div>
                )}
             </div>

             {gameState.status === GameStatus.REVEALING ? (
                <div className="mb-8 animate-in slide-in-from-top-4">
                   <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-1">{gameState.currentSong?.title}</h2>
                   <p className="text-yellow-400 font-black uppercase tracking-[0.3em] text-sm">{gameState.currentSong?.artist}</p>
                </div>
             ) : (
                <div className="mb-8 px-4 md:px-12">
                   <div className="h-3 bg-zinc-950 w-full rounded-full overflow-hidden mb-3 border border-zinc-800">
                      <div className={`h-full bg-yellow-400 transition-all ease-linear shadow-glow ${isPlaying ? 'w-full' : 'w-0'}`} style={{transitionDuration: isPlaying ? `${gameState.difficultySeconds * 1000}ms` : '200ms'}}></div>
                   </div>
                   <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.4em]">{isPlaying ? '¡ESCUCHA!' : 'TIEMPO FUERA'}</p>
                </div>
             )}

             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {gameState.options.map(opt => {
                  const myPlayer = gameState.isMultiplayer 
                    ? gameState.players.find(p => p.id === (peerRef.current?.id))
                    : gameState.players[0];
                  const alreadyAnswered = myPlayer?.hasAnswered;
                  
                  return (
                    <button
                      key={opt.id}
                      disabled={gameState.status === GameStatus.REVEALING || alreadyAnswered}
                      onClick={() => handleGuess(opt.id)}
                      className={`p-5 rounded-2xl font-black text-sm uppercase border-2 text-left transition-all transform active:scale-95 ${
                        gameState.status === GameStatus.REVEALING
                          ? opt.id === gameState.currentSong?.id 
                            ? 'bg-green-500/20 border-green-500 text-green-500 scale-105 z-10' 
                            : 'bg-zinc-950 border-transparent text-zinc-700'
                          : alreadyAnswered
                            ? 'bg-zinc-950 border-zinc-900 text-zinc-700 cursor-not-allowed'
                            : 'bg-zinc-800 border-zinc-700 text-white hover:border-yellow-400 hover:bg-zinc-700 shadow-md'
                      }`}
                    >
                      <div className="truncate mb-0.5">{opt.title}</div>
                      <div className="text-[9px] font-bold opacity-40 uppercase tracking-widest">{opt.artist}</div>
                    </button>
                  );
                })}
             </div>

             {gameState.status === GameStatus.REVEALING && (gameState.isMultiplayer ? (gameState.players.find(p => p.isHost && (p.id === peerRef.current?.id || p.id === 'local-player'))) : true) && (
               <button 
                 onClick={() => startNewRound(gameState.isChallengeMode)} 
                 className="mt-10 w-full bg-white text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-2xl flex items-center justify-center gap-2 group"
               >
                 Siguiente Palo
                 <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"/></svg>
               </button>
             )}
          </div>
        </div>
      )}

      {gameState.status === GameStatus.FINISHED && (
        <div className="bg-zinc-900 rounded-[3rem] p-8 md:p-12 border border-zinc-800 text-center shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-2 bg-yellow-400 shadow-glow"></div>
           <h2 className="text-5xl md:text-7xl font-black mb-8 uppercase italic tracking-tighter neon-text font-bungee">RESULTADOS</h2>
           <div className="space-y-3 mb-12">
              {[...gameState.players].sort((a,b) => b.score - a.score).map((p, idx) => (
                <div key={p.id} className={`flex justify-between items-center p-6 rounded-3xl transition-all ${idx === 0 ? 'bg-yellow-400 text-black shadow-glow scale-105' : 'bg-zinc-800 text-white'}`}>
                   <div className="flex items-center gap-5">
                      <span className="font-black text-3xl">#{idx+1}</span>
                      <div className="text-left">
                         <div className="font-black uppercase text-xl leading-none">{p.name}</div>
                         <div className={`text-[10px] font-bold uppercase tracking-widest opacity-60`}>{idx === 0 ? 'EL REY' : 'BLOCK'}</div>
                      </div>
                   </div>
                   <div className="text-right">
                      <span className="font-black text-2xl">{p.score}</span>
                      <span className="block text-[10px] font-black uppercase tracking-tighter opacity-60">PTS</span>
                   </div>
                </div>
              ))}
           </div>
           
           <div className="h-40 w-full mb-8 bg-black/40 rounded-3xl p-4 border border-zinc-800">
             <p className="text-zinc-600 font-black text-[10px] uppercase tracking-widest text-left mb-4">Métricas de sesión</p>
             <ResponsiveContainer width="100%" height="70%">
               <BarChart data={gameState.history.map((h, i) => ({ id: i, val: h.isCorrect ? 1 : 0.2 }))}>
                 <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                   {gameState.history.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.isCorrect ? '#facc15' : '#3f3f46'} />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>

           <button onClick={handleReset} className="w-full bg-white text-black py-6 rounded-3xl font-black uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-2xl transform active:scale-95 text-xl relative z-20 cursor-pointer">
              Volver al Inicio
           </button>
        </div>
      )}
    </Layout>
  );
};

export default App;
