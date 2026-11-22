// Ambient fallback declarations for react-router-dom so editors/IDEs resolve types cleanly
// even before local node_modules re-indexing. When node_modules/react-router-dom is present,
// TypeScript resolves the installed package definitions first.
declare module 'react-router-dom' {
  export interface Location<State = any> {
    pathname: string;
    search: string;
    hash: string;
    state: State;
    key: string;
  }

  export interface To {
    pathname?: string;
    search?: string;
    hash?: string;
  }

  export interface NavigateOptions {
    replace?: boolean;
    state?: any;
    preventScrollReset?: boolean;
    relative?: 'route' | 'path';
    flushSync?: boolean;
    viewTransition?: boolean;
  }

  export interface NavigateFunction {
    (to: string | To, options?: NavigateOptions): void | Promise<void>;
    (delta: number): void | Promise<void>;
  }

  export interface BrowserRouterProps {
    basename?: string;
    children?: import('react').ReactNode;
    future?: Record<string, unknown>;
    window?: Window;
  }

  export interface RoutesProps {
    children?: import('react').ReactNode;
    location?: Partial<Location> | string;
  }

  export interface RouteProps {
    path?: string;
    index?: boolean;
    element?: import('react').ReactNode | null;
    children?: import('react').ReactNode;
    caseSensitive?: boolean;
    id?: string;
  }

  export interface NavigateProps {
    to: string | To;
    replace?: boolean;
    state?: any;
    relative?: 'route' | 'path';
  }

  export interface LinkProps extends import('react').AnchorHTMLAttributes<HTMLAnchorElement> {
    to: string | To;
    replace?: boolean;
    state?: any;
    reloadDocument?: boolean;
    preventScrollReset?: boolean;
    relative?: 'route' | 'path';
  }

  export const BrowserRouter: import('react').FC<BrowserRouterProps>;
  export const Routes: import('react').FC<RoutesProps>;
  export const Route: import('react').FC<RouteProps>;
  export const Navigate: import('react').FC<NavigateProps>;
  export const Link: import('react').FC<LinkProps>;
  export const Outlet: import('react').FC<{ context?: unknown }>;

  export function useNavigate(): NavigateFunction;
  export function useLocation(): Location;
  export function useParams<K extends string = string>(): Readonly<Partial<Record<K, string>>>;
  export function useSearchParams(
    defaultInit?: URLSearchParams | Record<string, string | string[]> | string
  ): [URLSearchParams, (nextInit: URLSearchParams | Record<string, string | string[]> | string, navigateOpts?: NavigateOptions) => void];
}
