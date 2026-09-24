// ADF (Auto-lead Data Format) 1.0 XML for dealers without an inbox login.
// The customer email is a relay address; the buyer's real email never leaves us.

export interface AdfLead {
  id: string;
  requestDate: Date;
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string | null;
    vin: string;
    stock?: string | null;
    price: number;
    condition: "new" | "used" | "cpo";
    miles?: number | null;
  };
  customer: {
    firstName: string | null;
    relayEmail: string;
    zip?: string | null;
    comments: string;
  };
  dealerName: string;
  provider: { name: string; url: string; email?: string };
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const tag = (name: string, value: string | number | null | undefined, attrs = "") =>
  value === null || value === undefined || value === "" ? "" : `<${name}${attrs ? ` ${attrs}` : ""}>${escapeXml(String(value))}</${name}>`;

export function buildAdfXml(lead: AdfLead): string {
  const v = lead.vehicle;
  const status = v.condition === "new" ? "new" : "used";
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<?adf version="1.0"?>`,
    `<adf>`,
    `  <prospect status="new">`,
    `    ${tag("id", lead.id, `sequence="1" source="${escapeXml(lead.provider.name)}"`)}`,
    `    ${tag("requestdate", lead.requestDate.toISOString())}`,
    `    <vehicle interest="buy" status="${status}">`,
    `      ${tag("year", v.year)}`,
    `      ${tag("make", v.make)}`,
    `      ${tag("model", v.model)}`,
    v.trim ? `      ${tag("trim", v.trim)}` : "",
    `      ${tag("vin", v.vin)}`,
    v.stock ? `      ${tag("stock", v.stock)}` : "",
    v.miles !== null && v.miles !== undefined ? `      ${tag("odometer", v.miles, `status="original" units="miles"`)}` : "",
    `      ${tag("price", Math.round(v.price), `type="asking" currency="USD"`)}`,
    `    </vehicle>`,
    `    <customer>`,
    `      <contact>`,
    `        ${tag("name", lead.customer.firstName ?? "CarSwipe buyer", `part="first"`)}`,
    `        ${tag("email", lead.customer.relayEmail)}`,
    lead.customer.zip ? `        <address>${tag("postalcode", lead.customer.zip)}</address>` : "",
    `      </contact>`,
    `      ${tag("comments", lead.customer.comments)}`,
    `    </customer>`,
    `    <vendor>`,
    `      ${tag("vendorname", lead.dealerName)}`,
    `    </vendor>`,
    `    <provider>`,
    `      ${tag("name", lead.provider.name, `part="full"`)}`,
    `      ${tag("url", lead.provider.url)}`,
    lead.provider.email ? `      ${tag("email", lead.provider.email)}` : "",
    `    </provider>`,
    `  </prospect>`,
    `</adf>`,
  ];
  return lines.filter((l) => l.trim() !== "").join("\n");
}

/** Relay address that routes a dealer's reply back to the right lead. */
export function relayAddress(interestId: string, domain: string): string {
  return `lead-${interestId.replace(/-/g, "")}@${domain}`;
}

/** Inverse of relayAddress; returns the interest id or null. */
export function parseRelayAddress(address: string): string | null {
  const m = /lead-([0-9a-f]{32})@/i.exec(address);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
