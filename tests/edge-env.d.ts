declare module 'npm:@supabase/supabase-js@*' {
  export { createClient } from '@supabase/supabase-js';
}
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};
