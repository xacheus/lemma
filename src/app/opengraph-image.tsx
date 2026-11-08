import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const alt = 'Lemma Heights Apartments — Furnished Self-Catering Apartments in Lusaka, Zambia';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const AMENITIES = [
  'Backup power during outages',
  'Work-ready Wi-Fi in every unit',
  'Self-catering kitchen',
  'Fresh linen & housekeeping',
  'Gated compound parking',
  'Check-in from 14:00',
];

function logoDataUri(): string | null {
  try {
    const file = path.join(process.cwd(), 'public', 'brand', 'logo.png');
    const bytes = fs.readFileSync(file);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export default function OpenGraphImage() {
  const logo = logoDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 52px',
          backgroundColor: '#0A1E33',
          backgroundImage:
            'linear-gradient(140deg, #081A2B 0%, #11304F 55%, #0A1E33 100%)',
          color: '#FBF9F5',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Brand bar: original supplied logo + name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {logo ? (
              <div
                style={{
                  display: 'flex',
                  width: '84px',
                  height: '84px',
                  borderRadius: '14px',
                  backgroundColor: '#FFFFFF',
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo}
                  alt="Lemma Heights Apartments"
                  width={84}
                  height={84}
                  style={{ objectFit: 'contain' }}
                />
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 600,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: '#FFFFFF',
                }}
              >
                Lemma Heights Apartments
              </span>
              <span
                style={{
                  marginTop: '6px',
                  fontSize: '12px',
                  fontFamily: 'sans-serif',
                  color: '#D9C48F',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                }}
              >
                Barlaston Park · Lusaka, Zambia
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '8px 16px',
              borderRadius: '999px',
              border: '1px solid rgba(217, 196, 143, 0.5)',
              backgroundColor: 'rgba(201, 161, 90, 0.14)',
              color: '#E4CD96',
              fontSize: '12.5px',
              fontFamily: 'sans-serif',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            Book direct · ZMW rates
          </div>
        </div>

        {/* Headline — deliberately compact so the amenity list stays legible */}
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
          <div
            style={{
              fontSize: '36px',
              lineHeight: 1.18,
              fontWeight: 600,
              color: '#FFFFFF',
              letterSpacing: '-0.015em',
              maxWidth: '900px',
            }}
          >
            Furnished apartments in Lusaka, for a night or a month.
          </div>

          {/* The six guest-facing promises — always visible */}
          <div
            style={{
              marginTop: '20px',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: '8px 10px',
              maxWidth: '1000px',
            }}
          >
            {AMENITIES.map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '7px 12px',
                  borderRadius: '999px',
                  border: '1px solid rgba(232, 237, 244, 0.22)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  fontFamily: 'sans-serif',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  color: '#EDEFF3',
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    backgroundColor: '#C9A15A',
                  }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.16)',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            color: '#B9C5D1',
          }}
        >
          <span>Check-in 14:00 · Check-out 10:00</span>
          <span>Airtel Money · MTN MoMo · Bank Transfer · Cash</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
