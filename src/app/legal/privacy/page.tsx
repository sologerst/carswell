export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="rounded-2xl bg-deal-fair/10 px-4 py-3 text-deal-fair">Draft for counsel review (Tennessee Information Protection Act, CCPA-style rights). Not legal advice.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your email, and optionally your name and phone number.</li>
        <li>Your ZIP code. GPS is opt-in and never stored.</li>
        <li>Your preferences, swipes, likes, offers and messages.</li>
        <li>If you sell a car: your verified phone number, the car&apos;s VIN, photos and description.</li>
        <li>Documents you upload to your vault (license, insurance card, proof of income, trade-in title, payoff letter). They are private to you.</li>
        <li>If you ask for a pre-qualification or insurance quote: the amount, term, credit range and optional income you enter. Never your Social Security number.</li>
      </ul>
      <h2>Who sees what</h2>
      <ul>
        <li>Dealers see a buyer dossier (first name, budget, financing, trade-in, timeline, tastes) when you like their car. Your email and phone stay hidden.</li>
        <li>Your email is shared only with the dealer whose offer you pick. Your phone is shared only when you tap &quot;Share phone number&quot;.</li>
        <li>Private sellers see only your first name, ZIP area, timeline and whether you&apos;re paying cash or financing; never your budget, email or phone.</li>
        <li>Vault documents are shared only when you tap share in a chat, as a link that expires in 7 days.</li>
        <li>Your contact details are never included in AI prompts sent about dealers.</li>
        <li>Your data never trains third-party AI models. There are no ad pixels in the signed-in app.</li>
      </ul>
      <h2>Texts and email</h2>
      <p>We only text you for sign-in and verification codes. Lead and outreach emails include a CAN-SPAM footer.</p>
      <h2 id="do-not-sell">Do not sell or share my personal information</h2>
      <p>We do not sell your personal information. Aggregated demand insights shared with dealers never identify you: every number covers at least five buyers. You can export or delete your data anytime from your profile.</p>
    </>
  );
}
