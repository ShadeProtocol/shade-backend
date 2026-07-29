import { DecodedEvent } from './types.js';

export type EventHandler = (event: DecodedEvent) => Promise<void> | void;

const handlers = new Map<string, EventHandler>();

export function registerEventHandler(topic: string, handler: EventHandler): void {
  handlers.set(topic, handler);
}

export async function dispatch(event: DecodedEvent): Promise<void> {
  const handler = handlers.get(event.topic);
  if (!handler) {
    console.log(`No handler registered for topic "${event.topic}", skipping.`);
    return;
  }
  await handler(event);
}

export function clearHandlers(): void {
  handlers.clear();
}
