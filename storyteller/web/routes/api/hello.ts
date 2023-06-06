export async function handler(): Promise<Response> {
  const response = await fetch(new URL('http://localhost:8000/'), {headers: {'Accepts': 'application/json'}})
  const greeting = await response.json()
  return new Response(JSON.stringify(greeting));
}
