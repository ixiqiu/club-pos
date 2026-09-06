/// <reference types="vite/client" />
import type { ClubPosApi } from '../../shared/types'

declare global {
  interface Window {
    clubpos: ClubPosApi
  }
}

export {}
