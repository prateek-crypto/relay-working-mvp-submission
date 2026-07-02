const API = "http://localhost:4000/api/v1";

export async function loginDemo() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@relay.dev", password: "password123" })
  });
  return res.json();
}

export async function apiGet(path: string, token: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

export async function apiPost(path: string, token: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}
