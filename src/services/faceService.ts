// src/services/faceService.ts
import Human from '@vladmandic/human';
import { Worker } from '../types/index';

// Initialize configuration
const humanConfig = {
  // Use the CDN to auto-load models (no local files needed)
  modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
  face: {
    enabled: true,
    detector: { rotation: false }, // faster processing
    mesh: { enabled: false },      // we don't need 3D mesh
    iris: { enabled: false },      // we don't need iris
    description: { enabled: true }, // <--- THIS IS CRITICAL (Face Recognition)
    emotion: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
};

// Singleton instance
const human = new Human(humanConfig);

export const faceService = {
  isLoaded: false,

  loadModels: async () => {
    if (faceService.isLoaded) return;
    try {
      await human.load(); // Preload models from CDN
      await human.warmup(); // Wake up the AI engine
      faceService.isLoaded = true;
      console.log("Human AI Models Loaded via CDN");
    } catch (err) {
      console.error("Failed to load Human AI", err);
    }
  },

  /**
   * Scans an image/video and returns the face descriptor (embedding)
   */
  getFaceDescriptor: async (input: HTMLVideoElement | HTMLImageElement): Promise<number[] | null> => {
    if (!faceService.isLoaded) await faceService.loadModels();

    // Detect face
    const result = await human.detect(input);
    
    // Check if we found a face with a descriptor
    if (result && result.face && result.face.length > 0) {
      // Return the embedding of the largest/main face
      return result.face[0].embedding; 
    }
    
    return null;
  },

  /**
   * Matches a face from the camera against a list of known workers
   */
  findMatch: async (input: HTMLVideoElement, workers: Worker[]): Promise<{ worker: Worker; distance: number } | null> => {
    if (!faceService.isLoaded) await faceService.loadModels();
    
    // 1. Scan current frame
    const result = await human.detect(input);
    if (!result || !result.face || result.face.length === 0) return null;

    const currentEmbedding = result.face[0].embedding;

    // 2. Compare against DB
    let bestMatch: Worker | null = null;
    let bestScore = 0; // Similarity score (Higher is better in Human API)

    workers.forEach(worker => {
      if (worker.faceDescriptor && worker.faceDescriptor.length > 0) {
        // Human library has a built-in similarity function
        // similarity returns 0 to 1 (1 = exact match)
        const score = human.match.similarity(currentEmbedding, worker.faceDescriptor);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = worker;
        }
      }
    });

    // 3. Threshold Check
    // With Human library, > 0.6 is usually a good match. > 0.8 is very strong.
    // We invert it to "distance" concept for compatibility (1 - score) if needed, 
    // or just return score directly.
    if (bestMatch && bestScore > 0.65) {
      return { worker: bestMatch, distance: bestScore }; // Returning score as "distance" context
    }
    
    return null;
  }
};