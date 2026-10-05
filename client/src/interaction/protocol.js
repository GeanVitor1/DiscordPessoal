/**
 * State machine states for InteractionSession
 */
export const SessionState = Object.freeze({
  Created: 'Created',
  WaitingForConsent: 'WaitingForConsent',
  Authorized: 'Authorized',
  Active: 'Active',
  Revoked: 'Revoked',
  Finished: 'Finished'
});

/**
 * Supported interaction event types
 */
export const InteractionEventType = Object.freeze({
  TextInput: 'TextInput',
  PointerMove: 'PointerMove',
  PointerDown: 'PointerDown',
  PointerUp: 'PointerUp',
  Scroll: 'Scroll',
  KeyPressed: 'KeyPressed',
  KeyReleased: 'KeyReleased'
});

/**
 * Creates a normalized interaction event packet
 */
export function createInteractionEvent({
  sessionId,
  participantId,
  token,
  sequence,
  eventType,
  payload,
  targetId = 'default',
  timestamp = Date.now()
}) {
  return {
    sessionId,
    participantId,
    token,
    sequence,
    timestamp,
    eventType,
    targetId,
    payload
  };
}
