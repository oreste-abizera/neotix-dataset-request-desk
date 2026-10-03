import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, describeError } from "./api";
import { Card, ErrorText } from "./components";
import type { Role, User } from "./types";

export default function UsersPage({ me }: { me: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "client" as Role, password: "", organisation: "" });

  const load = useCallback(() => {
    api.get<User[]>("/users").then(setUsers).catch((e) => setError(describeError(e)));
  }, []);
  useEffect(load, [load]);

  async function update(id: number, patch: object) {
    try {
      await api.patch(`/users/${id}`, patch);
      setError(null);
      load();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/users", { ...form, organisation: form.role === "client" ? form.organisation || null : null });
      setForm({ email: "", name: "", role: "client", password: "", organisation: "" });
      setError(null);
      load();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <>
      <h1>Users</h1>
      <ErrorText message={error} />
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.is_active ? undefined : "dim"}>
              <td>{u.name}{u.organisation ? ` (${u.organisation})` : ""}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} disabled={u.id === me.id} onChange={(e) => update(u.id, { role: e.target.value })}>
                  <option>client</option><option>operator</option><option>admin</option>
                </select>
              </td>
              <td>{u.is_active ? "yes" : "deactivated"}</td>
              <td>
                {u.id !== me.id && (
                  <button className="link" onClick={() => update(u.id, { is_active: !u.is_active })}>
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Card title="Create user">
        <form onSubmit={create}>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option>client</option><option>operator</option><option>admin</option>
            </select>
          </label>
          {form.role === "client" && (
            <label>Organisation<input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} /></label>
          )}
          <label>Initial password (min 8 characters)
            <input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
          </label>
          <button>Create user</button>
        </form>
      </Card>
    </>
  );
}
