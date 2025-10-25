import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type Transaction = {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
  balance_after: number;
};

export default function Profile() {
  const { user, balance } = useMe();
  const [username, setUsername] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchTransactions();
    }
  }, [user]);

  async function fetchProfile() {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .single();
    if (data) setUsername(data.username || "");
  }

  async function fetchTransactions() {
    if (!user) return;
    const { data } = await supabase.rpc("recent_transactions", {
      p_user_id: user.id,
      p_limit: 25,
    });
    if (data) setTransactions(data);
  }

  async function updateUsername() {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Username updated" });
    }
  }

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <Button onClick={updateUsername}>Update Username</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet: {balance.toFixed(2)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground">No transactions</p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded border border-border p-3 text-sm"
                >
                  <div>
                    <div className="font-semibold">{tx.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-semibold ${
                        tx.amount >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Balance: {tx.balance_after.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
