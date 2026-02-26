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
    mesh: { enabled: true },       // MUST BE TRUE for blink detection
    iris: { enabled: true },       // MUST BE TRUE for eye tracking
    description: { enabled: true }, // <--- THIS IS CRITICAL (Face Recognition)
    emotion: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: true },      // NEW: Enable built-in gestures (blink)
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
   * Original Match function (kept for backward compatibility if needed elsewhere)
   */
  findMatch: async (input: HTMLVideoElement, workers: Worker[]): Promise<{ worker: Worker; distance: number } | null> => {
    if (!faceService.isLoaded) await faceService.loadModels();
    
    const result = await human.detect(input);
    if (!result || !result.face || result.face.length === 0) return null;

    const currentEmbedding = result.face[0].embedding;
    let bestMatch: Worker | null = null;
    let bestScore = 0; 

    workers.forEach(worker => {
      if (worker.faceDescriptor && worker.faceDescriptor.length > 0) {
        const score = human.match.similarity(currentEmbedding, worker.faceDescriptor);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = worker;
        }
      }
    });

    if (bestMatch && bestScore > 0.65) {
      return { worker: bestMatch, distance: bestScore };
    }
    
    return null;
  },

  /**
   * NEW: Matches face AND checks for liveness gestures (like blinking)
   */
  findMatchAndLiveness: async (input: HTMLVideoElement, workers: Worker[]): Promise<{ worker: Worker; distance: number; hasBlinked: boolean } | null> => {
    if (!faceService.isLoaded) await faceService.loadModels();
    
    // Scan current frame
    const result = await human.detect(input);
    if (!result || !result.face || result.face.length === 0) return null;

    const currentEmbedding = result.face[0].embedding;

    // FIX: Check if the AI detected any gesture containing "blink" (e.g., "blink left eye" or "blink right eye")
    let hasBlinked = false;
    if (result.gesture && result.gesture.length > 0) {
      hasBlinked = result.gesture.some(g => g.gesture.includes('blink'));
    }

    // Compare against DB
    let bestMatch: Worker | null = null;
    let bestScore = 0; 

    workers.forEach(worker => {
      if (worker.faceDescriptor && worker.faceDescriptor.length > 0) {
        const score = human.match.similarity(currentEmbedding, worker.faceDescriptor);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = worker;
        }
      }
    });

    if (bestMatch && bestScore > 0.65) {
      return { worker: bestMatch, distance: bestScore, hasBlinked };
    }
    
    return null;
  }
};