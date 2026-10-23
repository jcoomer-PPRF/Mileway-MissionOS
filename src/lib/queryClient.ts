import { QueryClient } from '@tanstack/react-query';

export function createPrivateQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
        throwOnError: true,
      },
    },
  });
}

export function discardPrivateQueries(client: QueryClient) {
  // Every identity gets a different client. Late responses can only reach the
  // discarded client, never the next user's cache.
  void client.cancelQueries();
  client.clear();
}
