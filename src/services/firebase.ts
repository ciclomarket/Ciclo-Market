// src/services/firebase.ts
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Habilitado solo si hay apiKey válida
export const firebaseEnabled =
  !!cfg.apiKey && typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 0

let app: FirebaseApp | null = null
export let auth: Auth | null = null
export let db: Firestore | null = null
export let storage: FirebaseStorage | null = null
export let googleProvider: GoogleAuthProvider | null = null

if (firebaseEnabled) {
  app = initializeApp(cfg)

  auth = getAuth(app)

  // 👇 Fix: forzar long polling (auto-detect). Si persiste, cambia a experimentalForceLongPolling: true
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    // experimentalForceLongPolling: true, // ← si el 400 sigue, descomentá esta línea y quitá la de arriba
    ignoreUndefinedProperties: true
  })

  storage = getStorage(app)
  googleProvider = new GoogleAuthProvider()
}