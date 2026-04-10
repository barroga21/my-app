"use client";

import { useEffect, useState } from "react";

export function resolveAuthBootstrapState({ user, allowGuest }) {
  const uid = user?.id || null;
  const shouldRedirect = !uid && !allowGuest;
  return {
    authReady: !shouldRedirect,
    userId: uid,
    user: user || null,
    shouldRedirect,
  };
}

export function resolveAuthSessionState({ sessionUser, allowGuest }) {
  const nextUser = sessionUser || null;
  const nextUserId = nextUser?.id || null;
  return {
    user: nextUser,
    userId: nextUserId,
    shouldRedirect: !nextUserId && !allowGuest,
  };
}

export function useAuthBootstrap({ supabase, router = null, redirectTo = "/login", allowGuest = false }) {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let unsubscribe = null;

    async function bootstrap() {
      if (!supabase) {
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const resolved = resolveAuthBootstrapState({
        user: data?.user || null,
        allowGuest,
      });

      if (resolved.shouldRedirect) {
        router?.replace?.(redirectTo);
        return;
      }

      setUserId(resolved.userId);
      setUser(resolved.user);
      setAuthReady(resolved.authReady);

      const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
        const next = resolveAuthSessionState({
          sessionUser: session?.user || null,
          allowGuest,
        });
        setUser(next.user);
        setUserId(next.userId);
        if (next.shouldRedirect) {
          router?.replace?.(redirectTo);
        }
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    }

    bootstrap();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [allowGuest, redirectTo, router, supabase]);

  return { authReady, userId, user };
}
