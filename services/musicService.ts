
import { Song } from "../types";

export const fetchTopTrapReggaeton = async (): Promise<Song[]> => {
  // Expanded list including user requested artists and more legends
  const terms = [
    'bad bunny', 
    'anuel aa', 
    'daddy yankee', 
    'karol g', 
    'feid', 
    'myke towers', 
    'rauw alejandro', 
    'j balvin', 
    'eladio carrion', 
    'mora',
    'ozuna',
    'jhayco',
    'arcangel',
    'don omar',
    'chencho corleone',
    'bryant myers'
  ];
  const songs: Song[] = [];

  try {
    // Increase the number of artists searched to broaden the pool
    const promises = terms.map(term => 
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=15&genreId=1116`)
        .then(res => res.json())
        .catch(() => ({ results: [] })) // Graceful failure for individual requests
    );

    const results = await Promise.all(promises);
    
    results.forEach(data => {
      if (data.results) {
        data.results.forEach((item: any) => {
          // Validation: must have preview, not be a duplicate ID, and look like a real song
          if (item.previewUrl && !songs.find(s => s.id === item.trackId.toString())) {
            songs.push({
              id: item.trackId.toString(),
              title: item.trackName,
              artist: item.artistName,
              previewUrl: item.previewUrl,
              artworkUrl: item.artworkUrl100.replace('100x100', '600x600'),
              genre: item.primaryGenreName
            });
          }
        });
      }
    });

    // Shuffle once at the end
    return songs.sort(() => Math.random() - 0.5);
  } catch (error) {
    console.error("Music fetch error:", error);
    return [];
  }
};
