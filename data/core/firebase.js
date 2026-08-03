import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import { firebaseConfig } from '../../config.js';
import {
  FIXTURE_USER,
  fixtureActive,
  installFixtureSession,
  loadFixtureStore,
} from './fixtures.js';

let app = null;
let auth = null;
export let firestoreDb = null;
export let currentUser = null;

const listeners = new Set();

export const sessionCache = {
  accounts: null,
  categories: null,
  appSettings: null,
  appSettingsPromise: null,
};

export async function initFirebase(onSessionChange) {
  // FIXTURE 모드(E2E 전용): Firebase 초기화·onAuthStateChanged 로그인 흐름을
  // 완전히 우회한다. store 를 세션 캐시에 주입하고 FIXTURE_USER 로 세션을 세운다.
  // Firestore 로더(onSessionChange)는 호출하지 않는다 — 캐시가 이미 채워졌고,
  // repositories 의 읽기는 각자 fixture 분기로 인메모리 store 를 돌려준다.
  if (fixtureActive()) {
    const store = await loadFixtureStore();
    currentUser = FIXTURE_USER;
    installFixtureSession(sessionCache, store);
    listeners.forEach(listener => listener(currentUser));
    return;
  }

  if (!app) {
    app = initializeApp(firebaseConfig);
    // IndexedDB 영속 캐시: 연결이 느리거나 끊긴 상태의 쓰기가 앱을 껐다 켜도
    // 큐에 남았다가 온라인이 되면 자동 반영된다. 기본 메모리 캐시에서는 서버
    // ack 전에 탭을 닫으면 그 쓰기가 통째로 사라졌다(와인 기록 유실 사고).
    // 프라이빗 모드 등 IndexedDB 불가 환경이면 기존 메모리 캐시로 내려간다.
    try {
      firestoreDb = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (error) {
      console.warn('[data:firestore-cache] 영속 캐시 사용 불가, 메모리 캐시로 동작', error);
      firestoreDb = getFirestore(app);
    }
    auth = getAuth(app);
  }

  await new Promise((resolve, reject) => {
    let initial = true;
    onAuthStateChanged(auth, async (user) => {
      try {
        currentUser = user;
        resetSessionCache(user);
        await onSessionChange?.(user);
        listeners.forEach(listener => listener(user));
        if (initial) {
          initial = false;
          resolve();
        }
      } catch (error) {
        if (initial) {
          initial = false;
          reject(error);
        } else {
          console.error('[data:auth-state]', error);
        }
      }
    });
  });
}

export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  currentUser = credential.user;
  return currentUser;
}

export async function signOut() {
  await firebaseSignOut(auth);
  currentUser = null;
}

export function getCurrentUser() {
  return currentUser;
}

export function getUid() {
  return currentUser?.uid;
}

export function scope() {
  if (!currentUser) throw new Error('로그인 필요');
  return currentUser.uid;
}

function resetSessionCache(user) {
  sessionCache.appSettings = null;
  sessionCache.appSettingsPromise = null;
  if (!user) {
    sessionCache.accounts = null;
    sessionCache.categories = null;
  }
}
