import { useEffect, useRef } from 'react';

// A global stack of active back handlers
const backHandlers: (() => boolean)[] = [];

let isInitialized = false;

const initGlobalBackListener = () => {
  if (typeof window === 'undefined' || isInitialized) return;
  
  // Push an initial dummy state so the browser has something to pop
  window.history.pushState({ pwaNavigation: true }, '');

  window.addEventListener('popstate', (e) => {
    let handled = false;
    
    // Execute handlers from the top of the stack (most recently mounted) downwards
    for (let i = backHandlers.length - 1; i >= 0; i--) {
      if (backHandlers[i]()) {
        handled = true;
        break;
      }
    }

    if (handled) {
      // If a component handled the back button (e.g., went back a step),
      // we must push a new state to "catch" the NEXT back button press.
      window.history.pushState({ pwaNavigation: true }, '');
    } else {
      // If nothing handled it (e.g., we are on the Dashboard), let the app close natively
      window.history.back();
    }
  });

  isInitialized = true;
};

/**
 * Custom hook to intercept the hardware back button on Android PWAs.
 * @param handler Function that returns `true` if it handled the back action, `false` to let the parent handle it.
 */
export const useBackButton = (handler: () => boolean) => {
  const savedHandler = useRef(handler);

  // Keep the ref fresh without re-registering the effect
  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    initGlobalBackListener();
    
    // Wrapper that calls the freshest handler
    const stackItem = () => savedHandler.current();
    
    // Add to top of stack when component mounts
    backHandlers.push(stackItem);
    
    return () => {
      // Remove from stack when component unmounts
      const index = backHandlers.indexOf(stackItem);
      if (index > -1) {
        backHandlers.splice(index, 1);
      }
    };
  }, []); 
};