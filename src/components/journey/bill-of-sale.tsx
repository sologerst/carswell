import { usd } from "@/lib/format";

export interface BillOfSaleData {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  vin: string;
  miles: number;
  color: string | null;
  body: string;
  price: number | null;
  sellerFirstName: string | null;
  buyerFirstName: string | null;
}

/**
 * Private-sale bill of sale template (Phase 3). Plain language, printable.
 * [VERIFY with the Tennessee Department of Revenue whether a state form is
 * required for a given transfer and how odometer disclosure is recorded.]
 */
export function BillOfSale({ d }: { d: BillOfSaleData }) {
  return (
    <article className="bill mx-auto max-w-3xl space-y-6 rounded-3xl border border-line bg-white p-8 text-[#0b1530] print:rounded-none print:border-0 print:p-0">
      <header className="text-center">
        <h1 className="text-2xl font-bold">Motor Vehicle Bill of Sale</h1>
        <p className="text-sm text-[#4a5578]">Private-party sale · State of Tennessee</p>
      </header>

      <section>
        <h2 className="mb-2 font-bold">Vehicle</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <Row k="Year / make / model" v={`${d.year} ${d.make} ${d.model}${d.trim ? ` ${d.trim}` : ""}`} />
            <Row k="Vehicle identification number (VIN)" v={d.vin} mono />
            <Row k="Body style / color" v={`${d.body}${d.color ? ` / ${d.color}` : ""}`} />
            <Row k="Odometer reading (miles)" v={`${d.miles.toLocaleString("en-US")}  (confirm at signing: ______________)`} />
          </tbody>
        </table>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-bold">Sale</h2>
        <p>
          On ____/____/________ (date), the Seller named below sold the vehicle above to the Buyer named below for
          {" "}<strong>{d.price ? usd(d.price) : "$______________"}</strong>{" "}
          (in words: ______________________________________ dollars), paid by ☐ cashier&apos;s check ☐ bank transfer ☐ cash ☐ other: __________.
        </p>
        <p>
          <strong>As-is.</strong> The vehicle is sold as-is, where-is, with no warranty, express or implied, except that the Seller
          warrants that they are the legal owner, that the vehicle is free of liens and encumbrances (or that any lien will be paid and
          released at sale), and that they have the right to sell it.
        </p>
        <p>
          <strong>Odometer disclosure.</strong> The Seller states that, to the best of their knowledge, the odometer reading above
          ☐ reflects the actual mileage ☐ exceeds the mechanical limits ☐ is NOT the actual mileage (warning: odometer discrepancy).
        </p>
        <p><strong>Title.</strong> The Seller will sign the certificate of title over to the Buyer at the time of sale. Title brand, if any: ☐ none ☐ rebuilt ☐ salvage ☐ other: ________.</p>
      </section>

      <section className="grid gap-8 text-sm sm:grid-cols-2">
        <Party role="Seller" firstName={d.sellerFirstName} />
        <Party role="Buyer" firstName={d.buyerFirstName} />
      </section>

      <footer className="border-t border-[#d8dcea] pt-4 text-xs text-[#4a5578]">
        <p>Keep a signed copy each. The buyer titles and registers the car and pays sales tax at the county clerk. [VERIFY with the TN Department of Revenue; some counties require notarization or a state form.]</p>
        <p className="mt-1">Template provided by CarSwipe, an advertising and matching platform, not a party to this sale. Not legal advice.</p>
      </footer>
    </article>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <tr className="border-b border-[#d8dcea]">
      <th scope="row" className="w-1/2 py-2 pr-4 text-left font-normal text-[#4a5578]">{k}</th>
      <td className={mono ? "py-2 font-mono tracking-wider" : "py-2"}>{v}</td>
    </tr>
  );
}

function Party({ role, firstName }: { role: string; firstName: string | null }) {
  return (
    <div className="space-y-4">
      <h2 className="font-bold">{role}</h2>
      <p>Printed full name: {firstName ? <span className="text-[#4a5578]">{firstName} </span> : null}______________________________</p>
      <p>Address: ______________________________________</p>
      <p>______________________________________________</p>
      <p>Driver license # / state: ________________________</p>
      <p className="pt-6">Signature: ____________________________________</p>
    </div>
  );
}
