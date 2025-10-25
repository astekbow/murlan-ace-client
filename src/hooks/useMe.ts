import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export function useMe() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            checkAdmin(session.user.id);
            fetchBalance(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setBalance(0);
        }
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdmin(session.user.id);
        fetchBalance(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Subscribe to wallet changes
    const channel = supabase
      .channel(`wallet-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object" && "balance" in payload.new) {
            setBalance(Number(payload.new.balance) || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function checkAdmin(userId: string) {
    try {
      const { data, error } = await supabase.rpc("is_admin", {
        p_user: userId,
      });
      if (!error && data) {
        setIsAdmin(true);
      }
    } catch (err) {
      console.error("Admin check failed:", err);
    }
  }

  async function fetchBalance(userId: string) {
    try {
      const { data, error } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single();

      if (!error && data) {
        setBalance(Number(data.balance) || 0);
      }
    } catch (err) {
      console.error("Balance fetch failed:", err);
    }
  }

  return { user, isAdmin, balance, loading };
}
