const API = "http://localhost:4000/api/v1";

type ApiError = {
  error: string;
  status?: number;
};

async function parseJson(res: Response) {
  const text = await res.text();

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Invalid JSON response" };
  }

  if (!res.ok) {
    return {
      ...data,
      error: data?.error || `Request failed with status ${res.status}`,
      status: res.status
    } as ApiError;
  }

  return data;
}

export async function loginDemo() {
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "demo@relay.dev",
        password: "password123"
      })
    });

    return await parseJson(res);
  } catch (error: any) {
    return {
      error: error?.message || "Unable to connect to API"
    };
  }
}

export async function apiGet(path: string, token: string) {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return await parseJson(res);
  } catch (error: any) {
    return {
      error: error?.message || "GET request failed"
    };
  }
}

export async function apiPost(path: string, token: string, body?: unknown) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    return await parseJson(res);
  } catch (error: any) {
    return {
      error: error?.message || "POST request failed"
    };
  }
}

export async function apiPatch(path: string, token: string, body?: unknown) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    return await parseJson(res);
  } catch (error: any) {
    return {
      error: error?.message || "PATCH request failed"
    };
  }
}

export async function apiDelete(path: string, token: string) {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return await parseJson(res);
  } catch (error: any) {
    return {
      error: error?.message || "DELETE request failed"
    };
  }
}