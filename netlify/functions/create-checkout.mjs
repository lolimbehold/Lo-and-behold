// Creates a Stripe Checkout page for a Lo & Behold portrait order.
// Prices are set HERE on the server so nobody can change them in their browser.
// Keep them in sync with SIZES / SECOND_PET_FEE / PEOPLE_FEES in index.html.
// Your Stripe secret key lives in Netlify (Site configuration → Environment variables → STRIPE_SECRET_KEY),
// never in this file.

const SIZES = {
  mini:      { name: '5"×7" Oil Pastel Portrait',  price: 115 },
  classic:   { name: '8"×10" Oil Pastel Portrait', price: 175 },
  statement: { name: '11"×14" Oil Pastel Portrait', price: 250 },
};
const SECOND_PET_FEE = 50;
const PEOPLE_FEES = { 0: 0, 1: 60, 2: 110 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Stripe isn't set up yet" }, 500);

  let order;
  try { order = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const size = SIZES[order.size];
  const pets = Number(order.pets), people = Number(order.people);
  if (!size || ![1, 2].includes(pets) || !(people in PEOPLE_FEES)) return json({ error: "Invalid order" }, 400);

  const clean = (v, n = 200) => String(v ?? "").slice(0, n);
  const origin = new URL(req.url).origin;
  const p = new URLSearchParams();
  let i = 0;
  const line = (name, dollars) => {
    p.append(`line_items[${i}][price_data][currency]`, "usd");
    p.append(`line_items[${i}][price_data][product_data][name]`, name);
    p.append(`line_items[${i}][price_data][unit_amount]`, String(dollars * 100));
    p.append(`line_items[${i}][quantity]`, "1");
    i++;
  };
  line(size.name, size.price);
  if (pets === 2) line("Second pet", SECOND_PET_FEE);
  if (people) line(people === 1 ? "1 person added" : "2 people added", PEOPLE_FEES[people]);

  p.append("mode", "payment");
  p.append("success_url", `${origin}/thank-you.html`);
  p.append("cancel_url", `${origin}/#order`);
  p.append("shipping_address_collection[allowed_countries][]", "US");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email || "")) p.append("customer_email", clean(order.email));
  p.append("metadata[pet_names]", clean(order.petName));
  p.append("metadata[background]", clean(order.background, 60));
  p.append("metadata[pets]", String(pets));
  p.append("metadata[people]", String(people));

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p,
  });
  const data = await r.json();
  if (!r.ok) return json({ error: data?.error?.message || "Stripe error" }, 502);
  return json({ url: data.url });
};
