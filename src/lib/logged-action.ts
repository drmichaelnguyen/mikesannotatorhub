import { readSession } from "@/lib/session";
import { runLoggedAction } from "@/lib/action-log";

export async function withActionLog<T>(action: string, input: unknown, work: () => Promise<T>): Promise<T> {
  const session = await readSession();
  return runLoggedAction(action, session?.userId ?? null, input, work);
}
