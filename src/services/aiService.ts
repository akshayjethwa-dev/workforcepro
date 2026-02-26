// src/services/aiService.ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../lib/firebase';

export const aiService = {
  askAssistant: async (tenantId: string, message: string): Promise<string> => {
    try {
      // 1. Prevent the call if the token isn't ready
      if (!auth.currentUser) {
        throw new Error("Firebase Auth user is not loaded yet.");
      }

      /**
       * 2. UPDATED: Specify the 'asia-south1' region.
       * This must exactly match the region defined in your index.js file
       * to avoid "404 Not Found" or "CORS" errors.
       */
      const functions = getFunctions(app, 'asia-south1'); 
      
      const askFactoryAI = httpsCallable(functions, 'askFactoryAI');
      
      const result = await askFactoryAI({ tenantId, message });
      const data = result.data as { reply: string };
      
      return data.reply;
    } catch (error) {
      console.error("Cloud Function Error:", error);
      throw error;
    }
  }
};