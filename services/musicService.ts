
import { Song } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchTopTrapReggaeton = async (): Promise<Song[]> => {
  // Broad search terms to get many songs in fewer requests
  const searchQueries = [
    'Reggaeton 2025',
    'Trap Latino 2025',
    'Urban Latino'
  ];
  
  const songs: Song[] = [];
  const seenIds = new Set<string>();

  try {
    for (const query of searchQueries) {
      try {
        // Use a larger limit per request to get more variety in one go
        // Removed country=es to see if it improves stability, using default
        const response = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=100`
        );
        
        if (!response.ok) {
          console.error(`iTunes API error for query "${query}": ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data && data.results) {
          data.results.forEach((item: any) => {
            const trackId = item.trackId?.toString();
            // Filter to ensure we only get relevant genres if possible
            const genre = item.primaryGenreName?.toLowerCase() || '';
            const isRelevant = genre.includes('latin') || genre.includes('urban') || genre.includes('reggaeton') || genre.includes('trap') || genre.includes('pop');

            if (item.previewUrl && trackId && !seenIds.has(trackId) && isRelevant) {
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
        
        // Wait a bit longer between broad requests
        await delay(500); 
      } catch (err) {
        console.error(`Error fetching songs for query: ${query}`, err);
        continue;
      }
    }

    // If still no songs, try a last-ditch effort with a very simple term
    if (songs.length === 0) {
      console.warn("No songs found, trying emergency fallback search...");
      const fallbackResponse = await fetch(`https://itunes.apple.com/search?term=latin&entity=song&limit=50`);
      const fallbackData = await fallbackResponse.json();
      if (fallbackData && fallbackData.results) {
        fallbackData.results.forEach((item: any) => {
          if (item.previewUrl && item.trackId) {
            songs.push({
              id: item.trackId.toString(),
              title: item.trackName,
              artist: item.artistName,
              previewUrl: item.previewUrl,
              artworkUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '600x600') : '',
              genre: item.primaryGenreName || 'Latin'
            });
          }
        });
      }
    }

    // Shuffle and return
    return songs.sort(() => Math.random() - 0.5);
  } catch (error) {
    console.error("Critical music fetch error:", error);
    return [];
  }
};
