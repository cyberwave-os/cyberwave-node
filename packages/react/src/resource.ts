import { useEffect, useState } from "react";

/** Reset a resource subtree before committing a different client or record.
 * React keys also dispose its pending effects and local mutation state.
 */
export function useResourceKey(...scope: unknown[]): number {
  const [current, setCurrent] = useState({ scope, key: 0 });
  if (
    scope.length !== current.scope.length ||
    scope.some((value, index) => value !== current.scope[index])
  ) {
    const key = current.key + 1;
    setCurrent({ scope, key });
    return key;
  }
  return current.key;
}

export type Resource<T> = { data?: T; loading: boolean; error?: Error };
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const [state, setState] = useState<Resource<T> & { loader?: typeof load }>({
    loading: true,
  });
  useEffect(() => {
    const abort = new AbortController();
    setState({ loader: load, loading: true });
    load(abort.signal).then(
      (data) => {
        if (!abort.signal.aborted)
          setState({ loader: load, data, loading: false });
      },
      (error) => {
        if (!abort.signal.aborted)
          setState({
            loader: load,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );
    return () => abort.abort();
  }, [load]);
  return state.loader === load ? state : { loading: true };
}
