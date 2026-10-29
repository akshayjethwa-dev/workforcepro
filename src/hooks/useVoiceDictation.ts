// src/hooks/useVoiceDictation.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

interface VoiceDictationOptions {
  onResult?: (text: string) => void;
  lang?: string;
}

export const useVoiceDictation = (options?: VoiceDictationOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = options?.lang || 'en-IN'; // Default to Indian English / bilingual

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
          triggerFrontlineHaptic('light');
        };

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          options?.onResult?.(currentTranscript);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition event error:', event.error);
          setIsListening(false);
          triggerFrontlineHaptic('alert');
          
          if (event.error === 'no-speech') {
            setError('No speech detected. Please speak clearly or select an option chip.');
          } else if (event.error === 'audio-capture') {
            setError('Microphone unavailable. Use predefined chips or keypad.');
          } else if (event.error === 'not-allowed') {
            setError('Microphone permission blocked. Select a predefined option below.');
          } else {
            setError('Noisy environment or speech error. Use option chips below.');
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Failed to initialize SpeechRecognition:', err);
        setIsSupported(false);
      }
    } else {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [options?.lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Voice input is not supported in this browser. Please use option chips.');
      return;
    }
    setError(null);
    setTranscript('');
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.warn('SpeechRecognition start error:', e);
      try {
        recognitionRef.current.abort();
        setTimeout(() => recognitionRef.current?.start(), 100);
      } catch {}
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
};
