import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface KeyboardInfo {
  keyboardHeight: number;
}

export enum KeyboardStyle {
  Dark = 'DARK',
  Light = 'LIGHT',
  Default = 'DEFAULT',
}

export interface KeyboardStyleOptions {
  style: KeyboardStyle;
}

export enum KeyboardResize {
  Body = 'body',
  Ionic = 'ionic',
  Native = 'native',
  None = 'none',
}

export interface KeyboardResizeOptions {
  mode: KeyboardResize;
}

export interface KeyboardPlugin {
  show(): Promise<void>;
  hide(): Promise<void>;
  setAccessoryBarVisible(options: { isVisible: boolean }): Promise<void>;
  setScroll(options: { isDisabled: boolean }): Promise<void>;
  setStyle(options: KeyboardStyleOptions): Promise<void>;
  setResizeMode(options: KeyboardResizeOptions): Promise<void>;
  getResizeMode(): Promise<KeyboardResizeOptions>;
  addListener(
    eventName: 'keyboardWillShow',
    listenerFunc: (info: KeyboardInfo) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'keyboardDidShow',
    listenerFunc: (info: KeyboardInfo) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'keyboardWillHide',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'keyboardDidHide',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/**
 * Typed bridge to the native @capacitor/keyboard plugin registered via @capacitor/core.
 * Matches @capacitor/keyboard's official plugin registration while remaining resilient
 * across IDE TypeScript servers before/after native plugin sync.
 */
export const Keyboard = registerPlugin<KeyboardPlugin>('Keyboard');
