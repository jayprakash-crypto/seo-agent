import { getCookie } from "./utils";

export async function proxyFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  const token = getCookie("seo-token");
  headers.set("authorization", `Bearer ${token}`);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const clonedResponse = response.clone();
  const cloneBody = await clonedResponse.json();

  if (cloneBody.logout) {
    document.cookie = "seo-token=; path=/; max-age=0";
    setTimeout(() => {
      document.location.replace("/login");
    }, 2000);
  }

  return response;
}
