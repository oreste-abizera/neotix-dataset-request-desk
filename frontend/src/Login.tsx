import { FormEvent, useState } from "react";
import { api, describeError } from "./api";
import { Card, ErrorText } from "./components";
import type { User } from "./types";

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.post<User>("/auth/login", { email, password }));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <h1>Dataset Request Desk</h1>
      <Card title="Sign in">
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <ErrorText message={error} />
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </Card>
    </main>
  );
}
