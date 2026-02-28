import Head from 'next/head'
import styles from '../styles/Privacy.module.css'

export default function Privacy() {
  return (
    <>
      <Head>
        <title>FuelAlerts — Privacy Policy</title>
        <meta name="description" content="FuelAlerts privacy policy" />
      </Head>
      <div className={styles.page}>
        <nav className={styles.nav}>
          <a href="/" className={styles.logo}>
            <span>⛽</span>
            <span className={styles.logoText}>FuelAlerts</span>
          </a>
        </nav>

        <div className={styles.container}>
          <div className={styles.card}>
            <h1>Privacy Policy</h1>
            <p className={styles.updated}>Last updated: February 2026</p>

            <section>
              <h2>Who we are</h2>
              <p>FuelAlerts is a free UK fuel price alert service. We send weekly email digests showing the cheapest fuel stations near your postcode. This service is operated as a personal project and is not affiliated with any fuel retailer or government body.</p>
            </section>

            <section>
              <h2>What data we collect</h2>
              <p>When you subscribe to FuelAlerts, we collect and store:</p>
              <ul>
                <li>Your email address</li>
                <li>Your postcode (and the latitude/longitude derived from it)</li>
                <li>Your fuel type preference (petrol, diesel, or both)</li>
                <li>Your preferred search radius</li>
                <li>Optionally: your vehicle registration, annual mileage, MPG, and tank size — only if you choose to provide them</li>
                <li>The date and time you subscribed and confirmed your email</li>
              </ul>
            </section>

            <section>
              <h2>How we use your data</h2>
              <p>We use your data solely to:</p>
              <ul>
                <li>Send you weekly fuel price alerts relevant to your location and fuel type</li>
                <li>Calculate estimated savings based on your vehicle details (if provided)</li>
                <li>Send a one-time confirmation email when you subscribe</li>
              </ul>
              <p>We do not use your data for any other purpose. We do not sell, share, or pass your data to any third parties for marketing purposes.</p>
            </section>

            <section>
              <h2>Legal basis for processing</h2>
              <p>We process your personal data on the basis of your consent, given when you subscribe and confirm your email address. You can withdraw this consent at any time by unsubscribing.</p>
            </section>

            <section>
              <h2>Third party services</h2>
              <p>We use the following third-party services to operate FuelAlerts:</p>
              <ul>
                <li><strong>Supabase</strong> — for secure database storage of subscriber data (servers located in the EU)</li>
                <li><strong>Brevo</strong> — for sending transactional and marketing emails</li>
                <li><strong>Vercel</strong> — for hosting the FuelAlerts website</li>
                <li><strong>postcodes.io</strong> — to convert your postcode to coordinates (no personal data is stored by this service)</li>
                <li><strong>UK Government Fuel Finder API</strong> — as the source of fuel price data</li>
              </ul>
            </section>

            <section>
              <h2>How long we keep your data</h2>
              <p>We retain your data for as long as your subscription is active. If you unsubscribe, your data is marked as inactive. You can request complete deletion of your data at any time by emailing us.</p>
            </section>

            <section>
              <h2>Your rights</h2>
              <p>Under UK GDPR, you have the right to:</p>
              <ul>
                <li>Access the personal data we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Withdraw consent at any time by unsubscribing</li>
                <li>Lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk</li>
              </ul>
            </section>

            <section>
              <h2>Cookies</h2>
              <p>FuelAlerts does not use tracking cookies. We do not use Google Analytics or any third-party tracking scripts.</p>
            </section>

            <section>
              <h2>Contact</h2>
              <p>For any privacy-related questions or data requests, please email: <a href="mailto:jamessking76@gmail.com">jamessking76@gmail.com</a></p>
            </section>
          </div>
        </div>

        <footer className={styles.footer}>
          <a href="/">← Back to FuelAlerts</a>
        </footer>
      </div>
    </>
  )
}
