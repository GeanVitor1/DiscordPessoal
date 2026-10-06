import React from 'react';
import { AssistanceProvider, useAssistance } from './AssistanceContext';
import { PresentationProvider, usePresentation } from './PresentationContext';

// Web presentation annotations are a separate legacy feature, never OS assistance.
const desktop = Boolean(window.electronAPI?.isDesktop) || /Electron\//.test(navigator.userAgent);
export const InteractionProvider = ({children}) => desktop ? <AssistanceProvider>{children}</AssistanceProvider> : <PresentationProvider>{children}</PresentationProvider>;
export const useInteraction = desktop ? useAssistance : usePresentation;
