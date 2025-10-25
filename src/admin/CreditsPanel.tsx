import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";

type User = {
  id: string;
  username: string;
};

type Transaction = {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
  balance_after: number;
};

export default function CreditsPanel() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  async function searchUsers() {
    if (!query.trim()) return;

    const { data } = await supabase.rpc("search_users", { p_query: query });
    if (data) setUsers(data);
  }

  async function selectUser(user: User) {
    setSelectedUser(user);
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    if (wallet) setBalance(Number(wallet.balance));

    const { data: txs } = await supabase.rpc("recent_transactions", {
      p_user_id: user.id,
      p_limit: 25,
    });
    if (txs) setTransactions(txs);
  }

  async function topUp() {
    if (!selectedUser || amount <= 0) return;

    const reqId = uuidv4();
    const { error } = await supabase.rpc("admin_top_up", {
      p_user_id: selectedUser.id,
      p_amount: amount,
      p_reason: "ADMIN_TOPUP",
      p_request_id: reqId,
    });

    if (error) {
      toast({ title: "Top-up failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Top-up successful" });
      setAmount(0);
      selectUser(selectedUser);
    }
  }

  async function debit() {
    if (!selectedUser || amount <= 0) return;

    const reqId = uuidv4();
    const { error } = await supabase.rpc("admin_debit", {
      p_user_id: selectedUser.id,
      p_amount: amount,
      p_reason: "ADMIN_DEBIT",
      p_request_id: reqId,
    });

    if (error) {
      toast({ title: "Debit failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Debit successful" });
      setAmount(0);
      selectUser(selectedUser);
    }
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by email or username"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button onClick={searchUsers}>Search</Button>
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                onClick={() => selectUser(u)}
                className="cursor-pointer rounded border border-border p-3 hover:bg-muted"
              >
                {u.username} ({u.id.slice(0, 8)})
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedUser && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedUser.username} - Balance: {balance.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={topUp} className="flex-1">
                  Top Up
                </Button>
                <Button onClick={debit} variant="destructive" className="flex-1">
                  Debit
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {transactions.map((tx) => (
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
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
