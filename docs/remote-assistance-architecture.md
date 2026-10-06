# Remote assistance, version 2

## Investigation

The previous desktop implementation did **not** reuse screen-sharing SDP events, PeerConnection, DataChannel, or session IDs. `RealtimeTransport` already created an interaction-only connection and `NativeDesktopInteractionTarget` already called the Windows helper. A canvas cursor was used only by the web presentation mode.

However, desktop assistance was coupled to a screen broadcast in four places:

- `server/src/realtime.js` required `isScreenSharing`, `canAssist`, and the `viewers` relationship to grant consent and relay every interaction packet. Ending a share/view or selecting another broadcast revoked the grant.
- The former `InteractionContext` required `useVoice` sharing/watching state and the shared display source. It revoked assistance when the screen/voice lifecycle changed.
- `VoiceContext` stopped native authorization directly when stopping screen sharing.
- `InteractionSurface` wrapped the broadcast video and obtained its coordinate aspect ratio from that video.

This proves a lifecycle/authorization coupling and explains teardown and stream-selection failures. It does **not** prove that every `IPC_REJECTED` or `DESKTOP_UNAVAILABLE` seen on the two actual PCs came from that coupling. `IPC_REJECTED` was the catch-all for a false IPC response; scroll even discarded a failed MOVE acknowledgement and replaced it with `false`. The helper separately tests the Windows input desktop and process integrity. Exact errors must be retained to distinguish those causes.

Windows documents [SendInput's integrity restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput) and [OpenInputDesktop's error/session behavior](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openinputdesktop). The refactor does not bypass the lock screen, secure desktop, or UAC; administrator access still requires a local choice and Windows approval.

## Independent systems

| Resource | Screen sharing | Desktop assistance v2 |
| --- | --- | --- |
| Owner | `VoiceContext` | `AssistanceContext` |
| Server state | broadcast flags and viewers | `createAssistanceSignaling` sessions and capabilities |
| Signaling | `screen_offer`, `screen_answer`, `screen_ice_candidate` | `assistance_signal_offer`, `assistance_signal_answer`, `assistance_signal_ice` |
| Video | existing capture and screen-only PC | fresh monitor capture, carried by assistance's own PC |
| Input transport | none | `assistance_dc`, optionally `assistance_event` while assistance video remains connected |
| Session/grant | no OS authorization | unique assistance UUID and server-generated token, authenticated host/guest sockets |
| View | ordinary stream video/audio | persistent `AssistancePanel`, assistance-only video and input surface |
| Coordinates | no native input | normalized coordinates of the explicitly consented monitor; host maps to physical Windows pixels |
| Stop | stops broadcast/view resources | revokes native grant, releases held inputs, stops assistance capture and connection |

The UI can request assistance while watching a stream, or directly from an available desktop participant's card. The host chooses the assistance monitor independently, then approves native control. Assistance may target a different monitor from the broadcast, including when the broadcast is a window. The helper is activated using the server-issued token before the host sends `assistance_ready`; only then does the guest negotiate its own connection. Input is enabled only after the assistance video has frames and its authenticated control channel is ready.

`assistance_capabilities` declares protocol support; it is neither consent nor a trusted user identity. Shared channel membership is only a discovery/admission check for requesting assistance. An accepted grant is bound to the two authenticated live sockets and remains independent of channel membership, broadcasts, and viewers. User IDs and request labels come from server-authenticated accounts. Blocking, socket loss, explicit stop, timeout, monitor removal, capture loss, and native failure terminate assistance. A closed control channel releases control; reconnect never restores consent automatically.

The initial negotiation has a bounded 20-second window, with a bounded native preparation/connection grace period. Once peer heartbeats begin, the native grant requires fresh heartbeats within 6.5 seconds. Renderer existence alone never renews authorization.

`RealtimeTransport`, ICE helpers and `CoordinateMapper` are reusable code, not shared runtime resources. Every assistance creates its own instances/connection. The assistance monitor descriptor supplies its aspect ratio; the transmission video never supplies desktop input coordinates.

Legacy `interaction_*` is retained for previous installed clients and web presentation annotations. The web-only provider is explicitly `PresentationContext`; it cannot inject OS input. Legacy and v2 grants exclude one another so an older client cannot contend for the same participant. New desktop clients do not silently downgrade to legacy control. Until the backend implements v2, they report/withhold independent assistance.

## Validation

`tests/assistance.test.js` tests authenticated request labels, unapproved/forged signaling, tokens, room admission, screen/view/channel teardown independence, disconnection, and native rejection reasons. `tests/desktop-two-client.js` uses two isolated packaged profiles, an isolated backend/database, fresh desktop capture, and the packaged Windows helper constrained to an owned fixture window. It verifies separate connections/tracks/video elements, native mouse/buttons/drag/scroll/keyboard, release on stop, continued screen/audio after assistance ends, continued native input after screen/view teardown, and no consent restoration after connection loss.

The acceptance report is `docs/validation/two-desktops.json`. Synthetic microphone/shortcut/wheel events and substituted native consent exist only in the test processes. Two physical PCs, external NAT/TURN, secure-desktop transitions, and real UAC prompts require separate physical acceptance; AnyDesk's presence is not evidence that these flows passed.

Publishing the desktop assets and deploying the new backend are distinct operations. Source is pushed to a release branch to avoid an implicit backend deployment; the backend deployment requires the user's explicit approval under `AGENTS.md`.
