const handlers = new Map();
export function registerEventHandler(topic, handler) {
    handlers.set(topic, handler);
}
export async function dispatch(event) {
    const handler = handlers.get(event.topic);
    if (!handler) {
        console.log(`No handler registered for topic "${event.topic}", skipping.`);
        return;
    }
    await handler(event);
}
export function clearHandlers() {
    handlers.clear();
}
