
import { Song } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchTopTrapReggaeton = async (): Promise<Song[]> => {
  // Balanced list of top artists to ensure a good pool without hammering the API too hard
  const terms = [
    'Bad Bunny', 
    'Anuel AA', 
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
    'Daddy Yankee',
    'Quevedo',
    'Bizarrap',
    'Young Miko'
  ];
  
  const songs: Song[] = [];
  const seenIds = new Set<string>();

  try {
    // We process sequentially to avoid "Failed to fetch" (usually rate limiting or CORS burst protection)
    for (const term of terms) {
      try {
        const response = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=es`
        );
        
        if (!response.ok) {
          console.error(`iTunes API error for ${term}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data && data.results) {
          data.results.forEach((item: any) => {
            const trackId = item.trackId?.toString();
            if (item.previewUrl && trackId && !seenIds.has(trackId)) {
              seenIds.add(trackId);
              songs.push({
                id: trackId,
                title: item.trackName,
                artist: item.artistName,
                previewUrl: item.previewUrl,
                artworkUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '600x600') : '',
                genre: item.primaryGenreName || 'Urban'
              });
            }
          });
        }
        
        // Small delay between requests to be gentle with the API
        await delay(150); 
      } catch (err) {
        console.error(`Error fetching songs for artist: ${term}`, err);
        // Continue to next artist instead of failing everything
        continue;
      }
    }

    if (songs.length === 0) {
      console.warn("No songs were found across all artists.");
    }

    // Shuffle and return
    return songs.sort(() => Math.random() - 0.5);
  } catch (error) {
    console.error("Critical music fetch error:", error);
    return [];
  }
};
