// src/services/aiService.ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../lib/firebase'; // Import app and auth

export const aiService = {
  askAssistant: async (tenantId: string, message: string): Promise<string> => {
    try {
      // 1. Prevent the call if the token isn't ready
      if (!auth.currentUser) {
        throw new Error("Firebase Auth user is not loaded yet.");
      }

      // 2. Use the directly exported app instance
      const functions = getFunctions(app); 
      
      // Note: If your Firebase backend is hosted outside the default us-central1 
      // (e.g., asia-south1), you must specify it here to avoid CORS/401 errors:
      // const functions = getFunctions(app, 'asia-south1');
      
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