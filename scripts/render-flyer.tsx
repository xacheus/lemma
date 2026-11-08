/**
 * One-off renderer for the square Lemma Heights Apartments flyer.
 * Usage: TSX_TSCONFIG_PATH=/tmp/flyer/tsconfig.json npx tsx scripts/render-flyer.tsx
 * Writes public/brand/lemma-heights-flyer.png (1080×1080).
 */
import React from 'react';
import { ImageResponse } from 'next/og';
import fs from 'node:fs';

const logo =
  'data:image/png;base64,' + fs.readFileSync('public/brand/logo.png').toString('base64');

const AMENITIES = [
  'Backup power during outages',
  'Work-ready Wi-Fi in every unit',
  'Self-catering kitchen',
  'Fresh linen & housekeeping',
  'Gated compound parking',
  'Check-in from 14:00',
];

const glow =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><defs><radialGradient id="g" cx="72%" cy="18%" r="60%"><stop offset="0%" stop-color="#C9A15A" stop-opacity="0.34"/><stop offset="100%" stop-color="#C9A15A" stop-opacity="0"/></radialGradient></defs><rect width="900" height="900" fill="url(#g)"/></svg>`,
  );

function CheckBadge() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" style={{ flexShrink: 0 }}>
      <circle cx="15" cy="15" r="15" fill="#C9A15A" />
      <path
        d="M8.8 15.6l4.3 4.2 8.1-9.6"
        stroke="#0F2B46"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

const element = (
  <div
    style={{
      width: '1080px',
      height: '1080px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '58px 66px 46px',
      backgroundColor: '#0B2033',
      backgroundImage: 'linear-gradient(152deg, #0C2338 0%, #133252 50%, #0B2033 100%)',
      color: '#FBF9F5',
      fontFamily: 'sans-serif',
      position: 'relative',
    }}
  >
    {/* soft gold glow, top-right */}
    <img
      src={glow}
      width={720}
      height={720}
      alt=""
      style={{ position: 'absolute', top: -80, right: -80, opacity: 0.9 }}
    />

    {/* ── Brand row ─────────────────────────────────────────── */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '30px', position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          width: '150px',
          height: '150px',
          borderRadius: '24px',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 14px 44px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* original supplied logo, unmodified */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="Lemma Heights Apartments" width={134} height={134} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span
          style={{
            fontSize: '25px',
            fontWeight: 800,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: '#FFFFFF',
            lineHeight: 1.25,
            maxWidth: '560px',
          }}
        >
          Lemma Heights Apartments
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#D9C48F',
          }}
        >
          Barlaston Park · Lusaka, Zambia
        </span>
      </div>
    </div>

    {/* ── Middle: headline + promises, vertically centred ───── */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', flexGrow: 1, justifyContent: 'center', position: 'relative' }}>
      <span
        style={{
          fontSize: '14px',
          fontWeight: 800,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: '#C9A15A',
        }}
      >
        Self-catering furnished stays
      </span>
      <div
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '46px',
          lineHeight: 1.2,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: '#FFFFFF',
          maxWidth: '880px',
        }}
      >
        Furnished apartments in Lusaka — for a night, or a month.
      </div>
      <div style={{ fontSize: '16.5px', lineHeight: 1.45, color: '#C9D2DE', maxWidth: '820px' }}>
        Private kitchens, backup power and work-ready Wi-Fi, booked directly with reception and
        quoted in Zambian Kwacha.
      </div>

    {/* ── The six guest-facing promises ─────────────────────── */}
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '14px 18px',
      }}
    >
      {AMENITIES.map((label) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '13px',
            width: '463px',
            padding: '15px 18px',
            borderRadius: '18px',
            backgroundColor: 'rgba(255, 255, 255, 0.055)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <CheckBadge />
          <span style={{ fontSize: '18.5px', fontWeight: 600, color: '#EDEFF3', lineHeight: 1.25 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
    </div>

    {/* ── Reservation strip ─────────────────────────────────── */}
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        borderTop: '1px solid rgba(217, 196, 143, 0.35)',
        paddingTop: '22px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: '#D9C48F',
            }}
          >
            Reservations &amp; enquiries
          </span>
          <span style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF' }}>
            +260 574 556 207
          </span>
          <span style={{ fontSize: '13px', color: '#C9D2DE' }}>
            lemmaheights@gmail.com · WhatsApp +260 574 556 207
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: '#D9C48F',
            }}
          >
            Rates
          </span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>Zambian Kwacha</span>
          <span style={{ fontSize: '13px', color: '#C9D2DE' }}>Airtel Money · MTN MoMo · Bank · Cash</span>
        </div>
      </div>
      <div
        style={{
          fontSize: '11px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: '#8CA0B4',
          paddingTop: '6px',
        }}
      >
        Lemma Heights Apartments · Barlaston Park · Lusaka, Zambia
      </div>
    </div>
  </div>
);

async function main() {
  const response = new ImageResponse(element, { width: 1080, height: 1080 });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync('public/brand/lemma-heights-flyer.png', buffer);
  console.log('wrote public/brand/lemma-heights-flyer.png', buffer.length, 'bytes');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
