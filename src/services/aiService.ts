// src/services/aiService.ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase'; 

export const aiService = {
  askAssistant: async (tenantId: string, message: string): Promise<string> => {
    try {
      // FIX: Explicitly pass 'db.app' here. 
      // This tells the function to attach the current user's Auth Token!
      const functions = getFunctions(db.app); 
      
      // Call the cloud function named 'askFactoryAI'
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