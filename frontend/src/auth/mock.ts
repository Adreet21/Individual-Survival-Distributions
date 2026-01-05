export type MockUser = { id: string; username: string; email?: string; displayName: string };

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function mockLogin(username: string, _password: string) {
  await delay();
  const user: MockUser = {
    id: "demo",
    username,
    displayName: username.charAt(0).toUpperCase() + username.slice(1),
    email: `${username}@example.com`,
  };
  return { user };
}

export async function mockRegister(username: string, email: string, _pw1: string, _pw2: string) {
  await delay();
  const user: MockUser = {
    id: "demo",
    username,
    displayName: username.charAt(0).toUpperCase() + username.slice(1),
    email,
  };
  return { user };
}

export async function mockLogout() {
  await delay(200);
  return;
}