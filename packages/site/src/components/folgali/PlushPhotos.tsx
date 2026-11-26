'use client'

import { createContext, useContext } from 'react'
import { plushPhotoFor } from '@/lib/folgali/plush-photos'

const PlushPhotosOn = createContext(false)

/** Turns on the photographed plush portraits (demonstration only). */
export function PlushPhotoProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <PlushPhotosOn.Provider value={enabled}>{children}</PlushPhotosOn.Provider>
}

/** The photographed portrait for this name, when the demonstration has one. */
export function usePlushPhoto(name: string): string | null {
  return useContext(PlushPhotosOn) ? plushPhotoFor(name) : null
}
