// ================================================================
// config.js — Firebase 클라이언트 SDK config
// data.js가 CDN으로 firebase SDK를 로드하므로 여기서는 config 객체만 export.
// ================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyC1dgxRx4ka6i3tZNrJLXYurB3aRj4uHxs",
  authDomain: "bduget-1b16f.firebaseapp.com",
  projectId: "bduget-1b16f",
  storageBucket: "bduget-1b16f.firebasestorage.app",
  messagingSenderId: "407009121664",
  appId: "1:407009121664:web:6d11c6b9db54681e08dd65",
  measurementId: "G-GMPHXQN39W"
};

// Public Vercel API bridge origin. Example: "https://budget-api.vercel.app"
// Keep blank to use GitHub Pages/static fallback only.
export const apiBaseUrl = "https://budget-snowy-iota.vercel.app";
