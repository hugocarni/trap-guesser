
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen urban-gradient flex flex-col items-center justify-start p-3 md:p-8">
      <header className="w-full max-w-4xl flex justify-between items-center mb-6 md:mb-12">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="bg-yellow-400 p-1.5 md:p-2 rounded-lg transform -rotate-3 shadow-glow">
             <span className="text-black font-black text-lg md:text-2xl font-bungee">TRAP</span>
          </div>
          <span className="text-white font-black text-lg md:text-2xl font-bungee tracking-tighter">GUESSR</span>
        </div>
        <div className="flex gap-4">
          <div className="hidden sm:block bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-700 text-[10px] md:text-sm font-bold text-yellow-400 uppercase tracking-widest">
            EL GÉNERO #1
          </div>
        </div>
      </header>
      <main className="w-full max-w-2xl">
        {children}
      </main>
      <footer className="mt-8 pt-6 pb-4 text-zinc-600 text-[10px] text-center uppercase tracking-widest opacity-50">
        &copy; 2026 Trap Guessr • by @hugocarni
      </footer>
    </div>
  );
};
