/**
 * Cross-tab notifier via the browser BroadcastChannel API. This is thin
 * platform glue (no game logic); it degrades to a no-op where BroadcastChannel
 * is unavailable. Excluded from the logic-coverage gate — exercised in a real
 * browser, not unit-tested.
 */
import type { RoomNotifier } from './browser-transport';

export class BroadcastNotifier implements RoomNotifier {
  private readonly channel: BroadcastChannel | null;

  constructor(channelName = 'chowka-bhara') {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  }

  post(gameId: string): void {
    this.channel?.postMessage(gameId);
  }

  subscribe(handler: (gameId: string) => void): () => void {
    const channel = this.channel;
    if (channel === null) return () => {};
    const listener = (event: MessageEvent): void => handler(event.data as string);
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }

  close(): void {
    this.channel?.close();
  }
}
