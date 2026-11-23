const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.example.com";

export async function apiGet(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
