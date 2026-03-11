import { useEffect, useRef } from 'react';

const SSE_URL = 'https://colegio-emanuel-api.fly.dev/api/events';
const IS_CAPACITOR = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;

export function useAutoRefresh(fn) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    let debounce;
    const tick = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => fnRef.current(), 200);
    };

    // SSE — fires immediately when server broadcasts any change
    let es;
    let retryTimeout;
    let everConnected = false;

    const connect = () => {
      try {
        es = new EventSource(SSE_URL);
        es.onopen = () => {
          if (everConnected) tick(); // reconnected after drop → refresh to catch missed events
          everConnected = true;
        };
        es.onmessage = tick;
        es.onerror = () => {
          es.close();
          retryTimeout = setTimeout(connect, 5000);
        };
      } catch { /* SSE not supported */ }
    };

    connect();

    // Page visibility — refresh when user returns to the tab/app
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);

    // Capacitor: listen for app coming to foreground — more reliable than visibilitychange on Android
    let removeAppListener;
    if (IS_CAPACITOR) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          tick();
          // Reconnect SSE if it dropped while backgrounded
          if (!es || es.readyState === EventSource.CLOSED) {
            clearTimeout(retryTimeout);
            connect();
          }
        }).then(handle => { removeAppListener = () => handle.remove(); });
      }).catch(() => {});
    }

    return () => {
      clearTimeout(retryTimeout);
      clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVisible);
      es?.close();
      removeAppListener?.();
    };
  }, []);
}
