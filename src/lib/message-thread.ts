export function findMessageRoot<T extends Readonly<{ id: string; replyToId?: string }>>(
  messages: readonly T[],
  id: string,
): T | undefined {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const visited = new Set<string>();
  let message = byId.get(id);
  while (message?.replyToId && byId.has(message.replyToId)) {
    if (visited.has(message.id)) return undefined;
    visited.add(message.id);
    message = byId.get(message.replyToId);
  }
  return message;
}
