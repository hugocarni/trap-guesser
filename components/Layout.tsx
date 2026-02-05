
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen urban-gradient flex flex-col items-center justify-start p-4 md:p-8">
      <header className="w-full max-w-4xl flex justify-between items-center mb-6 md:mb-12">
        <div 
          onClick={() => window.location.reload()} 
          className="flex items-center gap-2 md:gap-3 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="bg-yellow-400 p-1.5 md:p-2 rounded-lg transform -rotate-3 shadow-glow">
             <span className="text-black font-black text-sm md:text-2xl font-bungee uppercase">TRAP</span>
          </div>
          <span className="text-white font-black text-sm md:text-2xl font-bungee tracking-tighter uppercase">GUESSR</span>
        </div>
        
        <div className="flex gap-3 md:gap-4 items-center">
          <a 
            href="https://twitter.com/hugocarni" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white hover:text-yellow-400 transition-colors p-1"
            aria-label="Twitter @hugocarni"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
            </svg>
          </a>
          <a 
            href="https://instagram.com/hugocarni" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white hover:text-yellow-400 transition-colors p-1"
            aria-label="Instagram @hugocarni"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.266.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.848 0-3.204.013-3.583.07-4.849.149-3.225 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"></path>
            </svg>
          </a>
        </div>
      </header>
      <main className="w-full max-w-2xl flex-grow">
        {children}
      </main>
      <footer className="mt-8 pt-6 pb-4 text-white text-[8px] md:text-[10px] text-center uppercase tracking-widest opacity-80">
        &copy; 2026 Trap Guessr • by @hugocarni
      </footer>
    </div>
  );
};
