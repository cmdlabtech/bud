// Worker entry. Only the default export lives here (workerd treats named exports of the
// entry module as entrypoints); the logic and its notes are in forward.ts.
import { handle, type Env } from './forward';
export default { fetch: (req: Request, env: Env) => handle(req, env) } satisfies ExportedHandler<Env>;
