// src/components/AIAssistant.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Mic, Loader2, Bot } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { aiService } from '../services/aiService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export const AIAssistant: React.FC = () => {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', text: 'Namaste! I am your AI Factory Assistant. Ask me about today\'s attendance, payroll, or worker status.' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Hide the assistant for workers (only for Owners/Admins/Supervisors)
  if (!profile || profile.role === 'WORKER') return null;

  const handleSend = async () => {
    if (!input.trim() || !profile.tenantId) return;

    const userText = input.trim();
    const newMessage: Message = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Send to your secure Firebase Cloud Function
      const reply = await aiService.askAssistant(profile.tenantId, userText);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: reply }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: 'Sorry, I am having trouble connecting to the factory database right now. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-6 sm:bottom-8 sm:right-8 bg-linear-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-full shadow-2xl hover:scale-105 transition-transform z-40 flex items-center justify-center animate-bounce-slow"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Chat Bottom Sheet / Modal */}
      {isOpen && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-8 sm:right-8 sm:w-100 h-[75vh] sm:h-150 bg-white sm:rounded-3xl shadow-2xl flex flex-col z-50 animate-in slide-in-from-bottom-8 overflow-hidden border border-slate-200">
          
          {/* Header */}
          <div className="bg-linear-to-r from-indigo-600 to-purple-600 p-4 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center space-x-2">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">Factory AI</h3>
                <p className="text-[10px] text-indigo-100 font-medium">Powered by Gemini</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Chat Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-sm' 
                    : 'bg-white text-slate-800 border border-slate-100 shadow-sm rounded-bl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 shadow-sm p-3 rounded-2xl rounded-bl-sm flex space-x-2 items-center">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-100 shrink-0">
            <div className="flex items-center space-x-2 bg-slate-50 rounded-full border border-slate-200 p-1 pl-4 shadow-inner">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about attendance, payroll..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm outline-none"
              />
              <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                <Mic size={18} />
              </button>
              <button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Send size={16} className="ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};