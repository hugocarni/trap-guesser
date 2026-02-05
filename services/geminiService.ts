
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiClue } from "../types";

// Always use named parameter and process.env.API_KEY directly
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGeminiClue = async (songTitle: string, artist: string): Promise<GeminiClue> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a short clue and some "urban/street" trash talk for a player trying to guess the song "${songTitle}" by "${artist}". The tone should be like a Reggaeton DJ or a trap fan from PR or Colombia. Use slang like 'duro', 'beldad', 'fuego', 'la calle', 'la movie'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clue: {
              type: Type.STRING,
              description: "A cryptic clue about the song's meaning or popularity.",
            },
            trashTalk: {
              type: Type.STRING,
              description: "Short funny urban commentary encouraging or mocking the player's skills.",
            },
          },
          required: ["clue", "trashTalk"],
        },
      },
    });

    // response.text is a property, not a method
    return JSON.parse(response.text.trim()) as GeminiClue;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      clue: "Esta canción rompió todas las discotecas el año que salió.",
      trashTalk: "¡Dale, que la calle te está mirando!",
    };
  }
};
