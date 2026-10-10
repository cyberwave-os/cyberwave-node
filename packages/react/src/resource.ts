import { useEffect, useState } from "react";

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
