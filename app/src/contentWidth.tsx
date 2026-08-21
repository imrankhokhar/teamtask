import React, { createContext, useContext } from 'react';

/** Measured width of AppShell main content (excludes sidebar). */
export const ContentWidthContext = createContext(0);

export function useContentWidth() {
  return useContext(ContentWidthContext);
}
