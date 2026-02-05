
import { Song } from "../types";

export const fetchTopTrapReggaeton = async (): Promise<Song[]> => {
  // Expanded list with popular artists to ensure a large pool
  const terms = [
    'Bad Bunny', 
    'Anuel AA', 
    'Daddy Yankee', 
    'Karol G', 
    'Feid', 
    'Myke Towers', 
    'Rauw Alejandro', 
    'J Balvin', 
    'Eladio Carrion', 
    'Mora',
    'Ozuna',
    'Jhayco',
    'Arcangel',
    'Don Omar',
    'Bizarrap',
    'Quevedo',
    'Young Miko',
    'Tego Calderon',
    'Chencho Corleone'
  ];
  
  const songs: Song[] = [];

  try {
    // We remove genreId=1116 as it can be too restrictive in some regional iTunes stores.
    // Adding country=es (Spain) or similar usually yields better results for Reggaeton/Trap.
    const promises = terms.map(term => 
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=es`)
        .then(res => {
          if (!res.ok) throw new Error('Network response was not ok');
          return res.json();
        })
        .catch(err => {
          console.error(`Error fetching songs for artist: ${term}`, err);
          return { results: [] };
        })
    );

    const results = await Promise.all(promises);
    
    results.forEach(data => {
      if (data && data.results) {
        data.results.forEach((item: any) => {
          // Validation: must have preview, not be a duplicate ID, and have a valid previewUrl
          if (item.previewUrl && 
              item.trackId && 
              !songs.find(s => s.id === item.trackId.toString())) {
            songs.push({
              id: item.trackId.toString(),
              title: item.trackName,
              artist: item.artistName,
              previewUrl: item.previewUrl,
              artworkUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '600x600') : '',
              genre: item.primaryGenreName || 'Urban'
            });
          }
        });
      }
    });

    // Final check: filter out items that might have missing crucial data
    const validSongs = songs.filter(s => s.title && s.artist && s.previewUrl);

    if (validSongs.length === 0) {
      console.warn("No songs were found across all artists.");
    }

    // Shuffle and return
    return validSongs.sort(() => Math.random() - 0.5);
  } catch (error) {
    console.error("Music fetch error:", error);
    return [];
  }
};
